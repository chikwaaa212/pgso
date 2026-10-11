import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (p: string) =>
  readFileSync(new URL(p, import.meta.url), "utf8");

describe("logout clears the ENTIRE client cache (no cross-role leakage)", () => {
  const cache = src("../lib/client-cache.ts");
  it("exposes clearAllClientCache (memory + every pgso: session key)", () => {
    assert.match(cache, /export function clearAllClientCache/);
    const body = cache.slice(cache.indexOf("export function clearAllClientCache"));
    assert.match(body, /memory\.clear\(\)/);
    assert.match(body, /sessionStorage/);
  });
  it("setClientCache persists ONLY static lookups (sensitive stays memory-only)", () => {
    const body = cache.slice(cache.indexOf("export function setClientCache"));
    assert.match(body, /shouldPersistKey\(key\)/);
    assert.ok(!/writeSession\(key, entry\)\s*\n\s*return/.test(body), "unconditional persist must be gone");
  });
  it("one-time migration drops legacy persisted snapshots", () => {
    assert.match(cache, /export function clearLegacyPersistedSnapshots/);
  });
  it("identity helpers detect user/role change", () => {
    assert.match(cache, /export function setClientIdentity/);
    assert.match(cache, /export function getClientIdentity/);
  });
});

describe("logout buttons clear immediately + broadcast cross-tab", () => {
  const manager = src("../components/ClientCacheManager.tsx");
  it("manager clears on auth pages (logout-redirect backstop)", () => {
    assert.match(manager, /clearAllClientCache\(\)/);
    assert.ok(manager.includes("/login"), "must treat /login as an auth path");
    assert.ok(manager.includes("/signup"), "must treat /signup as an auth path");
  });
  it("manager relays clears across tabs (storage broadcast)", () => {
    assert.match(manager, /LOGOUT_BROADCAST_KEY/);
    assert.match(manager, /addEventListener\("storage"/);
    assert.match(manager, /export function broadcastLogout/);
  });
  it("manager runs legacy migration on mount", () => {
    assert.match(manager, /clearLegacyPersistedSnapshots\(\)/);
  });
  for (const nav of [
    "../components/personnel/PersonnelNavbar.tsx",
    "../components/super-admin/SuperAdminNavbar.tsx",
    "../components/employee/EmployeeNavbar.tsx",
  ]) {
    it(`${nav}: both logout forms clear before the server round-trip`, () => {
      const body = src(nav);
      assert.match(body, /broadcastLogout/);
      const hits = body.match(/onSubmit=\{\(\) => broadcastLogout\(\)\}/g) ?? [];
      assert.strictEqual(hits.length, 2, `${nav} must wire both (desktop + mobile) logout forms`);
    });
  }
  it("root layout mounts the manager on every page", () => {
    const layout = src("../components/layout/LayoutClient.tsx");
    assert.match(layout, /ClientCacheManager/);
  });
});

describe("server role caches still bust on logout (existing guarantee kept)", () => {
  it("auth.ts logout busts in-memory + middleware caches", () => {
    const auth = src("../app/(auth)/auth.ts");
    const logout = auth.slice(auth.indexOf("export async function logout"));
    assert.ok(logout.includes("bustRoleCache"));
    assert.ok(logout.includes("bustMiddlewareRoleCache"));
  });
});
