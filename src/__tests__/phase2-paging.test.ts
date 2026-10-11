import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  clampPage,
  pageResponse,
  parsePage,
  totalPagesFor,
} from "../lib/paged";
import { PAGE_SIZE } from "../lib/constants";
import { invalidationFor } from "../lib/cache-invalidation";

const src = (p: string) =>
  readFileSync(new URL(p, import.meta.url), "utf8");

function fnBody(file: string, name: string): string {
  const start = file.indexOf(`export async function ${name}`);
  assert.ok(start >= 0, `${name} present`);
  const next = file.indexOf("export async function", start + 10);
  const chunk = file.slice(start, next < 0 ? undefined : next);
  // Also swallow following non-export helpers? No — Page fns are
  // self-contained; the next export boundary is exact.
  return chunk;
}

describe("paged envelope edges (PAGE_SIZE = 15)", () => {
  it("PAGE_SIZE is 15", () => {
    assert.strictEqual(PAGE_SIZE, 15);
  });
  it("0 rows: 1 empty page, page clamps to 1", () => {
    assert.strictEqual(totalPagesFor(0), 1);
    assert.strictEqual(clampPage(1, 0), 1);
    assert.strictEqual(clampPage(999, 0), 1);
    const e = pageResponse([], 0, 1);
    assert.deepStrictEqual([e.rows, e.data, e.total, e.page, e.totalPages], [[], [], 0, 1, 1]);
  });
  it("exactly 15 rows: single page", () => {
    const rows = Array.from({ length: 15 }, (_, i) => i);
    assert.strictEqual(totalPagesFor(15), 1);
    const e = pageResponse(rows, 15, 1);
    assert.strictEqual(e.rows.length, 15);
    assert.strictEqual(e.totalPages, 1);
  });
  it("16 rows: last page holds exactly 1 row", () => {
    assert.strictEqual(totalPagesFor(16), 2);
    const full = Array.from({ length: 16 }, (_, i) => i);
    const p2 = pageResponse(full.slice(15), 16, 2);
    assert.deepStrictEqual(p2.rows, [15]);
    assert.strictEqual(p2.page, 2);
    assert.strictEqual(p2.totalPages, 2);
  });
  it("out-of-range page clamps (never empty-blind)", () => {
    assert.strictEqual(clampPage(999, 30), 2);
    assert.strictEqual(clampPage(0, 30), 1);
    assert.strictEqual(clampPage(-4, 30), 1);
    assert.strictEqual(pageResponse([], 30, 999).page, 2);
    assert.strictEqual(pageResponse([], 30, 0).page, 1);
  });
  it("parsePage pins into 1..1000", () => {
    assert.strictEqual(parsePage(0), 1);
    assert.strictEqual(parsePage(9999), 1000);
    assert.strictEqual(parsePage("5"), 5);
  });
});

describe("super-admin Page readers: windowed, counted, keyed per filter set", () => {
  const browse = src("../app/super-admin/browse/actions.ts");
  for (const [fn, ns] of [
    ["browseDeliveriesPage", "super-admin:deliveries-page"],
    ["browseInspectionsPage", "super-admin:inspections-page"],
    ["browseIssuancesPage", "super-admin:issuances-page"],
    ["browseRequestsPage", "super-admin:requests-page"],
  ] as const) {
    it(`${fn}: scoped window cache keyed by page+filters (30s)`, () => {
      const body = fnBody(browse, fn);
      assert.match(body, new RegExp(`withScopedCache\\('${ns}', 30`));
      assert.match(body, /\}, \{ page, pageSize, q \}\)/);
    });
    it(`${fn}: fixed PAGE_SIZE window + exact total envelope`, () => {
      const body = fnBody(browse, fn);
      assert.match(body, /const pageSize = PAGE_SIZE/);
      assert.match(body, /pageResponse\(rows, r\.total, page, pageSize\)/);
      // No bulk ROW takes: the only take above the window is the bounded
      // audit-log enrichment scan (indexed, mapped onto the 15-row window).
      for (const m of body.matchAll(/take:\s*(\d+)/g)) {
        const n = Number(m[1]);
        const line = body.slice(Math.max(0, (m.index ?? 0) - 200), (m.index ?? 0) + 20);
        assert.ok(
          n <= 15 || /auditLog/.test(line),
          `bulk take ${n} must only be the audit enrichment`
        );
      }
    });
    it(`${fn}: fail-closed before the cache read`, () => {
      const body = fnBody(browse, fn);
      assert.ok(
        body.indexOf("allowed()") < body.indexOf("withScopedCache"),
        "auth gate must precede the cache read"
      );
    });
  }
  it("browseRequestsPage carries the pending-replenishment count", () => {
    const body = fnBody(browse, "browseRequestsPage");
    assert.match(body, /pendingReplenishment/);
    assert.match(body, /request_type: 'stock_replenishment', status: 'pending'/);
  });
});

