import { test } from "node:test";
import assert from "node:assert";
import type { AnalysisReport } from "../lib/ppmp/analytics/types";
import {
  buildForecastsFromItems,
  buildPlanningForecasts,
  buildPpmpDraft,
  draftToCsv,
  fitDraftToCeilingGreedy,
  fitDraftToCeilingLP,
  gppbDraftToCsv,
  inferExpenseClass,
  inferProjType,
  projectQtyHistory,
  qtySizeText,
  recommendMode,
} from "../lib/ppmp/analytics/planning";

function baseReport(): AnalysisReport {
  return {
    overview: {
      files: 1,
      years: [2026],
      line_items: 2,
      total_budget_cents: 1500000,
      offices: 1,
      categories: 1,
      budget_only_lines: 0,
      low_confidence_lines: 0,
      yearly: [{ year: 2026, items: 2, qty: 15, budget_cents: 1500000 }],
    },
    fileInsights: {
      totalLines: 2,
      totalBudgetCents: 1500000,
      byCategory: [{ name: "Office Supplies", lines: 2, budget_cents: 1500000, top: [] }],
      byOffice: [{ name: "PGO", lines: 2, budget_cents: 1500000, top: [] }],
      byMode: [],
      monthlyStarts: [],
      monthlyDeliveries: [],
      scheduleCoverage: { withStart: 0, withDelivery: 0, total: 2 },
      topItems: [
        {
          description: "Bond Paper",
          budget_cents: 1000000,
          qty: 10,
          unit: "reams",
          category: "Office Supplies",
          evidence: [
            { file: "PPMP_2026.xlsx", sheet: "PPMP", row: 10, item: "Bond Paper", qty: 10, unit: "reams", budget_cents: 1000000, fiscal_year: 2026, hash8: "abcd1234" },
          ],
        },
        {
          description: "Ballpoint Pen",
          budget_cents: 500000,
          qty: 5,
          unit: "boxes",
          category: "Office Supplies",
          evidence: [
            { file: "PPMP_2026.xlsx", sheet: "PPMP", row: 11, item: "Ballpoint Pen", qty: 5, unit: "boxes", budget_cents: 500000, fiscal_year: 2026, hash8: "abcd1234" },
          ],
        },
      ],
      duplicates: [],
      deliveryMomentum: null,
      narrative: [],
    },
    quarterly: { cells: [], unscheduledStarts: 2, unscheduledDeliveries: 2, unscheduledBudgetCents: 1500000, rule: "test" },
    trends: [],
    yoy: [],
    anomalies: [],
    costs: [],
    forecasts: [],
    recommendations: [],
    limitations: ["Only one fiscal year"],
  };
}

const OPTS = {
  targetYear: 2027,
  agency: "General",
  ceilingPesos: null,
  method: "average" as const,
  growthPct: 5,
  pricePct: 0,
  categoryFilter: "all",
};

test("single-year carryover: base holds last qty, totals = qty * unit cost", () => {
  const report = baseReport();
  const rows = buildPlanningForecasts(report, OPTS);
  assert.strictEqual(rows.length, 2);
  const paper = rows.find((r) => r.description === "Bond Paper");
  assert.ok(paper);
  assert.strictEqual(paper.qty_base, 10);
  assert.strictEqual(paper.qty_low, 10);
  assert.strictEqual(paper.qty_high, 10);
  // 10000 pesos / 10 = 1000 pesos unit cost = 100000 centavos
  assert.strictEqual(paper.unit_cost_cents, 100000);
  assert.strictEqual(paper.total_base_cents, 1000000);
  assert.ok(paper.assumptions.length > 0);
  assert.ok(paper.source.includes("PPMP_2026.xlsx"));
});

test("growth compounds the base forward so the future plan differs from the upload", () => {
  const report = baseReport();
  const rows = buildPlanningForecasts(report, { ...OPTS, method: "growth", growthPct: 10 });
  const paper = rows.find((r) => r.description === "Bond Paper");
  assert.ok(paper);
  // 2026 → 2027 is 1yr at +10%: base 11, high one further year 12.1.
  assert.strictEqual(paper.qty_base, 11);
  assert.strictEqual(paper.qty_low, 10);
  assert.strictEqual(paper.qty_high, 12.1);
  assert.notStrictEqual(paper.total_base_cents, 1000000);
});

