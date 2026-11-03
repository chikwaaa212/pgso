import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  scanActionsFor,
  type ScanActionId,
  type ScanPortal,
} from "../lib/scan-actions";
import type { AssetTagRef } from "../lib/asset-tag";

const ASSET_ID = "11111111-2222-3333-4444-555555555555";
const STOCK_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const asset: AssetTagRef = { id: ASSET_ID, kind: "asset" };
const stock: AssetTagRef = { id: STOCK_ID, kind: "stock" };

function ids(actions: ReturnType<typeof scanActionsFor>): ScanActionId[] {
  return actions.map((a) => a.id);
}

describe("scanActionsFor", () => {
  it("always offers open for every portal and kind", () => {
    for (const portal of ["personnel", "super-admin", "public"] as ScanPortal[]) {
      assert.ok(ids(scanActionsFor(asset, portal)).includes("open"));
      assert.ok(ids(scanActionsFor(stock, portal)).includes("open"));
    }
  });

  it("gives the public scanner identification only", () => {
    for (const ref of [asset, stock]) {
      assert.deepEqual(ids(scanActionsFor(ref, "public")), ["open"]);
    }
  });

  it("offers history, repair, and transfer for assets in staff portals", () => {
    for (const portal of ["personnel", "super-admin"] as ScanPortal[]) {
      assert.deepEqual(ids(scanActionsFor(asset, portal)), [
        "open",
        "history",
        "repair",
        "transfer",
      ]);
    }
  });

  it("never offers repair for a stock item", () => {
    for (const portal of ["personnel", "super-admin"] as ScanPortal[]) {
      const actions = scanActionsFor(stock, portal);
      assert.ok(!ids(actions).includes("repair"));
      assert.ok(!ids(actions).includes("history"));
      assert.ok(ids(actions).includes("replenish"));
    }
  });

  it("keeps super-admin links inside the super-admin portal", () => {
    for (const portal of ["personnel", "super-admin"] as ScanPortal[]) {
      for (const action of scanActionsFor(asset, portal)) {
        if (portal === "super-admin") {
          assert.ok(
            !action.href.includes("/personnel/"),
            `${action.id} leaked a personnel href: ${action.href}`
          );
        } else {
          assert.ok(!action.href.startsWith("/super-admin/"));
        }
        assert.ok(action.href.startsWith("/"));
      }
      for (const action of scanActionsFor(stock, portal)) {
        if (portal === "super-admin") {
          assert.ok(!action.href.includes("/personnel/"));
        }
      }
    }
  });

  it("carries the asset id, scan intent, and history fragment", () => {
    const actions = scanActionsFor(asset, "personnel");
    const byId = new Map(actions.map((a) => [a.id, a.href]));
    assert.equal(byId.get("open"), `/personnel/assets/${ASSET_ID}`);
    assert.equal(byId.get("history"), `/personnel/assets/${ASSET_ID}#asset-history`);
    assert.equal(byId.get("repair"), `/personnel/repairs?asset=${ASSET_ID}`);
    assert.equal(
      byId.get("transfer"),
      `/personnel/requests?asset=${ASSET_ID}&scan=transfer`
    );
  });

  it("builds stock links against the stock detail page", () => {
    const actions = scanActionsFor(stock, "super-admin");
    const byId = new Map(actions.map((a) => [a.id, a.href]));
    assert.equal(byId.get("open"), `/super-admin/assets/stock/${STOCK_ID}`);
    assert.equal(
      byId.get("replenish"),
      `/super-admin/requests?asset=${STOCK_ID}&scan=replenish`
    );
  });
});
