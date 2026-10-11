import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildQueryKey,
  buildQueryKeyArray,
  defaultsFor,
  isV2Key,
  resourcePrefix,
  shouldPersistKey,
} from "../lib/query-keys";

const src = (p: string) =>
  readFileSync(new URL(p, import.meta.url), "utf8");

describe("query-key factory: one canonical shape, no ad-hoc keys", () => {
  it("builds stable v2 keys (filter reorder-proof)", () => {
    const a = buildQueryKey({
      module: "personnel",
      resource: "deliveries",
      page: 2,
      pageSize: 20,
      filters: { q: "bolt", status: "pending" },
      sort: "created_at:desc",
      role: "pgso_personnel",
      userId: "u1",
    });
    const b = buildQueryKey({
      module: "personnel",
      resource: "deliveries",
      page: 2,
      pageSize: 20,
      filters: { status: "pending", q: "bolt" },
      sort: "created_at:desc",
      role: "pgso_personnel",
      userId: "u1",
    });
    assert.ok(isV2Key(a));
    assert.strictEqual(a, b);
  });

  it("isolates per user: same filters, different userId → different keys", () => {
    const base = {
      module: "personnel",
      resource: "requests",
      page: 1,
      pageSize: 20,
      filters: {},
      role: "pgso_personnel" as const,
    };
    assert.notStrictEqual(
      buildQueryKey({ ...base, userId: "alice" }),
      buildQueryKey({ ...base, userId: "bob" })
    );
  });

  it("isolates per role: same userId, different role → different keys", () => {
    const base = {
      module: "shared",
      resource: "dashboard",
      page: 1,
      pageSize: 1,
      filters: {},
      userId: "u1",
    };
    assert.notStrictEqual(
      buildQueryKey({ ...base, role: "pgso_personnel" }),
      buildQueryKey({ ...base, role: "super_admin" })
    );
    assert.notStrictEqual(
      buildQueryKey({ ...base, role: "pgso_personnel" }),
      buildQueryKey({ ...base, role: "employee" })
    );
  });

  it("separates pages and filter sets (count caching per filter set)", () => {
    const base = {
      module: "personnel",
      resource: "assets",
      pageSize: 15,
      filters: { q: "" },
      role: "pgso_personnel" as const,
      userId: "u1",
    };
    assert.notStrictEqual(
      buildQueryKey({ ...base, page: 1 }),
      buildQueryKey({ ...base, page: 2 })
    );
    assert.notStrictEqual(
      buildQueryKey({ ...base, page: 1, filters: { q: "" } }),
      buildQueryKey({ ...base, page: 1, filters: { q: "hammer" } })
    );
  });

  it("array form carries the full segment order", () => {
    const arr = buildQueryKeyArray({
      module: "employee",
      resource: "requests",
      page: 1,
      pageSize: 20,
      filters: { status: "pending" },
      sort: null,
      role: "employee",
      userId: "e1",
    });
    assert.deepStrictEqual(arr.slice(0, 4), ["employee", "requests", 1, 20]);
    assert.strictEqual(arr[6], "employee");
    assert.strictEqual(arr[7], "e1");
  });

  it("resourcePrefix covers every page of a resource (targeted busts)", () => {
    const prefix = resourcePrefix("personnel", "deliveries");
    assert.ok(buildQueryKey({ module: "personnel", resource: "deliveries", page: 3, pageSize: 20, filters: {}, role: "pgso_personnel", userId: "u1" }).startsWith(prefix));
    assert.ok(!buildQueryKey({ module: "personnel", resource: "repairs", page: 1, pageSize: 20, filters: {}, role: "pgso_personnel", userId: "u1" }).startsWith(prefix));
  });
});

describe("per-data-type defaults (brief §2)", () => {
  it("static lookups are long-lived (30–60 min)", () => {
    const d = defaultsFor("static");
    assert.ok(d.staleTime >= 30 * 60_000 && d.staleTime <= 60 * 60_000);
    assert.strictEqual(d.persist, true);
    assert.strictEqual(d.refetchOnFocus, false);
  });
  it("slow lists are 1–5 min", () => {
    const d = defaultsFor("slow");
    assert.ok(d.staleTime >= 60_000 && d.staleTime <= 5 * 60_000);
    assert.strictEqual(d.persist, false);
  });
  it("live data is 10–30s with focus refetch", () => {
    const d = defaultsFor("live");
    assert.ok(d.staleTime >= 10_000 && d.staleTime <= 30_000);
    assert.strictEqual(d.refetchOnFocus, true);
    assert.strictEqual(d.persist, false);
  });
  it("sensitive data is short and never persisted", () => {
    const d = defaultsFor("sensitive");
    assert.ok(d.staleTime <= 60_000);
    assert.strictEqual(d.persist, false);
  });
});

describe("persistence policy: static only, never sensitive", () => {
  it("persists static lookups", () => {
    assert.strictEqual(shouldPersistKey("pgso:master-data:active", "static"), true);
    assert.strictEqual(shouldPersistKey("pgso:client:asset-custom-fields"), true);
  });
  it("never persists per-user snapshots (even legacy keys)", () => {
    for (const k of [
      "pgso:client:dashboard-snapshot",
      "pgso:client:requests-list",
      "pgso:client:employee-assets-snapshot",
      "pgso:client:admin-users-snapshot",
      "pgso:assets:unified:1:15:::all:all:all:all:all",
    ]) {
      assert.strictEqual(shouldPersistKey(k), false, `${k} must be memory-only`);
    }
    assert.strictEqual(shouldPersistKey("pgso:client:dashboard-snapshot", "sensitive"), false);
  });
  it("v2 list keys are memory-only (per-scope)", () => {
    const k = buildQueryKey({ module: "personnel", resource: "dashboard", page: 1, pageSize: 1, filters: {}, role: "pgso_personnel", userId: "u1" });
    assert.strictEqual(shouldPersistKey(k), false);
  });
});

describe("server scopedKey embeds user + role (source shape)", () => {
  const cacheSrc = src("../lib/personnel-cache.ts");
  it("embeds user id as `u`", () => {
    assert.ok(cacheSrc.includes("u: userId"));
  });
  it("embeds super-admin flag as `a`", () => {
    assert.ok(cacheSrc.includes("a: scope.isSuperAdmin ? 1 : 0"));
  });
  it("embeds full role as `r` (personnel vs employee vs admin never collide)", () => {
    assert.ok(cacheSrc.includes("r: scope.role"), "scopedKey must embed the full role string as `r`");
  });
});
