import { test } from "node:test";
import assert from "node:assert";
import { parseMoneyToCentavos } from "../lib/ppmp/money";
import { parseQuantityText } from "../lib/ppmp/qtyText";

test("money parses to integer centavos", () => {
  assert.strictEqual(parseMoneyToCentavos(100000), 10000000);
  assert.strictEqual(parseMoneyToCentavos(36022.7), 3602270);
  assert.strictEqual(parseMoneyToCentavos("₱1,200.00"), 120000);
  assert.strictEqual(parseMoneyToCentavos("2,506.00"), 250600);
  assert.strictEqual(parseMoneyToCentavos(" 5000 "), 500000);
  assert.strictEqual(parseMoneyToCentavos(""), null);
  assert.strictEqual(parseMoneyToCentavos("TBD"), null);
  assert.strictEqual(parseMoneyToCentavos("N/A"), null);
  assert.strictEqual(parseMoneyToCentavos("(500)"), null);
});

test("quantity text parses observed GPPB shapes", () => {
  assert.deepStrictEqual(parseQuantityText("10 reams"), {
    qty: 10,
    unit: "reams",
    priceCents: null,
    head: null,
    unparseable: false,
  });
  assert.deepStrictEqual(parseQuantityText("1 Lot"), {
    qty: 1,
    unit: "Lot",
    priceCents: null,
    head: null,
    unparseable: false,
  });
  assert.deepStrictEqual(parseQuantityText("1 JO"), {
    qty: 1,
    unit: "JO",
    priceCents: null,
    head: null,
    unparseable: false,
  });
  assert.deepStrictEqual(parseQuantityText("Rice @ 2,506.00/sack"), {
    qty: null,
    unit: "sack",
    priceCents: 250600,
    head: "Rice",
    unparseable: false,
  });
  const diesel = parseQuantityText("Diesel Fuel 60.00/liter");
  assert.strictEqual(diesel.qty, null);
  assert.strictEqual(diesel.unit, "liter");
  assert.strictEqual(diesel.priceCents, 6000);
  assert.strictEqual(diesel.head, "Diesel Fuel");
  assert.strictEqual(parseQuantityText("").qty, null);
});
