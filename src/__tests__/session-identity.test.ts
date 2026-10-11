import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (p: string) =>
  readFileSync(new URL(p, import.meta.url), "utf8");

// Initial page load after login must not pay duplicate Auth-server
// round-trips: layouts + pages share one memoized, claims-first identity
// (getSessionIdentity) instead of each calling supabase.auth.getUser().
// Target: ≤4 parallel data requests on first paint; these RSC sites must
// contribute zero extra Auth RTTs beyond the shared one.
describe("shared memoized session identity (no duplicate getUser)", () => {
  const scope = src("../lib/personnel-scope.ts");
  it("personnel-scope exports a memoized claims-first getSessionIdentity", () => {
    assert.match(scope, /export const getSessionIdentity = cache\(/);
    assert.ok(scope.includes("getClaims"), "claims fast path present");
    assert.ok(scope.includes("auth.getUser()"), "getUser fallback present");
  });
  for (const file of [
    "app/employee/layout.tsx",
    "app/employee/dashboard/page.tsx",
    "app/personnel/sidebar-loader.tsx",
    "lib/auth-guard.ts",
  ]) {
    it(`${file} reuses the shared identity`, () => {
      const body = src(`../${file}`);
      assert.ok(
        body.includes("getSessionIdentity"),
        `${file} must use getSessionIdentity`
      );
      assert.ok(
        !body.includes("supabase.auth.getUser()"),
        `${file} must not call getUser() directly`
      );
    });
  }
});
