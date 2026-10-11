import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { invalidationFor } from "../lib/cache-invalidation";

const src = (p: string) =>
  readFileSync(new URL(p, import.meta.url), "utf8");

describe("Phase 0A: PPMP file list cached scoped, busted on write", () => {
  const actions = src("../app/personnel/ppmp/actions.ts");
  const fnBody = (name: string) => {
    const start = actions.indexOf(`export async function ${name}`);
    assert.ok(start >= 0, `${name} present`);
    const next = actions.indexOf("export async function", start + 10);
    return actions.slice(start, next < 0 ? undefined : next);
  };
  it("listPpmpFiles reads through scoped cache (30s, per-caller isolation)", () => {
    const body = fnBody("listPpmpFiles");
    assert.match(body, /withScopedCache\("ppmp:files", 30/);
    // Auth gate stays BEFORE the cache read (never serve cache to guests).
    assert.ok(
      body.indexOf("getPersonnelScope") < body.indexOf("withScopedCache"),
      "scope check must precede the cache read"
    );
  });
  it("listPpmpFiles never throws (outer catch returns [])", () => {
    const body = fnBody("listPpmpFiles");
    assert.match(body, /catch[\s\S]*console\.error\("\[listPpmpFiles\]"[\s\S]*return \[\]/);
  });
  it("import + delete bust the ppmp: prefix (narrow, not blanket)", () => {
    assert.match(actions, /bustCachePrefixes\(\["ppmp:"\]\)/);
    assert.ok(!/bustPersonnelCache\(\)/.test(actions), "blanket bust must be gone from ppmp writes");
    // Both write paths funnel through the file-local helper.
    assert.strictEqual(
      (actions.match(/revalidatePath\("\/personnel\/ppmp"\)/g) ?? []).length,
      2,
      "import + delete must both invalidate"
    );
  });
  it("analysis status polling stays uncached (live job tracker)", () => {
    const analytics = src("../app/personnel/ppmp/analytics/actions.ts");
    for (const name of ["getAnalysisStatus", "getAnalysisResult"]) {
      const start = analytics.indexOf(`export async function ${name}`);
      assert.ok(start >= 0, `${name} present`);
      const next = analytics.indexOf("export async function", start + 10);
      const body = analytics.slice(start, next < 0 ? undefined : next);
      assert.ok(
        !/withCache|withScopedCache/.test(body),
        `${name} must stay uncached (live poll)`
      );
    }
  });
  it("invalidation map documents the ppmp scope", () => {
    assert.deepStrictEqual(invalidationFor("ppmp")?.server, ["ppmp:"]);
  });
});

describe("Phase 0B: employee dashboard greeting cached per user", () => {
  const page = src("../app/employee/dashboard/page.tsx");
  it("greeting reads through a per-user key (60s)", () => {
    assert.match(page, /cacheKey\('employee:dashboard', \{ u: userId \}\)/);
    assert.match(page, /withCache\(\s*cacheKey\('employee:dashboard'/);
  });
  it("profile completion busts only the greeting prefix", () => {
    const body = src("../app/employee/profile-actions.ts");
    assert.match(body, /bustCachePrefixes\(\['employee:dashboard'\]\)/);
    // Still exempt from role-cache rules (no role/status writes here).
    const update = body.slice(body.indexOf("prisma.profile.update"));
    assert.ok(!/role\s*:|status\s*:/.test(update), "must not start writing role/status");
  });
});

describe("Phase 0C: employee issuance detail cached per user+record", () => {
  const actions = src("../app/employee/actions.ts");
  const fnBody = (name: string) => {
    const start = actions.indexOf(`export async function ${name}`);
    assert.ok(start >= 0, `${name} present`);
    const next = actions.indexOf("export async function", start + 10);
    return actions.slice(start, next < 0 ? undefined : next);
  };
  it("detail reads through a per-user per-record key (30s)", () => {
    const body = fnBody("getMyIssuanceDetail");
    assert.match(body, /cacheKey\('employee:issuance-detail', \{ u: userId, id \}\)/);
    assert.match(body, /cacheSet\(dk2, detail, 30\)/);
    // Auth + uuid validation stay BEFORE the cache read.
    assert.ok(
      body.indexOf("requireEmployee") < body.indexOf("cacheGet"),
      "auth must precede the cache read"
    );
    assert.ok(
      body.indexOf("0-9a-f]{8}") < body.indexOf("cacheGet"),
      "id validation must precede the cache read"
    );
  });
  it("personnel issuance writes bust the employee namespace (all 4 sites)", () => {
    const body = src("../app/personnel/issuances/actions.ts");
    const hits = body.match(/bustCachePrefixes\(\['employee:'\]\)/g) ?? [];
    assert.strictEqual(hits.length, 4, `all issuance write paths must bust employee: (found ${hits.length})`);
    // No blanket bust calls (strip comments first — a doc comment names it).
    const code = body.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.ok(!/bustPersonnelCache\(\)/.test(code), "no blanket bust in issuance writes");
  });
  it("invalidation map documents the employee scope on issuance", () => {
    assert.ok(invalidationFor("issuance")?.server.includes("employee:"));
  });
});
