import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isTransferTo,
  parseTransferTarget,
  selectIncomingIds,
} from "../lib/transfer-target";
import { resolveEmployeeExportAccess } from "../lib/employee-export";

describe("parseTransferTarget exactness", () => {
  it("parses a bare transfer name", () => {
    assert.equal(parseTransferTarget("Transfer to Ann"), "Ann");
  });
  it("strips the location suffix", () => {
    assert.equal(parseTransferTarget("Transfer to Ann — Room 101"), "Ann");
  });
  it("keeps multiword names intact (no Annalise confusion)", () => {
    assert.equal(parseTransferTarget("Transfer to Annalise"), "Annalise");
  });
  it("returns empty for non-transfer descriptions", () => {
    assert.equal(parseTransferTarget("Repair needed\nScreen flicker"), "");
    assert.equal(parseTransferTarget(""), "");
  });
});

describe("isTransferTo exact match (Ann vs Annalise)", () => {
  it("matches exact names case-insensitively", () => {
    assert.equal(isTransferTo("Transfer to Ann", "ann"), true);
    assert.equal(isTransferTo("Transfer to Ann — Registrar", "Ann"), true);
  });
  it("never substring-matches", () => {
    assert.equal(isTransferTo("Transfer to Annalise", "Ann"), false);
    assert.equal(isTransferTo("Transfer to Ann", "Annalise"), false);
  });
  it("empty names never match", () => {
    assert.equal(isTransferTo("Transfer to Ann", ""), false);
    assert.equal(isTransferTo("Transfer to Ann", "   "), false);
  });
});

describe("selectIncomingIds scoping", () => {
  const candidates = [
    { id: "a1", description: "Transfer to Ann\nLaptop" },
    { id: "a2", description: "Transfer to Annalise\nMonitor" },
    { id: "a3", description: "Transfer to Ann — Room 101\nChair" },
    { id: "a4", description: "Repair needed\nScreen" },
  ];
  it("employee sees ONLY transfers addressed to them", () => {
    assert.deepEqual(selectIncomingIds(candidates, "Ann"), ["a1", "a3"]);
  });
  it("a different employee cannot see Ann's transfers", () => {
    assert.deepEqual(selectIncomingIds(candidates, "Annalise"), ["a2"]);
    assert.deepEqual(selectIncomingIds(candidates, "Bob"), []);
  });
  it("caps the result (never the whole queue)", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      id: `t${i}`,
      description: "Transfer to Ann",
    }));
    assert.equal(selectIncomingIds(many, "Ann").length, 20);
  });
});

describe("resolveEmployeeExportAccess (401 → 403 → 404 → 200)", () => {
  it("401 for anonymous", () => {
    assert.equal(
      resolveEmployeeExportAccess({ userId: null, role: null, doc: null, wantType: "PAR" }),
      401
    );
  });
  it("403 for the wrong role", () => {
    for (const role of ["pgso_personnel", "super_admin"]) {
      assert.equal(
        resolveEmployeeExportAccess({
          userId: "u1",
          role,
          doc: { employee_id: "u1", doc_type: "PAR" },
          wantType: "PAR",
        }),
        403
      );
    }
  });
  it("404 for anyone else's row (no existence leak)", () => {
    assert.equal(
      resolveEmployeeExportAccess({
        userId: "ann",
        role: "employee",
        doc: { employee_id: "bob", doc_type: "PAR" },
        wantType: "PAR",
      }),
      404
    );
  });
  it("404 for missing docs and wrong types", () => {
    assert.equal(
      resolveEmployeeExportAccess({ userId: "ann", role: "employee", doc: null, wantType: "PAR" }),
      404
    );
    assert.equal(
      resolveEmployeeExportAccess({
        userId: "ann",
        role: "employee",
        doc: { employee_id: "ann", doc_type: "ICS" },
        wantType: "PAR",
      }),
      404
    );
  });
  it("200 only for own rows of the right type", () => {
    assert.equal(
      resolveEmployeeExportAccess({
        userId: "ann",
        role: "employee",
        doc: { employee_id: "ann", doc_type: "PAR" },
        wantType: "PAR",
      }),
      200
    );
  });
});

describe("employee wiring (source asserts)", () => {
  const actions = readFileSync(
    new URL("../app/employee/actions.ts", import.meta.url),
    "utf8"
  );
  it("downloadHref uses the employee-scoped export, not personnel", () => {
    assert.match(actions, /\/api\/employee\/issuances\//);
    const myDocs = actions.slice(actions.indexOf("export async function getMyDocs"));
    assert.doesNotMatch(myDocs.slice(0, 2500), /\/api\/personnel\/issuances\//);
  });
  it("candidate scan is minimal columns and bounded", () => {
    assert.match(actions, /request_type:\s*'transfer'/);
    assert.match(actions, /take:\s*200/);
    assert.match(actions, /select:\s*{\s*id:\s*true,\s*description:\s*true\s*}/);
  });
  it("incoming rows tag direction incoming and merge with mine", () => {
    assert.match(actions, /direction:\s*'incoming'/);
    assert.match(actions, /getIncomingTransferRows/);
  });
});
