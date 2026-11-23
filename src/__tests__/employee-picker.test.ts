import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assetOptionDisabledReason } from "../lib/asset-option";
import { PAGE_SIZE } from "../lib/constants";

const src = (p: string) =>
  readFileSync(new URL(p, import.meta.url), "utf8");

describe("assetOptionDisabledReason parity (personnel + employee share it)", () => {
  it("stock: null unless out of stock", () => {
    assert.equal(assetOptionDisabledReason({ source: "stock", quantity: 5 }), null);
    assert.equal(assetOptionDisabledReason({ source: "stock", quantity: 0 }), "Out of stock");
  });
  it("stock: an unserviceable inspected lot is never assignable", () => {
    assert.equal(
      assetOptionDisabledReason({
        source: "stock",
        quantity: 5,
        condition: "unserviceable",
      }),
      "Unserviceable"
    );
    assert.equal(
      assetOptionDisabledReason({ source: "stock", quantity: 5, condition: "serviceable" }),
      null
    );
  });
  it("asset: assigned and out-of-stock first", () => {
    assert.equal(
      assetOptionDisabledReason({ source: "asset", status: "available", assigned_to: "u1" }),
      "Already assigned"
    );
    assert.equal(
      assetOptionDisabledReason({ source: "asset", status: "available", quantity: 0 }),
      "Out of stock"
    );
  });
  it("asset: non-available status is surfaced, available is pickable", () => {
    assert.equal(
      assetOptionDisabledReason({ source: "asset", status: "maintenance" }),
      "Maintenance"
    );
    assert.equal(
      assetOptionDisabledReason({ source: "asset", status: "available" }),
      null
    );
  });
  it("asset: unserviceable is never assignable, even when marked available", () => {
    assert.equal(
      assetOptionDisabledReason({
        source: "asset",
        status: "available",
        condition: "unserviceable",
      }),
      "Unserviceable"
    );
    // Other "bad" condition words classify as unserviceable too.
    assert.equal(
      assetOptionDisabledReason({ source: "asset", status: "available", condition: "Damaged" }),
      "Unserviceable"
    );
    assert.equal(
      assetOptionDisabledReason({
        source: "asset",
        status: "available",
        condition: "serviceable",
      }),
      null
    );
  });
  it("single shared implementation (no forked copies)", () => {
    const personnel = src("../app/personnel/requests/actions.ts");
    assert.match(personnel, /lib\/asset-option/);
    const employee = src("../app/employee/actions.ts");
    assert.match(employee, /lib\/asset-option/);
    const lib = src("../lib/asset-option.ts");
    assert.match(lib, /export function assetOptionDisabledReason/);
  });
});

describe("getMyRequestOptions: small page, minimal fields, server search", () => {
  const actions = src("../app/employee/actions.ts");
  const fn = actions.slice(actions.indexOf("export async function getMyRequestOptions"));

  it("uses PAGE_SIZE takes, never a 500-row slice", () => {
    assert.match(fn, /PAGE_SIZE/);
    assert.ok(!/take:\s*500/.test(fn), "no 500-row slice in the employee picker");
    assert.ok(!/getRequestFormOptions/.test(fn), "no global catalog fan-out");
  });
  it("selects ONLY the fields the picker displays", () => {
    for (const field of ["qr_code", "account_code", "article", "description", "status", "quantity", "assigned_to", "item_name"]) {
      assert.ok(fn.includes(field), `selects ${field}`);
    }
    for (const field of ["account_title", "asset_type", "location", "unit_cost"]) {
      assert.ok(!field || !new RegExp(`select:[^}]*${field}`).test(fn), `no ${field} in picker selects`);
    }
  });
  it("searches server-side (q filters in the DB query)", () => {
    assert.match(fn, /opts:\s*{\s*q\?:\s*string\s*}/);
    assert.match(fn, /contains:\s*q,\s*mode:\s*'insensitive'/);
    // Held assets always come along (transfer/repair filter to them).
    assert.match(fn, /assigned_to:\s*userId/);
  });
  it("PAGE_SIZE is the small page (10)", () => {
    assert.equal(PAGE_SIZE, 10);
  });
});

