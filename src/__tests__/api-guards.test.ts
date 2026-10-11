import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ANY_SIGNED_IN_API_ROLES,
  EMPLOYEE_API_ROLES,
  PERSONNEL_API_ROLES,
  SUPER_ADMIN_API_ROLES,
  isUuid,
  resolveApiAccess,
} from "../lib/api-guard";
import { resolveEmployeeExportAccess } from "../lib/employee-export";

const src = (p: string) =>
  readFileSync(new URL(p, import.meta.url), "utf8");

/** Guard order: auth (401) must precede role gate (403) precedes lookup (404). */
function assertGuardOrder(
  file: string,
  opts: { auth: RegExp; gate: RegExp; lookup: RegExp }
) {
  const iAuth = file.search(opts.auth);
  const iGate = file.search(opts.gate);
  const iLookup = file.search(opts.lookup);
  assert.ok(iAuth >= 0, "401 auth block present");
  assert.ok(iGate >= 0, "403 role gate present");
  assert.ok(iLookup >= 0, "resource lookup present");
  assert.ok(iAuth < iGate, "401 precedes 403");
  assert.ok(iGate < iLookup, "403 precedes resource lookup (404 only for authorized callers)");
}

describe("api/health stays public (load-balancer checks)", () => {
  it("has no auth gate and middleware lists it public", () => {
    const route = src("../app/api/health/route.ts");
    assert.doesNotMatch(route, /401|getUser/);
    const middleware = src("../../middleware.ts");
    assert.match(middleware, /\/api\/health/);
  });
});

describe("api/master-data (any signed-in role)", () => {
  it("401 anonymous, 403 unknown/inactive, 200 all three roles", () => {
    assert.equal(
      resolveApiAccess({ userId: null, role: null, status: null }, ANY_SIGNED_IN_API_ROLES),
      401
    );
    assert.equal(
      resolveApiAccess({ userId: "u", role: "ghost", status: "active" }, ANY_SIGNED_IN_API_ROLES),
      403
    );
    assert.equal(
      resolveApiAccess({ userId: "u", role: "pgso_personnel", status: "inactive" }, ANY_SIGNED_IN_API_ROLES),
      403
    );
    for (const role of ["super_admin", "pgso_personnel", "employee"] as const) {
      assert.equal(
        resolveApiAccess({ userId: "u", role, status: "active" }, ANY_SIGNED_IN_API_ROLES),
        200
      );
    }
  });
});

describe("personnel template-xlsx routes (assets + ppmp)", () => {
  for (const p of [
    "../app/api/personnel/assets/template-xlsx/route.ts",
    "../app/api/personnel/ppmp/template-xlsx/route.ts",
  ]) {
    it(`${p}: 401 → 403 → resource (no lookup to leak)`, () => {
      const file = src(p);
      assertGuardOrder(file, {
        auth: /status:\s*401/,
        gate: /status:\s*403/,
        // Static builders have no DB lookup to leak; anchor on the workbook
        // serialization that runs after the gate (definitions live above it).
        lookup: /\.xlsx\.writeBuffer\(\)/,
      });
    });
  }
  it("403 for employee, inactive, and unknown roles", () => {
    assert.equal(
      resolveApiAccess({ userId: "u", role: "employee", status: "active" }, PERSONNEL_API_ROLES),
      403
    );
    assert.equal(
      resolveApiAccess({ userId: "u", role: "pgso_personnel", status: "inactive" }, PERSONNEL_API_ROLES),
      403
    );
    assert.equal(
      resolveApiAccess({ userId: "u", role: "ghost", status: "active" }, PERSONNEL_API_ROLES),
      403
    );
    assert.equal(
      resolveApiAccess({ userId: null, role: null, status: null }, PERSONNEL_API_ROLES),
      401
    );
    for (const role of ["pgso_personnel", "super_admin"] as const) {
      assert.equal(
        resolveApiAccess({ userId: "u", role, status: "active" }, PERSONNEL_API_ROLES),
        200
      );
    }
  });
});

describe("super-admin catalog-template-xlsx", () => {
  it("401 → 403 → resource; personnel get 403", () => {
    const file = src("../app/api/super-admin/master-data/catalog-template-xlsx/route.ts");
    assertGuardOrder(file, {
      auth: /status:\s*401/,
      gate: /status:\s*403/,
      lookup: /buildCatalogTemplateWorkbook\(\)/,
    });
    assert.equal(
      resolveApiAccess({ userId: "u", role: "pgso_personnel", status: "active" }, SUPER_ADMIN_API_ROLES),
      403
    );
    assert.equal(
      resolveApiAccess({ userId: "u", role: "super_admin", status: "active" }, SUPER_ADMIN_API_ROLES),
      200
    );
    assert.equal(
      resolveApiAccess({ userId: null, role: null, status: null }, SUPER_ADMIN_API_ROLES),
      401
    );
  });
});