describe("users + logs Page readers", () => {
  it("getUsersPage: window + per-filter total, roster filter in DB", () => {
    const body = fnBody(src("../app/super-admin/users/actions.ts"), "getUsersPage");
    assert.match(body, /withScopedCache\('super-admin:users-page', 30/);
    assert.match(body, /\}, \{ page, pageSize, q \}\)/);
    assert.match(body, /NOT: \[{ role: 'employee', status: 'pending' }\]/);
    assert.match(body, /skip: \(page - 1\) \* pageSize/);
    assert.match(body, /pageResponse\(mapped, total, page, pageSize\)/);
    assert.ok(!/take:\s*300/.test(body), "no 300-row snapshot");
  });
  it("getLogsPage: window + per-filter total + module options", () => {
    const file = src("../app/super-admin/logs/actions.ts");
    const body = fnBody(file, "getLogsPage");
    assert.match(body, /withScopedCache\('super-admin:logs-page', 30/);
    assert.match(body, /LIMIT \$\{pageSize\} OFFSET \$\{offset\}/);
    assert.match(body, /SELECT COUNT\(\*\)::bigint AS count/);
    assert.match(file, /export async function getAdminLogModules/);
  });
  it("inventory stats carry the no-threshold count (additive)", () => {
    const body = src("../app/personnel/inventory/actions.ts");
    assert.match(body, /none: number/);
    assert.match(body, /reorder_threshold: null/);
  });
});

describe("converted pages fetch windows, not snapshots", () => {
  for (const [file, fetcher] of [
    ["../app/super-admin/deliveries/page.tsx", "browseDeliveriesPage"],
    ["../app/super-admin/inspections/page.tsx", "browseInspectionsPage"],
    ["../app/super-admin/issuances/page.tsx", "browseIssuancesPage"],
    ["../app/super-admin/requests/page.tsx", "browseRequestsPage"],
    ["../app/super-admin/repairs/page.tsx", "getRepairsPage"],
    ["../app/super-admin/users/page.tsx", "getUsersPage"],
    ["../app/super-admin/logs/page.tsx", "getLogsPage"],
    ["../app/super-admin/inventory/page.tsx", "getInventoryPage"],
    ["../app/super-admin/issues/page.tsx", "getPublicIssuesPage"],
  ] as const) {
    it(`${file}: server window + server total + pager`, () => {
      const body = src(file);
      assert.ok(body.includes(fetcher), `must fetch via ${fetcher}`);
      assert.match(body, /paged\?\.total \?\? 0/);
      assert.match(body, /TablePager/);
      assert.ok(!/take:\s*(300|500)/.test(body), "no bulk take on the page");
    });
  }
  it("repairs/inventory/issues reuse the shared (global-scope) readers", () => {
    assert.match(src("../app/super-admin/repairs/page.tsx"), /pageSize: PAGE_SIZE/);
    assert.match(src("../app/super-admin/inventory/page.tsx"), /pageSize: PAGE_SIZE/);
    assert.match(src("../app/super-admin/issues/page.tsx"), /FIXED_PAGE_SIZE/);
  });
});

describe("window invalidation: totals bust with their resource", () => {
  const cacheSrc = src("../lib/personnel-cache.ts");
  it("personnel write scopes cover the new admin page namespaces", () => {
    for (const ns of [
      "super-admin:deliveries-page",
      "super-admin:inspections-page",
      "super-admin:issuances-page",
      "super-admin:requests-page",
      "super-admin:users-page",
    ]) {
      assert.ok(cacheSrc.includes(`'${ns}'`), `${ns} must be busted by its resource writes`);
    }
  });
  it("invalidation map documents the new namespaces", () => {
    assert.ok(invalidationFor("delivery")?.server.includes("super-admin:deliveries-page"));
    assert.ok(invalidationFor("inspection")?.server.includes("super-admin:inspections-page"));
    assert.ok(invalidationFor("issuance")?.server.includes("super-admin:issuances-page"));
    assert.ok(invalidationFor("request")?.server.includes("super-admin:requests-page"));
    assert.ok(invalidationFor("user")?.server.includes("super-admin:users-page"));
    assert.ok(invalidationFor("logs")?.server.includes("super-admin:logs-page"));
  });
});
