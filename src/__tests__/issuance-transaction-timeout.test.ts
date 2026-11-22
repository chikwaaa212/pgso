import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

/**
 * Interactive transactions on the hosted (Supabase) database spend ~1s per
 * round-trip, so a multi-statement body blows past Prisma's 5s default and
 * the action reports a failed assignment ("Transaction already closed").
 * Every interactive transaction that writes must therefore opt into a
 * longer budget.
 */
const TIMED: Array<[file: string, label: string]> = [
  ["../app/personnel/issuances/actions.ts", "issuance actions"],
  ["../lib/stock.ts", "inspection stocking"],
];

describe("interactive transactions keep headroom for remote DB latency", () => {
  for (const [file, label] of TIMED) {
    it(`${label}: every $transaction passes maxWait/timeout`, () => {
      const body = src(file);
      // Ignore type-level mentions such as "transaction catch" comments.
      const calls = body.match(/prisma\.\$transaction\(/g) ?? [];
      const configured =
        body.match(/maxWait:\s*\d+_?\d*,\s*timeout:\s*\d+_?\d*/g) ?? [];
      assert.equal(
        configured.length,
        calls.length,
        `${label} has ${calls.length} interactive transaction(s) but only ${configured.length} with an explicit budget`
      );
    });

    it(`${label}: timeout is generous enough for slow round-trips`, () => {
      const body = src(file);
      const timeouts = [
        ...body.matchAll(/timeout:\s*(\d[\d_]*)/g),
      ].map((m) => Number(m[1].replace(/_/g, "")));
      assert.ok(timeouts.length > 0, `${label} must configure a timeout`);
      for (const value of timeouts) {
        assert.ok(
          value >= 30_000,
          `${label} timeout ${value}ms is too close to the 5s default`
        );
      }
    });
  }
});