describe("personnel par-xlsx / ics-xlsx (guard order fixed)", () => {
  for (const [p, kind] of [
    ["../app/api/personnel/issuances/[id]/par-xlsx/route.ts", "PAR"],
    ["../app/api/personnel/issuances/[id]/ics-xlsx/route.ts", "ICS"],
  ] as const) {
    it(`${p}: UUID → 401 → 403 → scoped lookup → 404`, () => {
      const file = src(p);
      assert.match(file, /isUuid\(id\)/);
      assertGuardOrder(file, {
        auth: /status:\s*401/,
        gate: /status:\s*403/,
        lookup: /getIssuance\(id\)/,
      });
      // Row-level isolation documented: scoped lookup after the gate.
      assert.match(file, /created_by/);
    });
  }
  it("403 for employee and inactive; 404 (not 403) for foreign rows", () => {
    assert.equal(
      resolveApiAccess({ userId: "e", role: "employee", status: "active" }, PERSONNEL_API_ROLES),
      403
    );
    // Foreign-row isolation is the scoped lookup's 404 (created_by filter),
    // never reached by unauthorized callers — documented in guard.ts.
    const guard = src("../app/api/personnel/issuances/[id]/guard.ts");
    assert.match(guard, /created_by/);
    assert.match(guard, /status:\s*403/);
  });
});

describe("personnel air-xlsx (employee now 403)", () => {
  it("UUID → 401 → 403 role gate → owned lookup → 404", () => {
    const file = src("../app/api/personnel/inspections/[id]/air-xlsx/route.ts");
    assert.match(file, /isUuid\(id\)/);
    assertGuardOrder(file, {
      auth: /status:\s*401/,
      gate: /status:\s*403/,
      lookup: /getDeliveryForInspection\(id\)/,
    });
    assert.equal(
      resolveApiAccess({ userId: "e", role: "employee", status: "active" }, PERSONNEL_API_ROLES),
      403
    );
    assert.equal(
      resolveApiAccess({ userId: null, role: null, status: null }, PERSONNEL_API_ROLES),
      401
    );
  });
});

describe("employee par-xlsx / ics-xlsx (own records only)", () => {
  for (const [p, wantType] of [
    ["../app/api/employee/issuances/[id]/par-xlsx/route.ts", "PAR"],
    ["../app/api/employee/issuances/[id]/ics-xlsx/route.ts", "ICS"],
  ] as const) {
    it(`${p}: 401 → 403 → scoped lookup → 404`, () => {
      const file = src(p);
      // Auth marker is requireEmployee() (its catch maps Forbidden→403 /
      // else→401, so the 403 literal precedes the 401 literal in source).
      assertGuardOrder(file, {
        auth: /requireEmployee\(\)/,
        gate: /status:\s*403/,
        lookup: /getMyIssuanceDetail\(id\)/,
      });
      // 401 still present for anonymous.
      assert.match(file, /status:\s*401/);
      // Never reuses the personnel route.
      assert.doesNotMatch(file, /from "@\/app\/personnel\/issuances\/actions"/);
    });
  }
  it("decision matrix mirrors the personnel-route mirror image", () => {
    assert.equal(
      resolveEmployeeExportAccess({ userId: null, role: null, doc: null, wantType: "PAR" }),
      401
    );
    assert.equal(
      resolveEmployeeExportAccess({
        userId: "p",
        role: "pgso_personnel",
        doc: { employee_id: "p", doc_type: "PAR" },
        wantType: "PAR",
      }),
      403
    );
    assert.equal(
      resolveEmployeeExportAccess({
        userId: "ann",
        role: "employee",
        doc: { employee_id: "bob", doc_type: "PAR" },
        wantType: "PAR",
      }),
      404
    );
    assert.equal(
      resolveApiAccess({ userId: "ann", role: "employee", status: "active" }, EMPLOYEE_API_ROLES),
      200
    );
  });
});

describe("isUuid validation", () => {
  it("accepts UUIDs, rejects garbage (→404, never 500)", () => {
    assert.equal(isUuid("123e4567-e89b-12d3-a456-426614174000"), true);
    assert.equal(isUuid("not-an-id"), false);
    assert.equal(isUuid(""), false);
  });
});
