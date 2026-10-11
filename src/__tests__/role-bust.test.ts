import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (p: string) =>
  readFileSync(new URL(p, import.meta.url), "utf8");

// Every server path that writes profiles.role/status must clear both role
// caches (in-memory 60s + middleware Redis 60s) for the target user —
// otherwise a deactivation or role change stays visible for up to 60s.
// Exempt by construction (documented below): employee/profile-actions.ts and
// personnel/department/actions.ts only write name/office/completion fields,
// never role/status, so the {role,status} cache cannot go stale through them.
describe("role/status writes bust the role caches (≤60s propagation)", () => {
  const writers = [
    "app/super-admin/users/actions.ts",
    "app/super-admin/dashboard/actions.ts",
    "app/(auth)/auth.ts",
  ];
  for (const file of writers) {
    it(`${file} clears the in-memory role cache`, () => {
      assert.ok(
        src(`../${file}`).includes("bustRoleCache"),
        `${file} must call bustRoleCache on role/status writes`
      );
    });
    it(`${file} clears the middleware role cache`, () => {
      assert.ok(
        src(`../${file}`).includes("bustMiddlewareRoleCache"),
        `${file} must call bustMiddlewareRoleCache on role/status writes`
      );
    });
  }
  it("non-role profile writes stay exempt (no role/status in their payloads)", () => {
    const employee = src("../app/employee/profile-actions.ts");
    const dept = src("../app/personnel/department/actions.ts");
    for (const [name, body] of [
      ["employee/profile-actions", employee],
      ["personnel/department/actions", dept],
    ] as const) {
      assert.ok(
        !/role\s*:|status\s*:/.test(
          body.slice(body.indexOf("prisma.profile.update"))
        ),
        `${name} must not start writing role/status without a bust`
      );
    }
  });
  it("logout clears the role caches (stale session must not linger)", () => {
    const auth = src("../app/(auth)/auth.ts");
    const logout = auth.slice(auth.indexOf("export async function logout"));
    assert.ok(logout.includes("bustRoleCache"), "logout busts in-memory cache");
    assert.ok(
      logout.includes("bustMiddlewareRoleCache"),
      "logout busts middleware cache"
    );
  });
});