describe("personnel pick-lists: small window + server search (no 500-row slice)", () => {
  for (const [name, file, fn] of [
    ["requests", "../app/personnel/requests/actions.ts", "getRequestFormOptions"],
    ["repairs", "../app/personnel/repairs/actions.ts", "getRepairFormOptions"],
  ] as const) {
    const body = src(file);
    const fnBody = body.slice(body.indexOf(`export async function ${fn}`));
    it(`${name}: uses PAGE_SIZE takes, never a 500-row slice`, () => {
      assert.match(fnBody, /PAGE_SIZE/);
      assert.ok(!/take:\s*500/.test(fnBody), `no 500-row slice in ${fn}`);
    });
    it(`${name}: searches server-side (q filters in the DB query)`, () => {
      assert.match(fnBody, /opts:\s*{\s*q\?:\s*string\s*}/);
      assert.match(fnBody, /contains:\s*q,\s*mode:\s*'insensitive'/);
    });
    it(`${name}: search windows are cached per query`, () => {
      assert.match(fnBody, /\{\s*q\s*\}/);
    });
  }
});

describe("personnel dialog picker wiring", () => {
  // The repairs dialog was extracted into a shared component so the
  // super-admin portal can mount it too. Item selection is a single list
  // select (no separate search input) — the pick-list window is loaded once
  // per dialog open.
  const page = src("../components/personnel/RepairCreateDialog.tsx");
  it("repairs dialog uses one item select instead of a search field", () => {
    assert.ok(
      !page.includes('aria-label="Search items"'),
      "no separate item search input"
    );
    assert.ok(!page.includes("useDebouncedValue"), "no debounced item search");
    assert.ok(
      page.includes("getRepairFormOptions({"),
      "repairs dialog queries getRepairFormOptions"
    );
    assert.match(page, /Select an asset or stock item/);
  });
});

describe("personnel request dialog: dropdown-only picker", () => {
  const page = src("../app/personnel/requests/page.tsx");
  it("has no item search inputs (dropdown selection only)", () => {
    assert.ok(!page.includes('aria-label="Search items"'), "no search input");
    assert.ok(!page.includes('aria-label="Search assets"'), "no asset search input");
    assert.ok(!page.includes("useDebouncedValue"), "no debounced item search");
  });
  it("loads the full available pick-list per dialog open", () => {
    assert.ok(
      page.includes("getRequestFormOptions({})"),
      "fetches the empty-query pick-list"
    );
  });
  it("strictly separates tabs and hides out-of-stock items", () => {
    assert.match(page, /a\.tab === itemKind && a\.disabledReason !== "Out of stock"/);
  });
  it("files asset-kind lots stocked by a passed inspection under the Asset tab", () => {
    const actions = src("../app/personnel/requests/actions.ts");
    assert.match(
      actions,
      /tab: s\.delivery_kind === 'asset' \? \('asset' as const\) : \('stock' as const\)/
    );
    assert.match(actions, /delivery_kind: true/);
  });
  it("quantity fields clamp to on-hand and reject negatives", () => {
    assert.match(page, /function clampQuantity\(value: string, max: number\)/);
    assert.match(page, /setTransferQty\(\s*clampQuantity\(e\.target\.value, transferStockMax\)/);
    assert.match(page, /quantity: clampQuantity\(e\.target\.value, max\)/);
    assert.match(page, /setRestockQty\(digitsOnly\(e\.target\.value\)\.slice\(0, 9\)\)/);
  });
});

describe("employee request form search wiring", () => {
  const form = src("../app/employee/requests/request-form.tsx");
  it("has a debounced server search for items", () => {
    assert.match(form, /aria-label="Search items"/);
    assert.match(form, /useDebouncedValue\(itemQuery,\s*300\)/);
    assert.match(form, /getMyRequestOptions\(\{\s*q/);
    assert.match(form, /Searching…/);
  });
});
