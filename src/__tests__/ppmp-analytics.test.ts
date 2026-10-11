import { test } from "node:test";
import assert from "node:assert";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { CanonicalPpmpRow } from "../lib/ppmp/types";
import { runAnalysis } from "../lib/ppmp/analytics/index";
import type { YearFile } from "../lib/ppmp/analytics/types";
import { inspectWorkbook } from "../lib/ppmp/inspector";
import { parseLineSheet } from "../lib/ppmp/parser";

const CONFIG = {
  version: 1,
  qty_increase_pct: 25,
  cost_increase_pct: 30,
  anomaly_z: 2.0,
  trend_epsilon_pct: 5,
  forecast_min_history: 3,
  smoothing_alpha: 0.5,
};

function row(
  key: string,
  desc: string,
  year: number,
  qty: number | null,
  budgetPesos: number | null
): CanonicalPpmpRow {
  return {
    item_key: key,
    description: desc,
    project: null,
    type: "Goods",
    qty,
    unit: "reams",
    budget_cents: budgetPesos === null ? null : Math.round(budgetPesos * 100),
    budget_scope: "line",
    price_cents: null,
    total_cents: null,
    mode: "SVP",
    start: null,
    end: null,
    delivery: null,
    source_funds: "General Fund",
    office: "PGO",
    fiscal_year: year,
    category: "Office Supplies",
    source: {
      file_id: `file-${year}`,
      filename: `PPMP_${year}.xlsx`,
      sheet: "PPMP",
      row: 10,
      hash8: "deadbeef",
    },
    variant: "GPPB_12COL",
    confidence: qty === null ? "low" : "high",
    calc_notes: [],
  };
}

function filesFor(points: { year: number; qty: number | null; budget: number | null }[]): YearFile[] {
  return points.map((p) => ({
    fileId: `file-${p.year}`,
    filename: `PPMP_${p.year}.xlsx`,
    fiscalYear: p.year,
    rows: [row("bondpaper|reams", "Bond Paper", p.year, p.qty, p.budget)],
  }));
}

test("bond paper 1200/1500/1900: YoY, trend, recommendation", () => {
  const report = runAnalysis(
    filesFor([
      { year: 2024, qty: 1200, budget: 60000 },
      { year: 2025, qty: 1500, budget: 75000 },
      { year: 2026, qty: 1900, budget: 95000 },
    ]),
    CONFIG
  );
  assert.strictEqual(report.yoy.length, 2);
  assert.strictEqual(report.yoy[0].abs_change, 300);
  assert.ok(Math.abs((report.yoy[0].pct_change as number) - 25) < 1e-9);
  assert.ok(Math.abs((report.yoy[1].pct_change as number) - 26.6667) < 0.01);
  assert.strictEqual(report.trends[0].qty_class, "INCREASING");
  const multi = report.recommendations.find((r) => r.rule_id === "QTY_MULTI_YR");
  assert.ok(multi, "58.33% multi-year increase fires review: " + JSON.stringify(report.recommendations.map((r) => r.rule_id)));
  assert.ok(multi.calc_trace.includes("58.33"));
  assert.strictEqual(report.forecasts.length, 1);
  assert.strictEqual(report.forecasts[0].confidence, "LOW");
});

test("1000/1500/1100 classifies VOLATILE, not increasing", () => {
  const report = runAnalysis(
    filesFor([
      { year: 2024, qty: 1000, budget: 10000 },
      { year: 2025, qty: 1500, budget: 15000 },
      { year: 2026, qty: 1100, budget: 11000 },
    ]),
    CONFIG
  );
  assert.strictEqual(report.trends[0].qty_class, "VOLATILE");
});

test("stable series within epsilon classifies STABLE", () => {
  const report = runAnalysis(
    filesFor([
      { year: 2024, qty: 100, budget: 1000 },
      { year: 2025, qty: 102, budget: 1020 },
      { year: 2026, qty: 101, budget: 1010 },
    ]),
    CONFIG
  );
  assert.strictEqual(report.trends[0].qty_class, "STABLE");
  assert.strictEqual(report.anomalies.length, 0);
});

test("spike 100/105/220 flags yoy_spike anomaly for review", () => {
  const report = runAnalysis(
    filesFor([
      { year: 2024, qty: 100, budget: 1000 },
      { year: 2025, qty: 105, budget: 1050 },
      { year: 2026, qty: 220, budget: 2200 },
    ]),
    CONFIG
  );
  const spike = report.anomalies.find((a) => a.method === "yoy_spike");
  assert.ok(spike, "spike flagged: " + JSON.stringify(report.anomalies.map((a) => a.method)));
  assert.strictEqual(spike.status, "POTENTIAL ANOMALY");
  assert.ok(spike.message.includes("Review recommended"));
});