test("price adjustment escalates future unit costs over the horizon", () => {
  const report = baseReport();
  const rows = buildPlanningForecasts(report, { ...OPTS, pricePct: 10 });
  const paper = rows.find((r) => r.description === "Bond Paper");
  assert.ok(paper);
  assert.strictEqual(paper.qty_base, 10);
  assert.strictEqual(paper.unit_cost_cents, 110000);
  assert.strictEqual(paper.total_base_cents, 1100000);
});

test("two-year horizon compounds twice (2026 → 2028)", () => {
  const report = baseReport();
  const rows = buildPlanningForecasts(
    report,
    { ...OPTS, method: "growth", growthPct: 10, targetYear: 2028 }
  );
  const paper = rows.find((r) => r.description === "Bond Paper");
  assert.ok(paper);
  assert.strictEqual(paper.qty_base, 12.1);
});

test("same-year replan holds current figures (horizon 0)", () => {
  const report = baseReport();
  const rows = buildPlanningForecasts(
    report,
    { ...OPTS, method: "growth", growthPct: 10, targetYear: 2026 }
  );
  const paper = rows.find((r) => r.description === "Bond Paper");
  assert.ok(paper);
  assert.strictEqual(paper.qty_base, 10);
});

test("statistical forecast band maps to low/base/high", () => {
  const report = baseReport();
  report.forecasts = [
    {
      item_key: "k1",
      description: "Bond Paper",
      method: "moving_average_3",
      point: 12,
      band_low: 10,
      band_high: 14,
      confidence: "LOW",
      warning: "test",
      calc_trace: "test",
      evidence: [],
    },
  ];
  report.trends = [
    {
      item_key: "k1",
      description: "Bond Paper",
      unit: "reams",
      series: [{ year: 2026, qty: 10, budget_cents: 1000000 }],
      qty_class: "INCREASING",
      calc_trace: "test",
      evidence: [],
    },
  ];
  const rows = buildPlanningForecasts(report, OPTS);
  const paper = rows.find((r) => r.item_key === "k1");
  assert.ok(paper);
  assert.strictEqual(paper.qty_low, 10);
  assert.strictEqual(paper.qty_base, 12);
  assert.strictEqual(paper.qty_high, 14);
});

test("draft never invents expense class or mode", () => {
  const report = baseReport();
  const forecasts = buildPlanningForecasts(report, OPTS);
  const draft = buildPpmpDraft(forecasts, report, OPTS);
  assert.strictEqual(draft.length, 2);
  for (const d of draft) {
    assert.ok(d.expense_class.includes("confirm with Budget"));
    assert.ok(d.mode.includes("confirm with BAC"));
    assert.ok(d.advertisement.length > 0);
  }
  assert.strictEqual(inferExpenseClass(), "Unclassified — no PS/MOOE/CO column in source; confirm with Budget");
  assert.ok(recommendMode(null).includes("BAC"));
  assert.ok(recommendMode("SVP").includes("SVP"));
});

test("CSV export keeps PPMP columns and PHP in pesos", () => {
  const report = baseReport();
  const forecasts = buildPlanningForecasts(report, OPTS);
  const draft = buildPpmpDraft(forecasts, report, OPTS);
  const csv = draftToCsv(draft, 2027);
  assert.ok(csv.includes("Item/Description"));
  assert.ok(csv.includes("Expense class"));
  assert.ok(csv.includes("Bond Paper"));
  assert.ok(csv.includes("FY 2027"));
});

test("simple-statistics: average uses mean, trend uses regression", () => {
  const avg = projectQtyHistory([10, 20, 30], "average", 5);
  assert.strictEqual(avg.base, 20);
  assert.strictEqual(avg.low, 10);
  assert.strictEqual(avg.high, 30);
  assert.ok(avg.detail.includes("mean"));
  const trend = projectQtyHistory([10, 20, 30], "trend", 5);
  assert.strictEqual(trend.base, 40);
  assert.ok(trend.detail.includes("linearRegression"));
  const growth = projectQtyHistory([10], "growth", 10);
  assert.strictEqual(growth.base, 11);
  assert.strictEqual(growth.high, 12.1);
  const sameYear = projectQtyHistory([10], "growth", 10, 0);
  assert.strictEqual(sameYear.base, 10);
});

