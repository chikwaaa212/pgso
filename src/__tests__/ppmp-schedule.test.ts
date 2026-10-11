import { test } from "node:test";
import assert from "node:assert";
import {
  parseScheduleMonth,
  quarterOf,
  splitScheduleRange,
} from "../lib/ppmp/schedule";

test("parses every observed schedule shape", () => {
  assert.deepStrictEqual(parseScheduleMonth("July 2026", 2026), { year: 2026, month: 7 });
  assert.deepStrictEqual(parseScheduleMonth("February 2026", 2026), { year: 2026, month: 2 });
  assert.deepStrictEqual(parseScheduleMonth("01/2026", null), { year: 2026, month: 1 });
  assert.deepStrictEqual(parseScheduleMonth("April-2026", null), { year: 2026, month: 4 });
  assert.deepStrictEqual(parseScheduleMonth("Feb. 2026", null), { year: 2026, month: 2 });
  assert.deepStrictEqual(parseScheduleMonth(new Date(2026, 5, 1), null), { year: 2026, month: 6 });
  assert.strictEqual(parseScheduleMonth("", null), null);
  assert.strictEqual(parseScheduleMonth("TBD", null), null);
  assert.strictEqual(parseScheduleMonth("June", 2026), null);
});

test("ranges split into endpoints; delivery uses the end", () => {
  const [start, end] = splitScheduleRange("From 01/2026 to 06/2026", 2026);
  assert.deepStrictEqual(start, { year: 2026, month: 1 });
  assert.deepStrictEqual(end, { year: 2026, month: 6 });
  assert.strictEqual(quarterOf({ year: 2026, month: 6 }), 2);
  assert.strictEqual(quarterOf({ year: 2026, month: 1 }), 1);
  assert.strictEqual(quarterOf({ year: 2026, month: 7 }), 3);
  assert.strictEqual(quarterOf({ year: 2026, month: 12 }), 4);
});
