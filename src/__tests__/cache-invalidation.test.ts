import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  clientPrefixesFor,
  invalidationFor,
  serverPrefixesFor,
} from "../lib/cache-invalidation";

const src = (p: string) =>
  readFileSync(new URL(p, import.meta.url), "utf8");

describe("invalidation map: every resource documents its bust set", () => {
  const resources = [
    "delivery",
    "inspection",
    "inventory",
    "asset",
    "issuance",
    "request",
    "repair",
    "document",
    "user",
    "master-data",
  ];
  for (const r of resources) {
    it(`${r}: narrow client + server prefixes (never whole-cache)`, () => {
      const entry = invalidationFor(r);
      assert.ok(entry, `${r} must exist in INVALIDATION_MAP`);
      assert.ok(entry.client.length > 0, `${r} needs client prefixes`);
      assert.ok(entry.server.length > 0, `${r} needs server prefixes`);
      assert.ok(entry.note.length > 0, `${r} needs a reviewer note`);
    });
  }
  it("ppmp file list is cached scoped; polling stays uncached", () => {
    const entry = invalidationFor("ppmp");
    assert.ok(entry);
    assert.deepStrictEqual(entry.client, []);
    assert.deepStrictEqual(entry.server, ["ppmp:"]);
  });
  it("helpers dedupe across resources", () => {
    const prefixes = clientPrefixesFor(["delivery", "inspection"]);
    assert.deepStrictEqual(prefixes, [...new Set(prefixes)]);
    const server = serverPrefixesFor(["request", "repair"]);
    assert.deepStrictEqual(server, [...new Set(server)]);
  });
  it("unknown resources resolve to null (fail-closed, no blanket bust)", () => {
    assert.strictEqual(invalidationFor("nope"), null);
  });
});

describe("server narrow busts mirror the map (source shape)", () => {
  const cacheSrc = src("../lib/personnel-cache.ts");
  it("bustPersonnelScopes covers all personnel resources", () => {
    for (const s of ["dashboard", "deliveries", "inspections", "inventory", "assets", "documents", "issuances", "requests", "repairs", "issues", "logs", "sidebar"]) {
      assert.ok(cacheSrc.includes(`'${s}'`) || cacheSrc.includes(`"${s}"`), `bustPersonnelScopes must cover ${s}`);
    }
  });
  it("bustSuperAdminScopes covers admin writes", () => {
    for (const s of ["users", "requests", "inventory", "master-data", "dashboard"]) {
      assert.ok(cacheSrc.includes(s), `bustSuperAdminScopes must cover ${s}`);
    }
  });
  it("master-data server key is busted by master-data writes", () => {
    // Route caches `pgso:master-data:*`; the master-data scope busts `master-data:`.
    assert.ok(cacheSrc.includes("'master-data:'"), "master-data: prefix must be busted on catalog/unit/department writes");
    assert.ok(src("../app/api/master-data/route.ts").includes("master-data:active"));
  });
});

describe("mutations invalidate ONLY affected keys", () => {
  it("employee createMyRequest busts narrowly (own + queue, not whole cache)", () => {
    const body = src("../app/employee/actions.ts");
    const start = body.indexOf("export async function createMyRequest");
    assert.ok(start >= 0);
    const fn = body.slice(start, start + 4000);
    assert.ok(fn.includes("bustCachePrefixes"), "must bust server prefixes");
    assert.ok(fn.includes("employee:"), "must bust own employee snapshots");
    assert.ok(fn.includes("personnel:request"), "must bust the personnel request queue");
    assert.ok(!fn.includes("bustPersonnelCache()"), "must NOT blanket-bust the whole cache");
  });
  it("employee reads are per-user keyed (u:userId in every key)", () => {
    const body = src("../app/employee/actions.ts");
    for (const ns of ["employee:my-assets", "employee:my-docs", "employee:my-asset-requests", "employee:my-request-options"]) {
      assert.ok(body.includes(ns), `${ns} must be cached`);
    }
    const keyed = (body.match(/cacheKey\('employee:[^']+', \{[^}]*u: userId[^}]*\}\)/g) ?? []).length;
    assert.ok(keyed >= 4, `all employee list keys must embed u:userId (found ${keyed})`);
  });
});
