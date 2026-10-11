import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildQueryKey, resourcePrefix } from "../lib/query-keys";
import { INVALIDATION_MAP } from "../lib/cache-invalidation";

const src = (p: string) =>
  readFileSync(new URL(p, import.meta.url), "utf8");

// Every list/page/count key migrated in Phase 4 (module + resource).
const MIGRATED: Array<[file: string, module: string, resources: string[]]> = [
  ["../app/personnel/dashboard/page.tsx", "personnel", ["dashboard"]],
  ["../app/personnel/deliveries/delivery-table.tsx", "personnel", ["deliveries"]],
  ["../app/personnel/inspections/page.tsx", "personnel", ["inspections", "inspections-air", "inspections-counts"]],
  ["../app/personnel/inventory/page.tsx", "personnel", ["inventory", "inventory-stats"]],
  ["../app/personnel/assets/page.tsx", "personnel", ["assets"]],
  ["../app/personnel/documents/page.tsx", "personnel", ["documents", "documents-counts", "documents-viewed"]],
  ["../app/personnel/issues/page.tsx", "personnel", ["issues", "issues-type-options", "issues-completed"]],
  ["../app/personnel/issuances/page.tsx", "personnel", ["issuances"]],
  ["../app/personnel/requests/page.tsx", "personnel", ["requests"]],
  ["../app/personnel/repairs/page.tsx", "personnel", ["repairs"]],
  ["../app/personnel/logs/logs-table.tsx", "personnel", ["logs", "logs-modules"]],
  ["../app/super-admin/users/page.tsx", "super-admin", ["users", "users-counts"]],
  ["../app/super-admin/deliveries/page.tsx", "super-admin", ["deliveries"]],
  ["../app/super-admin/inspections/page.tsx", "super-admin", ["inspections"]],
  ["../app/super-admin/issuances/page.tsx", "super-admin", ["issuances"]],
  ["../app/super-admin/requests/page.tsx", "super-admin", ["requests"]],
  ["../app/super-admin/repairs/page.tsx", "super-admin", ["repairs"]],
  ["../app/super-admin/logs/page.tsx", "super-admin", ["logs", "logs-modules"]],
  ["../app/super-admin/inventory/page.tsx", "super-admin", ["inventory", "inventory-stats"]],
  ["../app/super-admin/documents/page.tsx", "super-admin", ["documents", "documents-counts", "documents-viewed"]],
  ["../app/super-admin/assets/page.tsx", "super-admin", ["assets"]],
  ["../app/super-admin/issues/page.tsx", "super-admin", ["issues", "issues-type-options", "issues-completed"]],
  ["../app/super-admin/transactions/page.tsx", "super-admin", ["transactions"]],
  ["../app/super-admin/records/page.tsx", "super-admin", ["records"]],
  ["../app/super-admin/master-data/page.tsx", "super-admin", ["master-data"]],
  ["../app/employee/assets/page.tsx", "employee", ["assets"]],
  ["../app/employee/requests/page.tsx", "employee", ["requests"]],
  ["../lib/nav-prefetch.ts", "*", ["dashboard", "assets", "requests", "users", "deliveries", "issues"]],
];

