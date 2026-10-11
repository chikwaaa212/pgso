import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { etagForText, etagForBytes, notModified } from "../lib/etag";

const src = (p: string) =>
  readFileSync(new URL(p, import.meta.url), "utf8");

describe("etag helper (pure)", () => {
  it("is deterministic per payload", () => {
    assert.strictEqual(etagForText("hello"), etagForText("hello"));
    assert.notStrictEqual(etagForText("hello"), etagForText("world"));
  });
  it("differs by length even on hash collision attempts", () => {
    assert.notStrictEqual(etagForText("a"), etagForText("aa"));
  });
  it("bytes variant is deterministic", () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2, 3]);
    const c = new Uint8Array([1, 2, 4]);
    assert.strictEqual(etagForBytes(a), etagForBytes(b));
    assert.notStrictEqual(etagForBytes(a), etagForBytes(c));
  });
  it("notModified returns 304 on ETag match, null otherwise", async () => {
    const etag = etagForText('{"units":[]}');
    const match = new Request("http://x/api/master-data", {
      headers: { "If-None-Match": etag },
    });
    const hit = notModified(match, etag);
    assert.ok(hit instanceof Response);
    assert.strictEqual(hit.status, 304);
    const miss = new Request("http://x/api/master-data");
    assert.strictEqual(notModified(miss, etag), null);
    const stale = new Request("http://x/api/master-data", {
      headers: { "If-None-Match": '"stale"' },
    });
    assert.strictEqual(notModified(stale, etag), null);
  });
});

describe("GET /api/master-data: cached + conditional + private", () => {
  const route = src("../app/api/master-data/route.ts");
  it("server-caches the static payload (300s shared lookup)", () => {
    assert.match(route, /withCache\(/);
    assert.match(route, /master-data:active/);
  });
  it("emits ETag and honors If-None-Match (304)", () => {
    assert.match(route, /ETag/);
    assert.match(route, /notModified\(req, etag\)/);
    assert.match(route, /304/);
  });
  it("is private (authenticated payloads never proxy-cacheable)", () => {
    assert.match(route, /private, max-age/);
    assert.ok(!/["']public,/.test(route), "must never emit public Cache-Control");
  });
  it("errors are no-store", () => {
    assert.ok(route.includes("no-store"), "401/403/500 must stay no-store");
  });
});

describe("useMasterData: cached static lookup with ETag revalidation", () => {
  const hook = src("../hooks/use-master-data.ts");
  it("paints from persisted cache, dedupes in-flight", () => {
    assert.match(hook, /getClientCache/);
    assert.match(hook, /masterInflight/);
  });
  it("sends If-None-Match and handles 304", () => {
    assert.match(hook, /If-None-Match/);
    assert.match(hook, /status === 304/);
  });
  it("no longer uses bare cache:no-store on every mount", () => {
    // A no-store fetch remains ONLY as the 304-without-local-copy fallback.
    const bare = hook.match(/cache:\s*"no-store"/g) ?? [];
    assert.ok(bare.length <= 1, "at most the 304 fallback may bypass cache");
    assert.match(hook, /defaultsFor\("static"\)/);
  });
});

describe("filled xlsx downloads stay private/no-store (sensitive)", () => {
  for (const r of [
    "../app/api/personnel/issuances/[id]/par-xlsx/route.ts",
    "../app/api/personnel/issuances/[id]/ics-xlsx/route.ts",
    "../app/api/employee/issuances/[id]/par-xlsx/route.ts",
    "../app/api/employee/issuances/[id]/ics-xlsx/route.ts",
  ]) {
    it(`${r}: no-store, never public`, () => {
      const body = src(r);
      assert.ok(body.includes("no-store"), "filled workbooks must stay no-store");
      assert.ok(!/["']public,/.test(body), "filled workbooks must never be public");
    });
  }
});
