import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { escapeLike } from "../lib/paged";
import { PAGE_SIZE } from "../lib/constants";

const src = (p: string) =>
  readFileSync(new URL(p, import.meta.url), "utf8");

/** Slice a top-level function body out of source text. */
function fnBody(file: string, name: string): string {
  const start = file.indexOf(`export async function ${name}`);
  assert.ok(start >= 0, `${name} present`);
  const next = file.indexOf("export async function", start + 10);
  return file.slice(start, next < 0 ? undefined : next);
}

describe("escapeLike (search text matches literally)", () => {
  it("escapes %, _, and backslash", () => {
    assert.equal(escapeLike("100%"), "100\\%");
    assert.equal(escapeLike("a_b"), "a\\_b");
    assert.equal(escapeLike("a\\b"), "a\\\\b");
  });
  it("leaves plain text untouched", () => {
    assert.equal(escapeLike("laptop dell"), "laptop dell");
    assert.equal(escapeLike(""), "");
  });
});

describe("getUnifiedAssetsPage: UNION window, not 2x2000 merge", () => {
  const actions = src("../app/personnel/assets/actions.ts");
  const body = fnBody(actions, "getUnifiedAssetsPage");
  it("single UNION ALL with in-query total and window", () => {
    assert.match(body, /UNION ALL/);
    assert.match(body, /COUNT\(\*\) OVER\(\)/);
    assert.match(body, /LIMIT \$\{pageSize\} OFFSET \$\{offset\}|LIMIT \S+ OFFSET/);
  });
  it("no 2000-row preload, no bags-for-all", () => {
    assert.ok(!/take:\s*2000/.test(body), "no take:2000 in the window path");
    assert.ok(!/fetchCustomBags/.test(body), "bags hydrate from the row text, not a fan-out");
  });
  it("honors caller pageSize (default PAGE_SIZE, clamped)", () => {
    assert.match(body, /opts\.pageSize/);
    assert.match(body, /PAGE_SIZE/);
  });
  it("LIKE-escapes user search text", () => {
    assert.match(body, /escapeLike\(q\)/);
  });
  it("PAGE_SIZE is the small page (15)", () => {
    assert.equal(PAGE_SIZE, 15);
  });
});

describe("pageSize honoring restored (admin full lists un-truncated)", () => {
  const docs = src("../app/personnel/documents/actions.ts");
  for (const name of ["getDeliveryDocumentsPage", "getIarReportsPage"]) {
    it(`${name} honors opts.pageSize with PAGE_SIZE default`, () => {
      const body = fnBody(docs, name);
      assert.match(body, /opts\.pageSize/);
      assert.match(body, /PAGE_SIZE/);
    });
  }
  it("getInventoryPage honors opts.pageSize", () => {
    const inv = src("../app/personnel/inventory/actions.ts");
    assert.match(fnBody(inv, "getInventoryPage"), /opts\.pageSize/);
  });
});

describe("getAdminDocumentsTabPage: per-tab server windows", () => {
  const browse = src("../app/super-admin/browse/actions.ts");
  const body = fnBody(browse, "getAdminDocumentsTabPage");
  it("one window per tab via personnel readers (no 500-row lists)", () => {
    for (const call of [
      "getDeliveryDocumentsPage",
      "getInspectionsPage",
      "getInventoryPage",
      "getUnifiedAssetsPage",
      "getRepairsPage",
      "getIarReportsPage",
      "getIssuancesPage",
    ]) {
      assert.ok(body.includes(call), `uses ${call}`);
    }
    assert.ok(!/take:\s*500/.test(body), "no full-list takes in the window path");
  });
  it("preserves logged_by on every oversight column that had it", () => {
    // delivery/inspection/iar enrich inline; par/ics reuse withIssuanceLoggers.
    assert.ok((body.match(/logged_by/g) ?? []).length >= 3, "logged_by enriched per tab");
    assert.match(body, /withIssuanceLoggers\(r\.rows\)/);
  });
  it("fail-closed for non-admins, cached per tab+page+q", () => {
    assert.match(body, /if \(\!\(await allowed\(\)\)\)/);
    assert.match(body, /withScopedCache\('super-admin:documents-tab'/);
  });
});

describe("super-admin documents page: server windows, no client filter", () => {
  const page = src("../app/super-admin/documents/page.tsx");
  it("fetches one tab window + counts, not the 8x500 snapshot", () => {
    assert.match(page, /getAdminDocumentsTabPage/);
    assert.match(page, /getDocumentsCounts/);
    assert.ok(!/browseDeliveryDocuments\(\)/.test(page), "no full-list snapshot");
    assert.ok(!/browseAssets\(\)/.test(page), "no full-registry fetch");
  });
  it("keeps Logged By columns and receipt overlays", () => {
    assert.ok((page.match(/logged_by/g) ?? []).length >= 5, "Logged By columns kept");
    assert.match(page, /browseDelivery\(deliveryId\)/);
    assert.match(page, /browseIssuance\(row\.id\)/);
  });
});

describe("super-admin assets page: server window, not browseAssets", () => {
  const page = src("../app/super-admin/assets/page.tsx");
  it("pages via getUnifiedAssetsPage + bounded filter options", () => {
    assert.match(page, /getUnifiedAssetsPage\(\{/);
    assert.match(page, /getAssetFilterOptions/);
    assert.ok(!/browseAssets\(\)/.test(page), "no 500+500 client list");
    assert.ok(!/customSearchText\(a\)/.test(page), "no client haystack scan");
  });
});

describe("exact totals stay exact (pager correctness)", () => {
  it("union carries COUNT(*) OVER(); pages cache totals per filter key", () => {
    const actions = src("../app/personnel/assets/actions.ts");
    assert.match(fnBody(actions, "getUnifiedAssetsPage"), /COUNT\(\*\) OVER\(\)/);
    const browse = src("../app/super-admin/browse/actions.ts");
    assert.match(fnBody(browse, "getAdminDocumentsTabPage"), /withScopedCache/);
  });
});