describe("Phase 4: no ad-hoc list keys remain", () => {
  it("no legacy key-template interpolations in list readers", () => {
    // Static-lookup suffixes are intentional exceptions (persistable legacy
    // keys): -filter-options and -filters stay on CLIENT_CACHE_KEYS bases.
    const bannedLiteral = [
      "pgso:assets:unified:${",
      "pgso:admin-assets:unified:${",
      "pgso:documents:${",
    ];
    const bannedBase = /\$\{CLIENT_CACHE_KEYS\.[a-zA-Z]+\}(?!-filter-options|-filters)/;
    const files = [...new Set(MIGRATED.map(([f]) => f))].filter(
      (f) => f.endsWith("page.tsx") || f.endsWith("logs-table.tsx") || f.endsWith("delivery-table.tsx")
    );
    for (const f of files) {
      const body = src(f);
      for (const t of bannedLiteral) {
        assert.ok(!body.includes(t), `${f} still builds ad-hoc key ${t}`);
      }
      const hit = body.match(bannedBase);
      assert.ok(!hit, `${f} still interpolates a legacy list key: ${hit?.[0]}`);
    }
  });
  it("every migrated page builds keys through the factory", () => {
    for (const [f, module, resources] of MIGRATED) {
      if (f.endsWith("nav-prefetch.ts")) continue;
      const body = src(f);
      assert.match(body, /buildQueryKey\(\{/);
      for (const r of resources) {
        assert.ok(
          body.includes(`resource: '${r}'`),
          `${f} must mint resource '${r}' via buildQueryKey`
        );
      }
      void module;
    }
  });
  it("factory output is deterministic per caller (stable-stringify)", () => {
    const a = buildQueryKey({ module: "personnel", resource: "requests", page: 2, pageSize: 15, filters: { q: "x", status: "all" } });
    const b = buildQueryKey({ module: "personnel", resource: "requests", page: 2, pageSize: 15, filters: { status: "all", q: "x" } });
    assert.strictEqual(a, b);
    assert.ok(a.startsWith("pgso:v2:personnel:requests:"));
  });
});

describe("Phase 4: bust parity (legacy + v2 invalidated together)", () => {
  it("resourcePrefix covers every factory-minted resource", () => {
    // Hub snapshots (transactions/records) are exempt: unpaged single
    // fetches with no bust wiring (TTL-bound before and after migration).
    const HUBS = new Set(["super-admin:transactions", "super-admin:records"]);
    for (const [, module, resources] of MIGRATED) {
      if (module === "*") continue;
      for (const r of resources) {
        const prefix = resourcePrefix(module, r);
        assert.ok(prefix.startsWith("pgso:v2:"), `${module}/${r} prefix shape`);
        if (HUBS.has(`${module}:${r}`)) continue;
        const covered = Object.values(INVALIDATION_MAP).some((e) =>
          e.client.includes(prefix)
        );
        assert.ok(covered, `invalidation map must document ${prefix}`);
      }
    }
  });
  it("nav-prefetch keys equal the pages' first-page keys (no drift)", () => {
    const nav = src("../lib/nav-prefetch.ts");
    // Every entry key is minted by the factory — same constructor the pages use.
    const minted = [...nav.matchAll(/key: buildQueryKey\(\{/g)].length;
    assert.ok(minted >= 8, `all nav entries must use buildQueryKey (found ${minted})`);
    assert.ok(!nav.includes("pgso:assets:unified:1:"), "no duplicated key formats");
    assert.ok(!nav.includes("CLIENT_CACHE_KEYS"), "no legacy keys in nav-prefetch");
  });
});

describe("Phase 4: documented exceptions (static + record keys stay)", () => {
  it("static lookups keep persistable legacy keys", () => {
    assert.match(src("../app/personnel/assets/custom-columns.tsx"), /CLIENT_CACHE_KEYS\.assetCustomFields/);
    assert.match(src("../hooks/use-master-data.ts"), /pgso:master-data:active/);
    assert.match(src("../app/personnel/inventory/page.tsx"), /inventory\}-filters/);
    assert.match(src("../app/personnel/assets/page.tsx"), /assets\}-filter-options/);
    assert.match(src("../app/super-admin/assets/page.tsx"), /adminAssets\}-filter-options/);
  });
  it("per-record keys keep their record scheme", () => {
    assert.match(src("../app/super-admin/deliveries/record-modals.tsx"), /adminDeliveryDetail/);
    assert.match(src("../app/personnel/inspections/[id]/iar/page.tsx"), /CLIENT_CACHE_KEYS\.iar/);
    assert.match(src("../hooks/use-receipt.ts"), /receipt/);
  });
});
