import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  patchRowInPage,
  prependRowToPage,
  removeRowFromPage,
} from "../lib/list-patch";

const src = (p: string) =>
  readFileSync(new URL(p, import.meta.url), "utf8");

const row = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  label: `row-${id}`,
  ...extra,
});

describe("patchRowInPage (in-place update, totals unchanged)", () => {
  it("patches rows+data in envelopes", () => {
    const page = { rows: [row("a"), row("b")], data: [row("a"), row("b")], total: 2 };
    const next = patchRowInPage(page, "b", { label: "B!" });
    assert.equal(next.rows[1].label, "B!");
    assert.equal(next.data[1].label, "B!");
    assert.equal(next.total, 2);
    assert.equal(next.rows[0].label, "row-a");
  });
  it("patches legacy {rows} and bare arrays", () => {
    assert.equal(patchRowInPage({ rows: [row("a")] }, "a", { label: "A!" }).rows[0].label, "A!");
    const arr = patchRowInPage([row("a"), row("b")], "b", { label: "B!" });
    assert.equal(arr[1].label, "B!");
  });
  it("unknown ids and shapes pass through untouched", () => {
    const page = { rows: [row("a")], total: 1 };
    assert.deepEqual(patchRowInPage(page, "zzz", { label: "X" }), page);
    assert.equal(patchRowInPage(null, "a", {}), null);
    assert.equal(patchRowInPage(42, "a", {}), 42);
  });
});

describe("prependRowToPage (optimistic create, total + 1)", () => {
  it("unshifts into rows+data and bumps total", () => {
    const next = prependRowToPage({ rows: [row("b")], data: [row("b")], total: 1 }, row("a"));
    assert.deepEqual(next.rows.map((r) => r.id), ["a", "b"]);
    assert.deepEqual(next.data.map((r) => r.id), ["a", "b"]);
    assert.equal(next.total, 2);
  });
  it("works on bare arrays", () => {
    assert.deepEqual(prependRowToPage([row("b")], row("a")).map((r) => r.id), ["a", "b"]);
  });
});

describe("removeRowFromPage (rollback/delete, total - 1 floored at 0)", () => {
  it("drops the id from rows+data and decrements", () => {
    const next = removeRowFromPage(
      { rows: [row("a"), row("b")], data: [row("a"), row("b")], total: 2 },
      "a"
    );
    assert.deepEqual(next.rows.map((r) => r.id), ["b"]);
    assert.deepEqual(next.data.map((r) => r.id), ["b"]);
    assert.equal(next.total, 1);
  });
  it("floors total at 0 and tolerates missing ids", () => {
    assert.equal(removeRowFromPage({ rows: [], total: 0 }, "x").total, 0);
    assert.deepEqual(removeRowFromPage([row("a")], "zzz").map((r) => r.id), ["a"]);
  });
});

