import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  inspectionRef,
  inspectionHref,
  parseInspectionRefParam,
} from "../lib/inspection-ref";

const UUID = "d37e5ded-b2c8-4ccd-a6a2-aa8a5ee4639e";

describe("inspection references", () => {
  it("builds the short display reference from the delivery UUID", () => {
    assert.equal(inspectionRef(UUID), "INS-D37E5DED");
  });

  it("builds detail and nested-tab URLs", () => {
    assert.equal(
      inspectionHref(UUID),
      "/personnel/inspections/INS-D37E5DED"
    );
    assert.equal(
      inspectionHref(UUID, "/receipt"),
      "/personnel/inspections/INS-D37E5DED/receipt"
    );
  });

  it("parses the canonical reference to an 8-char prefix", () => {
    assert.deepEqual(parseInspectionRefParam("INS-D37E5DED"), {
      prefix: "d37e5ded",
    });
    assert.deepEqual(parseInspectionRefParam("INS-d37e5ded"), {
      prefix: "d37e5ded",
    });
  });

  it("accepts a bare 8-char reference", () => {
    assert.deepEqual(parseInspectionRefParam("D37E5DED"), {
      prefix: "d37e5ded",
    });
  });

  it("passes legacy full UUIDs through unchanged", () => {
    assert.deepEqual(parseInspectionRefParam(UUID), { id: UUID });
  });

  it("decodes URL-encoded references", () => {
    assert.deepEqual(parseInspectionRefParam("INS-D37E5DED"), {
      prefix: "d37e5ded",
    });
  });

  it("rejects malformed params", () => {
    assert.deepEqual(parseInspectionRefParam("not-a-reference"), {});
    assert.deepEqual(parseInspectionRefParam("INS-1234"), {});
    assert.deepEqual(parseInspectionRefParam(""), {});
  });
});