test("flat qty with +50% budget flags cost divergence, never fraud language", () => {
  const report = runAnalysis(
    filesFor([
      { year: 2024, qty: 100, budget: 50000 },
      { year: 2025, qty: 100, budget: 75000 },
    ]),
    CONFIG
  );
  const div = report.anomalies.find((a) => a.method === "cost_divergence");
  assert.ok(div, "divergence flagged");
  const allText = JSON.stringify(report);
  assert.ok(!/fraud|illegal|unnecessary|reject|approve/i.test(allText), "no verdict language");
});

test("single file with schedule gets momentum, missing-schedule and outlier flags", () => {
  const dated = (desc: string, start: string | null, delivery: string | null, budget: number | null) => ({
    ...row("k|" + desc, desc, 2026, 100, budget),
    item_key: "x|" + desc.toLowerCase().replace(/[^a-z0-9]/g, ""),
    description: desc,
    start,
    delivery,
  });
  const report = runAnalysis(
    [
      {
        fileId: "f",
        filename: "PPMP_2026.xlsx",
        fiscalYear: 2026,
        rows: [
          dated("A", "Jan-2026", "Feb 2026", 10000),
          dated("B", "Feb-2026", "Mar-2026", 12000),
          dated("C", "Mar-2026", "Jun-2026", 500000),
          dated("D", null, null, 9000),
        ],
      },
    ],
    CONFIG
  );
  // Monthly momentum over Jan–Jun span.
  assert.ok(report.fileInsights.deliveryMomentum, "momentum computed");
  assert.strictEqual(report.fileInsights.deliveryMomentum?.direction, "VOLATILE");
  // Missing-schedule summary flag.
  const missing = report.anomalies.find((a) => a.method === "missing_schedule");
  assert.ok(missing, "missing-schedule flagged: " + JSON.stringify(report.anomalies.map((a) => a.method)));
  assert.strictEqual(missing.status, "POTENTIAL ANOMALY");
  // Category outlier (500000 vs ~10000 median, same category).
  const outlier = report.anomalies.find((a) => a.method === "category_outlier");
  assert.ok(outlier, "outlier flagged");
  // Flags become advisory recommendations.
  assert.ok(
    report.recommendations.some((r) => r.rule_id === "ANOMALY_REVIEW"),
    "advisory recs present"
  );
});

test("two periods yield no forecast (minimum history gate)", () => {
  const report = runAnalysis(
    filesFor([
      { year: 2025, qty: 1500, budget: 75000 },
      { year: 2026, qty: 1900, budget: 95000 },
    ]),
    CONFIG
  );
  assert.strictEqual(report.forecasts.length, 0);
  assert.strictEqual(report.trends[0].qty_class, "INCREASING");
});

test("stock cover triggers review when stock exceeds average use", () => {
  const report = runAnalysis(
    filesFor([
      { year: 2024, qty: 2000, budget: 20000 },
      { year: 2025, qty: 2200, budget: 22000 },
      { year: 2026, qty: 2100, budget: 21000 },
    ]),
    CONFIG,
    { onHand: new Map([["bondpaper|reams", 5000]]) }
  );
  const cover = report.recommendations.find((r) => r.rule_id === "STOCK_COVER");
  assert.ok(cover, "stock cover flagged: " + JSON.stringify(report.recommendations.map((r) => r.rule_id)));
  assert.ok(cover.message.includes("current stock"));
});

test("MONTOJO end-to-end: quarterly calendar follows delivery-quarter rule", async () => {
  const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "examples_ppmp");
  const name = "BM MONTOJO PPMP FINAL JAN-JUNE 2026 = = =.xlsx";
  const bytes = new Uint8Array(await readFile(join(dir, name)));
  const profile = await inspectWorkbook(bytes, { filename: name });
  const sheet = profile.sheets[0];
  assert.ok(sheet.headerRow !== null);
  const parsed = await parseLineSheet(bytes, sheet.name, sheet.headerRow as number, {
    fileId: "test-file",
    filename: name,
    fileHash8: "deadbeef",
    fiscalYear: profile.fiscalYear,
    officeDefault: profile.office,
  });
  const report = runAnalysis(
    [{ fileId: "test-file", filename: name, fiscalYear: 2026, rows: parsed.rows }],
    CONFIG
  );
  const q1 = report.quarterly.cells.find((c) => c.year === 2026 && c.quarter === 1);
  const q2 = report.quarterly.cells.find((c) => c.year === 2026 && c.quarter === 2);
  assert.ok(q1, "Q1 cell present");
  assert.ok(q2, "Q2 cell present");
  assert.strictEqual(q1.starts, 3);
  assert.strictEqual(q1.deliveries, 1);
  assert.strictEqual(q1.budget_cents, 10000000);
  assert.strictEqual(q2.deliveries, 2);
  assert.strictEqual(q2.budget_cents, 45560000);
  assert.strictEqual(report.quarterly.unscheduledDeliveries, 0);
});