describe("mutate + patchClientCache primitives", () => {
  const hook = src("../hooks/use-cached-action.ts");
  const cache = src("../lib/client-cache.ts");
  it("useCachedAction exposes mutate that writes cache without fetching", () => {
    assert.match(hook, /mutate:\s*\(next:/);
    assert.match(hook, /setClientCache\(key,\s*fresh\)/);
    // mutate never fetches: no fetcherRef/run call inside its body.
    const body = hook.slice(hook.indexOf("const mutate = useCallback"));
    assert.ok(!/fetcherRef|run\(true\)/.test(body), "mutate performs no fetch");
  });
  it("patchClientCache patches without dispatching (no refetch)", () => {
    assert.match(cache, /export function patchClientCache/);
    // Slice ONLY patchClientCache's own body (to the next top-level export),
    // so later helpers in the same module (e.g. clearAllClientCache, which
    // must notify mounted hooks) don't pollute this assertion.
    const start = cache.indexOf("export function patchClientCache");
    const candidates = [
      cache.indexOf("\nexport function ", start + 10),
      cache.indexOf("\nexport const ", start + 10),
      cache.indexOf("\nexport interface ", start + 10),
    ].filter((i) => i >= 0);
    const body = cache.slice(start, candidates.length > 0 ? Math.min(...candidates) : undefined);
    assert.ok(!/dispatchEvent/.test(body), "patching dispatches no bust event");
    assert.match(body, /writeSession/);
  });
});

describe("AddAssetDialog: pending-disabled, failure toast, lifecycle events", () => {
  const dlg = src("../app/personnel/assets/asset-dialogs.tsx");
  it("disables submit while pending", () => {
    assert.match(dlg, /disabled=\{pending\}/);
  });
  it("failure toast + inline error on create failure", () => {
    assert.match(dlg, /toast\(\{\s*title:\s*"Error"/);
  });
  it("emits start/success/error with a temp row + server record", () => {
    assert.match(dlg, /onMutationEvent\?:\s*\(e:\s*AssetMutationEvent\)/);
    assert.match(dlg, /phase:\s*"start"/);
    assert.match(dlg, /phase:\s*"success"/);
    assert.match(dlg, /phase:\s*"error"/);
    assert.match(dlg, /buildOptimisticAssetRow/);
    assert.match(dlg, /optimistic-/);
  });
});

describe("asset list pages: optimistic create without refetch", () => {
  for (const p of [
    "../app/personnel/assets/page.tsx",
    "../app/super-admin/assets/page.tsx",
  ]) {
    it(`${p}: prepend temp, reconcile record, rollback, refresh fallback`, () => {
      const file = src(p);
      assert.match(file, /handleAssetCreateEvent/);
      assert.match(file, /prependRowToPage\(prev,\s*e\.temp\)/);
      assert.match(file, /patchRowInPage\(prev,\s*e\.tempId/);
      assert.match(file, /removeRowFromPage\(prev,\s*e\.tempId\)/);
      assert.match(file, /onMutationEvent=\{handleAssetCreateEvent\}/);
    });
  }
});

describe("detail editors: optimistic overlay + rollback + list patch", () => {
  for (const p of [
    "../app/personnel/assets/[id]/AssetDetailEditor.tsx",
    "../app/personnel/assets/stock/[id]/StockDetailEditor.tsx",
  ]) {
    it(`${p}: instant overlay, rollback on error, no stale bust`, () => {
      const file = src(p);
      assert.match(file, /setOptimistic\(overrides\)/);
      assert.match(file, /setOptimistic\(null\)/);
      assert.match(file, /patchClientCache\(\s*\[/);
      assert.ok(!/pgso:client:assets-snapshot/.test(file), "stale bust key removed");
      assert.match(file, /disabled=\{isPending\}/);
    });
  }
});

describe("custom columns: optimistic fields + cell failure toast", () => {
  const cols = src("../app/personnel/assets/custom-columns.tsx");
  it("AddColumnDialog paints add/remove instantly with rollback", () => {
    assert.match(cols, /mutateFields\(\(prev\) => \[\.\.\.\(prev \?\? \[\]\), optimisticDef\]\)/);
    assert.match(cols, /res\.key \?\? tempKey/);
    assert.match(cols, /mutateFields\(prev\)/);
  });
  it("CustomCell rolls back silently no more — failure toast added", () => {
    assert.match(cols, /toast\.error\(msg/);
    assert.match(cols, /disabled=\{saving\}/);
  });
});

describe("inventory save: optimistic create/update + rollback + record", () => {
  const page = src("../app/personnel/inventory/page.tsx");
  it("paints save instantly, rolls back, reconciles server record", () => {
    assert.match(page, /mutateRows\(\(p\) =>/);
    assert.match(page, /mutateRows\(\(\) => snapshot\)/);
    assert.match(page, /patchRowInPage\(p, record\.id/);
    assert.match(page, /disabled=\{!canSave \|\| saving\}/);
  });
});

describe("threshold cells: optimistic patch + revert + record", () => {
  const page = src("../app/super-admin/inventory/page.tsx");
  it("threshold applies instantly with rollback on failure", () => {
    assert.match(page, /onOptimistic=\{\(id, threshold\) => patchThreshold/);
    assert.match(page, /onRevert=\{\(id, prev\) => patchThreshold/);
    assert.match(page, /patchClientCache\(\s*\[\s*"pgso:client:inventory-items"/);
    assert.match(page, /resourcePrefix\("personnel", "inventory"\)/);
    assert.match(page, /res\.record\?\.reorder_threshold/);
    assert.match(page, /disabled=\{!dirty \|\| saving\}/);
  });
});

describe("mutation responses carry records (patch without refetch)", () => {
  const assets = src("../app/personnel/assets/actions.ts");
  const fnBody = (name: string) => {
    const start = assets.indexOf(`export async function ${name}`);
    assert.ok(start >= 0, `${name} present`);
    const next = assets.indexOf("export async function", start + 10);
    return assets.slice(start, next < 0 ? undefined : next);
  };
  for (const fn of ["updateAsset", "updateUnifiedAsset", "updateStock", "createAsset"]) {
    it(`${fn} returns its record`, () => {
      assert.match(fnBody(fn), /record/);
    });
  }
  it("saveInventoryItem + setReorderThreshold return records", () => {
    assert.match(src("../app/personnel/inventory/actions.ts"), /return \{ success: true, record \}/);
    assert.match(
      src("../app/super-admin/inventory/actions.ts"),
      /record: \{ id: itemId, reorder_threshold: threshold \}/
    );
  });
  it("custom writes echo key/value for patching", () => {
    const cf = src("../app/personnel/assets/custom-fields.ts");
    assert.match(cf, /return \{ success: true, key \}/);
    assert.match(cf, /return \{ success: true, key: input\.key, value: saved \}/);
  });
});