test("two-year trend history projects via simple-statistics", () => {
  const report = baseReport();
  report.trends = [
    {
      item_key: "k2",
      description: "Bond Paper",
      unit: "reams",
      series: [
        { year: 2025, qty: 10, budget_cents: 1000000 },
        { year: 2026, qty: 20, budget_cents: 2000000 },
      ],
      qty_class: "INCREASING",
      calc_trace: "test",
      evidence: [],
    },
  ];
  const rows = buildPlanningForecasts(report, { ...OPTS, method: "trend" });
  const paper = rows.find((r) => r.item_key === "k2");
  assert.ok(paper);
  assert.strictEqual(paper.qty_base, 30);
  assert.ok(paper.method.includes("simple_statistics_trend"));
});

test("greedy ceiling fit maximizes funded lines; LP agrees", async () => {
  const report = baseReport();
  const forecasts = buildPlanningForecasts(report, OPTS);
  const draft = buildPpmpDraft(forecasts, report, OPTS);
  // Base total = 1,000,000c + 500,000c = 1,500,000c (php 15,000).
  const fitAll = fitDraftToCeilingGreedy(draft, 2000000);
  assert.strictEqual(fitAll.fits, true);
  const fitTight = fitDraftToCeilingGreedy(draft, 1000000);
  assert.strictEqual(fitTight.fits, false);
  assert.strictEqual(fitTight.selected.length, 1);
  assert.strictEqual(fitTight.totalSelectedCents, 500000);
  const solverMod = await import("javascript-lp-solver");
  const solver = (solverMod as { default?: unknown }).default ?? solverMod;
  const lp = fitDraftToCeilingLP(
    draft,
    1000000,
    solver as Parameters<typeof fitDraftToCeilingLP>[2]
  );
  assert.strictEqual(lp.totalSelectedCents, 500000);
  assert.ok(lp.solver === "lp-max-lines" || lp.solver === "greedy-smallest-first");
});

test("GPPB draft: 12-column mapping, type inference, totals", () => {
  const report = baseReport();
  const forecasts = buildPlanningForecasts(report, OPTS);
  const draft = buildPpmpDraft(forecasts, report, { ...OPTS, targetYear: 2026, agency: "HON. JOSSONE MICHAEL G. DAYANGHIRANG" });
  assert.strictEqual(draft.length, 2);
  for (const d of draft) {
    assert.strictEqual(d.proj_type, "Goods");
    assert.strictEqual(d.preproc, "No");
    assert.ok(d.start_activity.includes("2026") || d.start_activity.includes("2025"));
    assert.ok(d.delivery_period.includes("2026") || d.delivery_period.includes("2025"));
    assert.strictEqual(d.source_funds, "General Fund");
    assert.ok(d.docs.length > 0);
    assert.ok(d.remarks.length > 0);
  }
  assert.strictEqual(qtySizeText(10, "reams"), "10 reams");
  assert.strictEqual(inferProjType("Office Supplies"), "Goods");
  assert.strictEqual(inferProjType("Road Infrastructure"), "Infrastructure");
  assert.strictEqual(inferProjType("Consulting Services"), "Consulting Services");
  const csv = gppbDraftToCsv(draft, 2026, "HON. JOSSONE MICHAEL G. DAYANGHIRANG");
  assert.ok(csv.includes("Fiscal Year:,2026"));
  assert.ok(csv.includes("Column 10"));
  assert.ok(csv.includes("TOTAL BUDGET:"));
  assert.ok(csv.includes("Bond Paper"));
});

