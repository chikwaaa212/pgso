import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (p: string) =>
  readFileSync(new URL(p, import.meta.url), "utf8");

describe("nav prefetch map: first-page keys match their target pages", () => {
  const map = src("../lib/nav-prefetch.ts");
  it("covers the top links of all three roles", () => {
    for (const href of [
      "/personnel/dashboard",
      "/personnel/assets",
      "/personnel/requests",
      "/super-admin/users",
      "/super-admin/deliveries",
      "/super-admin/requests",
      "/employee/assets",
      "/employee/requests",
    ]) {
      assert.ok(map.includes(`'${href}'`), `${href} must have a prefetch entry`);
    }
  });
  it("personnel assets key uses the shared factory (page 1, defaults)", () => {
    // Page: buildQueryKey({ module: 'personnel', resource: 'assets', page, pageSize, filters }) — nav uses page-1 defaults
    assert.match(map, /module: 'personnel',\s*resource: 'assets',\s*page: 1,/);
    assert.match(map, /getUnifiedAssetsPage\(\{\s*page: 1,/);
  });
  it("personnel requests key uses the shared factory (FIXED_PAGE_SIZE, all/all)", () => {
    assert.match(map, /module: 'personnel',\s*resource: 'requests',/);
    assert.match(map, /pageSize: FIXED_PAGE_SIZE,/);
    assert.match(map, /forRecipient: true,/);
  });
  it("admin entries use the shared factory with matching fetchers", () => {
    assert.match(map, /module: 'super-admin',\s*resource: 'users', page: 1/);
    assert.match(map, /getUsersPage\(\{ page: 1, q: '', role: 'all', status: 'all' \}\)/);
    assert.match(map, /module: 'super-admin',\s*resource: 'deliveries', page: 1/);
    assert.match(map, /browseDeliveriesPage\(\{ page: 1, q: '' \}\)/);
    // Admin requests reuses the personnel Requests page (all-queue reader).
    assert.match(map, /'\/super-admin\/requests': \[\s*\{\s*key: buildQueryKey\(\{/);
    assert.match(map, /getRequestsPage\(\{ page: 1, pageSize: 100 \}\)/);
  });
  it("employee entries mirror the snapshot compositions", () => {
    assert.match(map, /getMyAssets\(\), getMyDocs\(\), getMyAssetRequests\(\)/);
    assert.match(map, /getMyRequests\(\), getMyRequestOptions\(\)/);
  });
  it("unknown hrefs prefetch nothing (safe spread everywhere)", () => {
    const body = map.slice(map.indexOf("export function navPrefetchProps"));
    assert.match(body, /if \(!entries \|\| entries\.length === 0\) return \{\}/);
  });
  it("warming reuses the shared deduped warmer (never throws)", () => {
    assert.match(map, /prefetchQuery\(e\.key, e\.run, \{ staleTime: e\.staleTime \}\)/);
  });
});

describe("navbars spread intent props on every nav link", () => {
  for (const [nav, n] of [
    ["../components/personnel/PersonnelNavbar.tsx", 2],
    ["../components/personnel/PersonnelSidebar.tsx", 2],
    ["../components/super-admin/SuperAdminNavbar.tsx", 2],
    ["../components/super-admin/SuperAdminSidebar.tsx", 2],
    ["../components/employee/EmployeeNavbar.tsx", 2],
    ["../components/employee/EmployeeSidebar.tsx", 2],
  ] as const) {
    it(`${nav}: all nav Links carry hover/focus prefetch`, () => {
      const body = src(nav);
      assert.match(body, /navPrefetchProps/);
      const dashboard = (body.match(/\{\.\.\.navPrefetchProps\(dashboard\.href\)\}/g) ?? []).length;
      const links = (body.match(/\{\.\.\.navPrefetchProps\(link\.href\)\}/g) ?? []).length;
      assert.strictEqual(dashboard + links, n, `expected ${n} wired Links`);
    });
  }
});

describe("list + QR images: lazy, async decode, sized QRs", () => {
  const qrOverlays = [
    "../app/personnel/issues/issues-table.tsx",
    "../components/personnel/RequestQrButton.tsx",
    "../app/personnel/assets/[id]/AssetDetailEditor.tsx",
    "../app/personnel/assets/stock/[id]/StockDetailEditor.tsx",
    "../components/personnel/AssetUnitsList.tsx",
  ];
  const scans = [
    "../app/personnel/documents/par-report.tsx",
    "../app/personnel/documents/ics-report.tsx",
    "../app/personnel/documents/iar-report.tsx",
    "../app/personnel/inspections/components/iar-report-view.tsx",
  ];
  for (const f of [...qrOverlays, ...scans]) {
    it(`${f}: lazy + async decode`, () => {
      const body = src(f);
      assert.match(body, /loading="lazy"/);
      assert.match(body, /decoding="async"/);
    });
  }
  it("generated QR sizes are explicit (no layout shift)", () => {
    // Issues QRs are generated at 120px (see getPublicIssuesPage window).
    assert.match(src("../app/personnel/issues/issues-table.tsx"), /width=\{120\}[\s\S]*height=\{120\}/);
    // Registry QRs are generated at the 96px default.
    for (const f of [
      "../app/personnel/assets/[id]/AssetDetailEditor.tsx",
      "../app/personnel/assets/stock/[id]/StockDetailEditor.tsx",
    ]) {
      assert.match(src(f), /width=\{96\}[\s\S]*height=\{96\}/);
    }
    // Per-piece tag thumbnails render at a fixed 72px.
    assert.match(
      src("../components/personnel/AssetUnitsList.tsx"),
      /width=\{72\}[\s\S]*height=\{72\}/
    );
  });
});
