import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (p: string) =>
  readFileSync(new URL(p, import.meta.url), "utf8");

describe("dead code removed (no orphaned readers)", () => {
  const all = [
    "app/personnel/documents/actions.ts",
    "app/personnel/issuances/actions.ts",
    "app/personnel/inventory/actions.ts",
    "app/personnel/repairs/actions.ts",
    "app/super-admin/browse/actions.ts",
    "app/employee/actions.ts",
  ]
    .map((p) => src(`../${p}`))
    .join("\n");
  for (const dead of [
    "getDocumentsSnapshot",
    "DocumentsSnapshot",
    "deleteInventoryItem",
    "getParAndIcsReports",
    "getDeliveryDocuments(",
    "getAllIarReports(",
    "getParReports(",
    "getIcsReports(",
    "getAllUnifiedAssets",
    "getAssetsSnapshot",
    "AssetsSnapshot",
    "browseDeliveryDocuments",
    "browseIarReports",
    "browseParReports",
    "browseIcsReports",
    "browseAssets(",
    "getStocks(",
  ]) {
    it(`no reference to ${dead} remains`, () => {
      assert.ok(!all.includes(dead), `${dead} fully excised`);
    });
  }
  it("documents/actions imports only what its readers use", () => {
    const docs = src("../app/personnel/documents/actions.ts");
    for (const orphan of [
      "UnifiedInspectionRow",
      "InventoryRow",
      "UnifiedAssetRow",
      "RepairRow",
      "IssuanceRecordRow",
      "getInspectionsList",
      "getInventoryItems",
      "getAllUnifiedAssets",
    ]) {
      assert.ok(!docs.includes(orphan), `no orphan import ${orphan}`);
    }
  });
});

describe("getRepairLabelMap bounded to the window (no full-table scans)", () => {
  const repairs = src("../app/personnel/repairs/actions.ts");
  const body = repairs.slice(repairs.indexOf("async function getRepairLabelMap"));
  it("takes window asset IDs and filters by them", () => {
    assert.match(body, /assetIds:\s*string\[\]/);
    assert.match(body, /where:\s*\{\s*id:\s*\{\s*in:\s*ids\s*\}\s*\}/);
    assert.match(body, /if \(ids\.length === 0\) return new Map\(\)/);
  });
  it("no unbounded asset/inventory scans in the label path", () => {
    assert.ok(!/findMany\(\{\s*select:\s*\{\s*id: true, qr_code/.test(body));
  });
});

describe("load rig (scripts, zero new dependencies)", () => {
  it("measure-exports covers the guard matrix + p95 budget", () => {
    const rig = src("../../scripts/measure-exports.mjs");
    assert.match(rig, /BUDGET_EXPORT_P95_MS = 400/);
    for (const needle of ["expect: 401", "expect: 403", "expect: 404", "p95", "LOAD_CONCURRENCY"]) {
      assert.ok(rig.includes(needle), `rig covers ${needle}`);
    }
    assert.ok(!/from 'k6'|require\('k6/.test(rig), "node built-ins only");
  });
  it("explain-registry is read-only and checks the union + indexes", () => {
    const rig = src("../../scripts/explain-registry.mjs");
    assert.match(rig, /EXPLAIN \(ANALYZE, BUFFERS/);
    assert.match(rig, /UNION ALL/);
    assert.match(rig, /pg_indexes/);
    assert.ok(!/\$executeRaw|UPDATE |DELETE |INSERT /.test(rig), "read-only, no writes");
  });
});

describe("volume seed (staging only, dry-run default)", () => {
  const seed = src("../../scripts/seed-audit-volume.ts");
  it("writes nothing without --yes, cleans with --clean + manifest", () => {
    assert.match(seed, /DO_WRITE = process\.argv\.includes\('--yes'\)/);
    assert.match(seed, /dry-run: nothing written/);
    assert.match(seed, /\.volume-seed-manifest\.json/);
    assert.match(seed, /FK-safe order/);
  });
  it("exceeds the old 2000-row cap and stays bounded", () => {
    assert.match(seed, /2500 \* SCALE/);
    assert.match(seed, /VOLUME_SCALE/);
  });
  it("uses real profile/catalog/unit IDs, aborts without users, no secrets", () => {
    assert.match(seed, /seed users first/);
    assert.match(seed, /accountCatalog|account_catalog/);
    assert.ok(!/password\s*[:=]\s*['"][^'"]+['"]/.test(seed), "no hardcoded secrets");
  });
});
