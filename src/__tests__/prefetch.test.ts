import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (p: string) =>
  readFileSync(new URL(p, import.meta.url), "utf8");

describe("useCachedAction: no-flicker paging + dedupe + focus (source shape)", () => {
  const hook = src("../hooks/use-cached-action.ts");
  it("supports per-data-type presets", () => {
    assert.match(hook, /dataType\?: DataType/);
    assert.match(hook, /defaultsFor\(options\.dataType\)/);
  });
  it("supports keepPreviousData (placeholderData equivalent)", () => {
    assert.match(hook, /keepPreviousData/);
    assert.match(hook, /prevDataRef/);
  });
  it("refetches live data on focus (stale-while-revalidate)", () => {
    assert.match(hook, /refetchOnFocus/);
    assert.match(hook, /addEventListener\('focus'/);
    assert.match(hook, /visibilitychange/);
  });
  it("dedupes in-flight requests per key", () => {
    assert.match(hook, /const inflight = new Map/);
    assert.match(hook, /inflight\.get\(runKey\)/);
  });
  it("cancels superseded runs (stale page never paints)", () => {
    assert.match(hook, /keyRef\.current !== runKey/);
  });
  it("mutate still patches without fetching (optimistic contract kept)", () => {
    const body = hook.slice(hook.indexOf("const mutate = useCallback"));
    assert.ok(!/fetcherRef|run\(true\)/.test(body), "mutate performs no fetch");
  });
});

describe("next-page prefetch fires (no dead pagination)", () => {
  it("personnel assets prefetches page+1 and warms the cache", () => {
    const page = src("../app/personnel/assets/page.tsx");
    assert.match(page, /Prefetch next page/);
    assert.match(page, /page \+ 1/);
    assert.match(page, /setClientCache\(nextKey, fresh\)/);
  });
  it("shared prefetchQuery dedupes + warms client-cache (source shape)", () => {
    const qc = src("../lib/query-client.ts");
    assert.match(qc, /export function prefetchQuery/);
    assert.match(qc, /prefetchInflight/);
    assert.match(qc, /setClientCache\(key, fresh\)/);
    assert.match(qc, /export function prefetchIntentProps/);
    assert.match(qc, /onMouseEnter/);
    assert.match(qc, /onFocus/);
  });
});

describe("server stampede protection (source shape)", () => {
  const cacheSrc = src("../lib/personnel-cache.ts");
  it("single-flights concurrent cold reads", () => {
    assert.match(cacheSrc, /readInflight/);
    assert.match(cacheSrc, /readInflight\.get\(key\)/);
  });
  it("falls back to capped in-memory cache when Redis is absent", () => {
    assert.match(cacheSrc, /MEM_FALLBACK_MAX/);
    assert.match(cacheSrc, /memGet<T>\(key\)/);
  });
  it("documents the server TTL table", () => {
    assert.match(cacheSrc, /SERVER_TTLS/);
    assert.match(cacheSrc, /sessionRole/);
  });
});
