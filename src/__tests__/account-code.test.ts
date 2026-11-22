import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ACCOUNT_CODE_PREFIX,
  formatAccountCode,
  nextAccountCode,
} from "../lib/account-code";

describe("system account codes", () => {
  it("formats the AST/STK block template", () => {
    assert.equal(formatAccountCode("AST", 1), "AST-000-00-01");
    assert.equal(formatAccountCode("AST", 12345), "AST-001-23-45");
    assert.equal(formatAccountCode("STK", 99), "STK-000-00-99");
    assert.equal(ACCOUNT_CODE_PREFIX.asset, "AST");
    assert.equal(ACCOUNT_CODE_PREFIX.stock, "STK");
  });

  it("allocates the next code and ignores legacy/catalog codes", () => {
    assert.equal(nextAccountCode("asset", []), "AST-000-00-01");
    assert.equal(
      nextAccountCode("asset", [
        "1-07-05-010",
        "AST-000-00-01",
        "AST-000-00-00",
        null,
        undefined,
      ]),
      "AST-000-00-02"
    );
    assert.equal(
      nextAccountCode("stock", ["STK-000-00-09", "STK-000-00-10"]),
      "STK-000-00-11"
    );
  });

  it("keeps asset and stock sequences independent", () => {
    const asset = nextAccountCode("asset", ["STK-000-00-99"]);
    const stock = nextAccountCode("stock", ["AST-000-00-99"]);
    assert.equal(asset, "AST-000-00-01");
    assert.equal(stock, "STK-000-00-01");
  });
});