test("GPPB Excel workbook mirrors the on-screen table", async () => {
  const ExcelJS = (await import("exceljs")).default;
  const { buildGppbWorkbook } = await import("../app/personnel/ppmp/planning/gppb-excel");
  const report = baseReport();
  const forecasts = buildPlanningForecasts(report, OPTS);
  const draft = buildPpmpDraft(forecasts, report, { ...OPTS, targetYear: 2026, agency: "PGO" });
  const wb = await buildGppbWorkbook(ExcelJS, draft, 2026, "PGO");
  const ws = wb.getWorksheet(1);
  assert.ok(ws);
  // Header rows + Column 1–12 sub-header precede the data.
  assert.strictEqual(ws.getRow(1).getCell(1).value, "Fiscal Year:");
  assert.strictEqual(ws.getRow(1).getCell(2).value, 2026);
  assert.strictEqual(
    ws.getRow(4).getCell(1).value,
    "General Description and Objective of the Project to be Procured"
  );
  assert.strictEqual(ws.getRow(5).getCell(10).value, "Column 10");
  // First data row matches the web table cells (fixture carries no mode).
  assert.strictEqual(ws.getRow(6).getCell(1).value, draft[0].item);
  assert.strictEqual(ws.getRow(6).getCell(4).value, "To confirm with BAC");
  assert.strictEqual(ws.getRow(6).getCell(10).value, (draft[0].total_cents ?? 0) / 100);
  // TOTAL BUDGET footer equals the plan total.
  const totalRow = ws.getRow(6 + draft.length);
  assert.strictEqual(totalRow.getCell(9).value, "TOTAL BUDGET:");
  const expected = draft.reduce((a, d) => a + (d.total_cents ?? 0), 0) / 100;
  assert.strictEqual(totalRow.getCell(10).value, expected);
});

test("full coverage: budget-only entries get lump-sum lots, cost-missing uses medians", () => {
  const report = baseReport();
  const items = [
    {
      item_key: "a",
      description: "Lump Project",
      unit: null,
      category: "Infra",
      office: "PGO",
      mode: null,
      proj_type: null,
      source_funds: null,
      occurrences: 2,
      total_qty: null,
      qty_readings: 0,
      total_budget_cents: 2000000,
      budget_readings: 2,
      avg_unit_cost_cents: null,
      evidence: [],
      source: "PPMP_2026.xlsx · PPMP · row 5",
    },
    {
      item_key: "b",
      description: "Priced Supply",
      unit: "pcs",
      category: "Supplies",
      office: "PGO",
      mode: null,
      proj_type: null,
      source_funds: null,
      occurrences: 1,
      total_qty: 10,
      qty_readings: 1,
      total_budget_cents: 100000,
      budget_readings: 1,
      avg_unit_cost_cents: 10000,
      evidence: [],
      source: "PPMP_2026.xlsx · PPMP · row 6",
    },
    {
      item_key: "c",
      description: "Uncosted Supply",
      unit: "pcs",
      category: "Supplies",
      office: "PGO",
      mode: null,
      proj_type: null,
      source_funds: null,
      occurrences: 1,
      total_qty: 5,
      qty_readings: 1,
      total_budget_cents: null,
      budget_readings: 0,
      avg_unit_cost_cents: null,
      evidence: [],
      source: "PPMP_2026.xlsx · PPMP · row 7",
    },
  ];
  const rows = buildForecastsFromItems(items, report, OPTS);
  assert.strictEqual(rows.length, 3);
  const lump = rows.find((r) => r.item_key === "a");
  assert.ok(lump);
  assert.strictEqual(lump.qty_base, 2);
  assert.strictEqual(lump.unit, "lot");
  assert.strictEqual(lump.total_base_cents, 2000000);
  assert.ok(lump.assumptions.includes("per recorded entry"));
  const uncosted = rows.find((r) => r.item_key === "c");
  assert.ok(uncosted);
  // Category median from the priced supply (10000c) fills the missing cost.
  assert.strictEqual(uncosted.unit_cost_cents, 10000);
  assert.strictEqual(uncosted.total_base_cents, 50000);
  // Draft built from full coverage has no blank qty/totals.
  const draft = buildPpmpDraft(rows, report, { ...OPTS, agency: "General" });
  for (const d of draft) {
    assert.notStrictEqual(d.qty, null);
    assert.notStrictEqual(d.total_cents, null);
  }
});
