import { linearRegression, linearRegressionLine, max, mean, median, min } from "simple-statistics";
import type {
  AnalysisReport,
  EvidenceRef,
} from "./types";

export type PlanningMethod = "average" | "trend" | "growth";

export interface PlanningOptions {
  targetYear: number | null;
  agency: string;
  /** Pesos, null when unknown. */
  ceilingPesos: number | null;
  method: PlanningMethod;
  /** Annual quantity growth % applied to the base case, compounded by year gap. */
  growthPct: number;
  /** Annual unit-cost adjustment % (e.g. inflation), compounded by year gap. */
  pricePct: number;
  categoryFilter: string;
}

export interface PlanningForecastRow {
  item_key: string;
  description: string;
  unit: string | null;
  category: string | null;
  office: string | null;
  mode: string | null;
  proj_type: string | null;
  source_funds: string | null;
  last_qty: number | null;
  last_budget_cents: number | null;
  last_unit_cost_cents: number | null;
  qty_low: number | null;
  qty_base: number | null;
  qty_high: number | null;
  unit_cost_cents: number | null;
  total_low_cents: number | null;
  total_base_cents: number | null;
  total_high_cents: number | null;
  method: string;
  assumptions: string;
  evidence: EvidenceRef[];
  source: string;
}

export interface PpmpDraftRow {
  item: string;
  unit: string;
  qty: number | null;
  q1: number | null;
  q2: number | null;
  q3: number | null;
  q4: number | null;
  unit_cost_cents: number | null;
  total_cents: number | null;
  expense_class: string;
  end_user: string;
  mode: string;
  advertisement: string;
  bid_opening: string;
  award: string;
  signing: string;
  source: string;
  /** GPPB 12-column presentation (image format). */
  proj_type: string;
  preproc: string;
  start_activity: string;
  end_activity: string;
  delivery_period: string;
  source_funds: string;
  docs: string;
  remarks: string;
}

export interface PlanningRisk {
  level: "review" | "info";
  message: string;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function unitCostOf(budgetCents: number | null, qty: number | null): number | null {
  if (budgetCents === null || qty === null || qty === 0) return null;
  return Math.round(budgetCents / qty);
}

function applyGrowth(qty: number | null, pct: number): number | null {
  if (qty === null) return null;
  return round2(qty * (1 + pct / 100));
}

/** Compound factor for an annual rate over n years: (1 + pct/100)^n. */
export function compoundPct(pct: number, years: number): number {
  if (!Number.isFinite(pct) || years <= 0) return 1;
  return Math.pow(1 + pct / 100, years);
}

/** Most recent fiscal year in the analysis, or null when unresolved. */
export function lastHistoryYear(report: AnalysisReport | null): number | null {
  const yrs = report?.overview.years ?? [];
  return yrs.length > 0 ? Math.max(...yrs) : null;
}

/**
 * Year gap between history and plan: how many annual steps the projection
 * must cover. Same-year replans (gap 0) hold current figures; future years
 * compound forward so the draft visibly differs from the uploaded workbook.
 */
export function planningHorizon(targetYear: number | null, lastYear: number | null): number {
  if (targetYear === null) return 1;
  if (lastYear === null) return 1;
  return Math.max(0, targetYear - lastYear);
}

/**
 * Project next-year quantity from a cleaned history using open-source
 * statistics (simple-statistics, ISC license).
 * - average: mean; band = min..max of history.
 * - trend: linear-regression line through [0..n-1]; band spans history + prediction.
 * - growth: hold last; high adds +pct%.
 * Returns nulls when history is empty. Pure.
 */
export function projectQtyHistory(
  qtys: number[],
  method: PlanningMethod,
  growthPct: number,
  yearsAhead = 1
): { low: number | null; base: number | null; high: number | null; detail: string } {
  const vals = qtys.filter((q) => Number.isFinite(q));
  if (vals.length === 0) return { low: null, base: null, high: null, detail: "no usable quantity history" };
  if (vals.length === 1) {
    const only = round2(vals[0]);
    if (method === "growth") {
      const base = round2(only * compoundPct(growthPct, yearsAhead));
      return {
        low: only,
        base,
        high: round2(base * compoundPct(growthPct, 1)),
        detail: `simple-statistics n=1: base carries ${only} forward ${yearsAhead}yr at +${growthPct}%/yr → ${base}; high one further year`,
      };
    }
    return {
      low: only,
      base: only,
      high: only,
      detail: `simple-statistics n=1: carryover ${only} (mean of single observation)`,
    };
  }
  if (method === "average") {
    const base = round2(mean(vals));
    return {
      low: round2(min(vals)),
      base,
      high: round2(max(vals)),
      detail: `simple-statistics mean([${vals.join(",")}])=${base}; band min..max`,
    };
  }
  if (method === "trend") {
    const pts: [number, number][] = vals.map((v, i) => [i, v]);
    const { m, b } = linearRegression(pts);
    const line = linearRegressionLine({ m, b });
    const pred = round2(line(vals.length - 1 + yearsAhead));
    return {
      low: round2(Math.min(...vals, pred)),
      base: pred,
      high: round2(Math.max(...vals, pred)),
      detail: `simple-statistics linearRegression slope=${round2(m)}/yr intercept=${round2(b)} → ${yearsAhead}yr ahead=${pred}`,
    };
  }
  const last = round2(vals[vals.length - 1]);
  const base = round2(last * compoundPct(growthPct, yearsAhead));
  return {
    low: last,
    base,
    high: round2(base * compoundPct(growthPct, 1)),
    detail: `hold last ${last}, compound +${growthPct}%/yr over ${yearsAhead}yr → base ${base}`,
  };
}

/**
 * Build low/base/high quantity forecasts from an AnalysisReport.
 * Pure + client-safe: no server-only imports, no invented prices.
 * - Multi-year items with a statistical forecast use band_low/point/band_high.
 * - Single-year items fall back to last observed qty (base), band = base
 *   unless method === "growth" (applies growthPct to base for high).
 * Every row carries its method + assumptions for the UI to label as projection.
 */
export function buildPlanningForecasts(
  report: AnalysisReport,
  opts: PlanningOptions
): PlanningForecastRow[] {
  const byKey = new Map<
    string,
    { forecast?: AnalysisReport["forecasts"][number]; trend?: AnalysisReport["trends"][number] }
  >();
  for (const f of report.forecasts) {
    const e = byKey.get(f.item_key) ?? {};
    e.forecast = f;
    byKey.set(f.item_key, e);
  }
  for (const t of report.trends) {
    const e = byKey.get(t.item_key) ?? {};
    e.trend = t;
    byKey.set(t.item_key, e);
  }

  const rows: PlanningForecastRow[] = [];
  const covered = new Set<string>();
  const wantCat = opts.categoryFilter.trim().toLowerCase();
  // Forward-looking horizon: future target years compound forward so the
  // draft differs from the uploaded workbook instead of copying it.
  const horizon = planningHorizon(opts.targetYear, lastHistoryYear(report));
  const priceF = compoundPct(opts.pricePct, horizon);
  const esc = (c: number | null): number | null =>
    c === null ? null : Math.round(c * priceF);

  const pushFromTopItem = (
    description: string,
    qty: number | null,
    unit: string | null,
    category: string | null,
    budgetCents: number,
    evidence: EvidenceRef[]
  ) => {
    if (wantCat && wantCat !== "all") {
      const hay = `${category ?? ""}`.toLowerCase();
      if (!hay.includes(wantCat)) return;
    }
    const key = `${description}|${unit ?? ""}`.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 80);
    if (covered.has(key)) return;
    covered.add(key);
    const unitCost = esc(unitCostOf(budgetCents, qty));
    // simple-statistics path even for n=1: mean of single observation.
    const hist = qty === null ? [] : [qty];
    const proj = projectQtyHistory(hist, opts.method, opts.growthPct, horizon);
    let method = `simple_statistics_${opts.method}_n1_carryover`;
    let assumptions =
      `Single-year history, ${horizon}yr horizon to FY ${opts.targetYear ?? "TBD"}: ${proj.detail}. ` +
      (opts.pricePct ? `Unit costs adjusted +${opts.pricePct}%/yr. ` : "Unit costs held. ");
    if (opts.method === "growth" && qty !== null) {
      method = `simple_statistics_growth_plus_${opts.growthPct}pct_x${horizon}yr`;
      assumptions =
        `Single-year history compounded +${opts.growthPct}%/yr over ${horizon}yr to FY ${opts.targetYear ?? "TBD"}. ` +
        `${proj.detail}. ` +
        (opts.pricePct ? `Unit costs adjusted +${opts.pricePct}%/yr. ` : "");
    } else if (opts.method === "trend" && qty !== null) {
      method = "simple_statistics_trend_flat_single_year";
      assumptions =
        `Single-year history: no trend slope can be estimated, so projection holds flat over ${horizon}yr. ${proj.detail}. ` +
        "Add a second comparable year to enable trend estimation.";
    }
    const total = (q: number | null) =>
      q === null || unitCost === null ? null : Math.round(q * unitCost);
    rows.push({
      item_key: key,
      description,
      unit,
      category,
      office: null,
      mode: null,
      proj_type: inferProjType(category),
      source_funds: "General Fund",
      last_qty: qty,
      last_budget_cents: budgetCents,
      last_unit_cost_cents: unitCost,
      qty_low: proj.low,
      qty_base: proj.base,
      qty_high: proj.high,
      unit_cost_cents: unitCost,
      total_low_cents: total(proj.low),
      total_base_cents: total(proj.base),
      total_high_cents: total(proj.high),
      method,
      assumptions,
      evidence,
      source: evidence[0] ? `${evidence[0].file} · ${evidence[0].sheet} · row ${evidence[0].row}` : "uploaded workbook",
    });
  };

  // History-based projections from trend series (covers 2+ year items via
  // simple-statistics, even when the backend 3-year forecast gate is closed).
  for (const t of report.trends) {
    if (covered.has(t.item_key)) continue;
    const qtys = t.series.map((p) => p.qty);
    if (qtys.some((q) => q === null) || qtys.length < 2) continue;
    const vals = qtys as number[];
    const proj = projectQtyHistory(vals, opts.method, opts.growthPct, horizon);
    const lastPt = t.series[t.series.length - 1];
    const unitCost = esc(unitCostOf(lastPt.budget_cents, lastPt.qty));
    const total = (q: number | null) =>
      q === null || unitCost === null ? null : Math.round(q * unitCost);
    covered.add(t.item_key);
    rows.push({
      item_key: t.item_key,
      description: t.description,
      unit: t.unit,
      category: null,
      office: null,
      mode: null,
      proj_type: null,
      source_funds: null,
      last_qty: lastPt.qty,
      last_budget_cents: lastPt.budget_cents,
      last_unit_cost_cents: unitCost,
      qty_low: proj.low,
      qty_base: proj.base,
      qty_high: proj.high,
      unit_cost_cents: unitCost,
      total_low_cents: total(proj.low),
      total_base_cents: total(proj.base),
      total_high_cents: total(proj.high),
      method: `simple_statistics_${opts.method}_from_${vals.length}yr_history`,
      assumptions: `History [${t.series.map((p) => `${p.year}:${p.qty ?? "—"}`).join(", ")}]. ${proj.detail}. Projection only.`,
      evidence: t.evidence,
      source: t.evidence[0]
        ? `${t.evidence[0].file} · ${t.evidence[0].sheet} · row ${t.evidence[0].row}`
        : "uploaded workbook",
    });
  }

  // Statistical forecasts first (multi-year items).
  for (const f of report.forecasts) {
    if (covered.has(f.item_key)) continue;
    if (wantCat && wantCat !== "all") continue; // forecasts lack category; filtered in fallback
    const trend = byKey.get(f.item_key)?.trend;
    const lastPt = trend?.series[trend.series.length - 1];
    const lastBudget = lastPt?.budget_cents ?? null;
    const unitCost = esc(unitCostOf(lastBudget, lastPt?.qty ?? null));
    const residual = Math.max(0, horizon - 1);
    const extraF = opts.method === "growth" ? compoundPct(opts.growthPct, residual) : 1;
    const grow = (q: number | null): number | null =>
      q === null ? null : round2(q * extraF);
    const qLow = grow(f.band_low);
    const qBase = grow(f.point);
    let qHigh = grow(f.band_high);
    let method = `statistical_${f.method}_plus_${horizon}yr_horizon`;
    let assumptions =
      `Statistical forecast (${f.method}, ${f.confidence} confidence) projected ${horizon}yr to FY ${opts.targetYear ?? "TBD"}` +
      (residual > 0 && opts.method === "growth" ? ` with +${opts.growthPct}%/yr compounding beyond the 1-step estimate` : "") +
      `. ${f.warning}` +
      (opts.pricePct ? ` Unit costs adjusted +${opts.pricePct}%/yr.` : "");
    if (opts.method === "growth" && qBase !== null) {
      qHigh = round2((qHigh ?? qBase) * compoundPct(opts.growthPct, 1));
      method = `${method}_high_plus_${opts.growthPct}pct`;
      assumptions += ` High scenario adds one further +${opts.growthPct}% year.`;
    }
    const total = (q: number | null) =>
      q === null || unitCost === null ? null : Math.round(q * unitCost);
    covered.add(f.item_key);
    rows.push({
      item_key: f.item_key,
      description: f.description,
      unit: trend?.unit ?? null,
      category: null,
      office: null,
      mode: null,
      proj_type: null,
      source_funds: null,
      last_qty: lastPt?.qty ?? null,
      last_budget_cents: lastBudget,
      last_unit_cost_cents: unitCost,
      qty_low: qLow,
      qty_base: qBase,
      qty_high: qHigh,
      unit_cost_cents: unitCost,
      total_low_cents: total(qLow),
      total_base_cents: total(qBase),
      total_high_cents: total(qHigh),
      method,
      assumptions,
      evidence: f.evidence,
      source:
        f.evidence[0]
          ? `${f.evidence[0].file} · ${f.evidence[0].sheet} · row ${f.evidence[0].row}`
          : "uploaded workbook",
    });
  }

  // Fallback: top planned items (covers the single-file case + any
  // trend/forecast gaps). pushFromTopItem skips already-covered keys.
  for (const t of report.fileInsights.topItems) {
    pushFromTopItem(t.description, t.qty ?? null, t.unit ?? null, t.category ?? null, t.budget_cents, t.evidence);
  }

  // Cap to a readable planning set.
  return rows.slice(0, 60);
}

/** Source workbooks carry no PS/MOOE/CO column: never guess, always flag. */
export function inferExpenseClass(): string {
  return "Unclassified — no PS/MOOE/CO column in source; confirm with Budget";
}

/** Keep the recorded mode; otherwise defer to the BAC office. */
export function recommendMode(recorded: string | null): string {
  const m = (recorded ?? "").trim();
  if (m) return `${m} (as recorded — confirm with BAC)`;
  return "To confirm with BAC (no mode in source)";
}

function quarterSplit(qty: number | null, weights: [number, number, number, number]): [number | null, number | null, number | null, number | null] {
  if (qty === null) return [null, null, null, null];
  const raw = weights.map((w) => qty * w);
  const floored = raw.map(Math.floor);
  let remainder = Math.round(qty - floored.reduce((a, b) => a + b, 0));
  const out = [...floored];
  let i = 0;
  while (remainder > 0) {
    out[i % 4]++;
    remainder--;
    i++;
  }
  return [out[0], out[1], out[2], out[3]];
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Map a workbook category to the GPPB project type column (Column 2). */
export function inferProjType(category: string | null): string {
  const c = (category ?? "").toLowerCase();
  if (!c.trim() || c === "unspecified") return "Goods";
  if (c.includes("infrast")) return "Infrastructure";
  if (c.includes("consult")) return "Consulting Services";
  if (c.includes("travel")) return "Travel";
  if (c.includes("subsid")) return "Subsidy";
  return "Goods";
}

function deliveryMonthForQuarter(targetYear: number | null, quarter: 1 | 2 | 3 | 4): string {
  if (targetYear === null) return "TBD (set target year)";
  const m = quarter === 1 ? "March" : quarter === 2 ? "June" : quarter === 3 ? "September" : "December";
  return `${m} ${targetYear}`;
}

function milestoneForQuarter(targetYear: number | null, quarter: 1 | 2 | 3 | 4): { advertisement: string; bid_opening: string; award: string; signing: string } {
  if (targetYear === null) {
    return {
      advertisement: "TBD (set target year)",
      bid_opening: "TBD (set target year)",
      award: "TBD (set target year)",
      signing: "TBD (set target year)",
    };
  }
  // Delivery quarter -> procurement starts the prior quarter (planning
  // template, not a regulatory timetable; BAC confirms actual milestones).
  const startMonthIdx = (quarter - 1) * 3 - 2;
  const y = startMonthIdx < 0 ? targetYear - 1 : targetYear;
  const m = ((startMonthIdx % 12) + 12) % 12;
  const adv = `${MONTHS[m]} ${y}`;
  const open = `${MONTHS[(m + 1) % 12]} ${m + 1 > 11 ? y + 1 : y}`;
  const award = `${MONTHS[(m + 2) % 12]} ${m + 2 > 11 ? y + 1 : y}`;
  const sign = `${MONTHS[(m + 3) % 12]} ${m + 3 > 11 ? y + 1 : y}`;
  return { advertisement: adv, bid_opening: open, award, signing: sign };
}

function dominantQuarter(report: AnalysisReport): 1 | 2 | 3 | 4 {
  let best: 1 | 2 | 3 | 4 = 1;
  let bestN = -1;
  for (const c of report.quarterly.cells) {
    if (c.starts > bestN) {
      bestN = c.starts;
      best = c.quarter;
    }
  }
  return best;
}

/**
 * Build the exportable PPMP draft from forecast rows.
 * Quantities spread across quarters using the observed schedule mix when
 * available, else evenly. Milestones are template dates for BAC to confirm.
 */
export function buildPpmpDraft(
  forecasts: PlanningForecastRow[],
  report: AnalysisReport,
  opts: PlanningOptions
): PpmpDraftRow[] {
  const cells = report.quarterly.cells;
  const totalStarts = cells.reduce((a, c) => a + c.starts, 0);
  const weights: [number, number, number, number] =
    totalStarts > 0
      ? ([1, 2, 3, 4].map((q) => {
          const s = cells.filter((c) => c.quarter === q).reduce((a, c) => a + c.starts, 0);
          return s / totalStarts;
        }) as [number, number, number, number])
      : [0.25, 0.25, 0.25, 0.25];
  const domQ = dominantQuarter(report);
  const ms = milestoneForQuarter(opts.targetYear, domQ);
  const delivery = deliveryMonthForQuarter(opts.targetYear, domQ);
  const yearTag = opts.targetYear !== null ? `FY ${opts.targetYear}` : "next fiscal year";
  return forecasts.map((f) => {
    // Planning-only: every draft row carries a quantity and cost.
    const qty = f.qty_base ?? 1;
    const unitCost = f.unit_cost_cents ?? 0;
    const [q1, q2, q3, q4] = quarterSplit(qty, weights);
    const unit = f.unit ?? "lot";
    const total = f.total_base_cents ?? Math.round(qty * unitCost);
    return {
      item: f.description,
      unit,
      qty,
      q1: q1 ?? 0,
      q2: q2 ?? 0,
      q3: q3 ?? 0,
      q4: q4 ?? 0,
      unit_cost_cents: unitCost,
      total_cents: total,
      expense_class: inferExpenseClass(),
      end_user: opts.agency || "General",
      mode: recommendMode(f.mode),
      advertisement: ms.advertisement,
      bid_opening: ms.bid_opening,
      award: ms.award,
      signing: ms.signing,
      source: f.source,
      proj_type: f.proj_type ?? inferProjType(f.category),
      preproc: "No",
      start_activity: ms.advertisement,
      end_activity: ms.award,
      delivery_period: delivery,
      source_funds: f.source_funds ?? "General Fund",
      docs: "Market Scooping through canvass/price quotation",
      remarks: `Planned for ${yearTag} — confirm with end-user`,
    };
  });
}

export function buildPlanningRisks(report: AnalysisReport): PlanningRisk[] {
  const risks: PlanningRisk[] = [];
  for (const a of report.anomalies.slice(0, 12)) {
    risks.push({
      level: "review",
      message: `${a.description}: ${a.message} (method ${a.method}; observed ${a.observed}; baseline ${a.baseline}). Confirm before finalizing quantities.`,
    });
  }
  for (const d of report.fileInsights.duplicates.slice(0, 5)) {
    risks.push({
      level: "review",
      message: `'${d.description}' repeats ×${d.occurrences}: consolidate or bulk-buy where appropriate; confirm intentional repeats.`,
    });
  }
  if (report.overview.budget_only_lines > 0) {
    risks.push({
      level: "review",
      message: `${report.overview.budget_only_lines} item(s) plan budgets as lump sums without stated quantities: quantities in this draft assume 1 lot per entry — confirm with end-users to avoid over/under-estimation.`,
    });
  }
  if (report.overview.low_confidence_lines > 0) {
    risks.push({
      level: "info",
      message: `${report.overview.low_confidence_lines} item(s) parsed with limited structure; have end-users confirm quantities and units.`,
    });
  }
  if (report.quarterly.unscheduledStarts > 0 || report.quarterly.unscheduledDeliveries > 0) {
    risks.push({
      level: "info",
      message: `${report.quarterly.unscheduledStarts} item(s) lack a readable start month and ${report.quarterly.unscheduledDeliveries} lack a delivery month: schedule milestones for these are templates only.`,
    });
  }
  if (risks.length === 0) {
    risks.push({ level: "info", message: "No planning risks exceed review thresholds in this file set." });
  }
  return risks;
}

export function buildExecutiveSummary(
  report: AnalysisReport,
  forecasts: PlanningForecastRow[],
  draft: PpmpDraftRow[],
  opts: PlanningOptions
): string[] {
  const out: string[] = [];
  const totalBase = draft.reduce((a, r) => a + (r.total_cents ?? 0), 0);
  const totalQty = draft.reduce((a, r) => a + (r.qty ?? 0), 0);
  const yearLabel = opts.targetYear !== null ? `FY ${opts.targetYear}` : "next fiscal year";
  void report;
  out.push(
    `${opts.agency || "General"} · ${yearLabel} draft: ${forecasts.length} items, ` +
      `planned quantity ${totalQty.toLocaleString("en-PH")}, base total ${formatPlanningPesos(totalBase)} ` +
      `(projections, quantities ${opts.method}).`
  );
  out.push(
    opts.ceilingPesos !== null
      ? `Indicative ceiling ${formatPlanningPesos(Math.round(opts.ceilingPesos * 100))} ` +
        `${totalBase / 100 <= opts.ceilingPesos ? "covers" : "is exceeded by"} the base total — confirm with Budget.`
      : "No ceiling entered — confirm the base total with Budget before submission."
  );
  out.push(
    "Have budget and procurement staff validate quantities, consolidation candidates, and milestone dates before submission."
  );
  return out.slice(0, 6);
}

export function formatPesos(cents: number | null): string {
  if (cents === null || cents === undefined) return "no data";
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  return `${sign}₱${Math.floor(abs / 100).toLocaleString("en-PH")}.${String(abs % 100).padStart(2, "0")}`;
}

/** Planning display formatter: never blank — missing costs show as ₱0.00 for canvass. */
export function formatPlanningPesos(cents: number | null): string {
  if (cents === null || cents === undefined) return "₱0.00 (for canvass)";
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  return `${sign}₱${Math.floor(abs / 100).toLocaleString("en-PH")}.${String(abs % 100).padStart(2, "0")}`;
}

export function draftToCsv(rows: PpmpDraftRow[], targetYear: number | null): string {
  const header = [
    "Item/Description",
    "Unit",
    `Quantity (FY ${targetYear ?? "TBD"} base, projection)`,
    "Q1",
    "Q2",
    "Q3",
    "Q4",
    "Estimated unit cost (PHP, projection)",
    "Estimated total budget (PHP, projection)",
    "Expense class",
    "End-user office",
    "Recommended mode (confirm with BAC)",
    "Advertisement/Posting (projection)",
    "Bid opening (projection)",
    "Award (projection)",
    "Contract signing (projection)",
    "Source file/sheet/row",
  ];
  const esc = (v: string | number | null): string => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const pesos = (c: number | null) =>
    c === null ? "0.00" : (c / 100).toFixed(2);
  const qty = (q: number | null) => (q === null ? "1" : String(q));
  const lines = [header.map(esc).join(",")];
  for (const r of rows) {
    lines.push(
      [
        esc(r.item),
        esc(r.unit),
        qty(r.qty),
        qty(r.q1),
        qty(r.q2),
        qty(r.q3),
        qty(r.q4),
        pesos(r.unit_cost_cents),
        pesos(r.total_cents),
        esc(r.expense_class),
        esc(r.end_user),
        esc(r.mode),
        esc(r.advertisement),
        esc(r.bid_opening),
        esc(r.award),
        esc(r.signing),
        esc(r.source),
      ].join(",")
    );
  }
  return lines.join("\n");
}

export interface CeilingFit {  fits: boolean;
  ceilingCents: number;
  totalBaseCents: number;
  totalSelectedCents: number;
  totalDeferredCents: number;
  selected: PpmpDraftRow[];
  deferred: PpmpDraftRow[];
  needsCosting: PpmpDraftRow[];
  solver: "lp-max-lines" | "greedy-smallest-first" | "none";
  trace: string;
}

/**
 * Deterministic greedy ceiling fit: smallest totals first maximizes the
 * number of funded lines. Optimal for the max-lines objective; used as the
 * fallback when the LP solver is unavailable. Pure.
 */
export function fitDraftToCeilingGreedy(
  draft: PpmpDraftRow[],
  ceilingCents: number
): CeilingFit {
  const costed = draft.filter((r) => r.total_cents !== null) as (PpmpDraftRow & { total_cents: number })[];
  const needsCosting = draft.filter((r) => r.total_cents === null);
  const totalBase = costed.reduce((a, r) => a + r.total_cents, 0);
  if (totalBase <= ceilingCents) {
    return {
      fits: true,
      ceilingCents,
      totalBaseCents: totalBase,
      totalSelectedCents: totalBase,
      totalDeferredCents: 0,
      selected: [...costed],
      deferred: [],
      needsCosting,
      solver: "none",
      trace: `Greedy check: base total ${totalBase}c <= ceiling ${ceilingCents}c — all ${costed.length} planned items fit.`,
    };
  }
  const sorted = [...costed].sort((a, b) => a.total_cents - b.total_cents);
  const selected: typeof costed = [];
  const deferred: typeof costed = [];
  let running = 0;
  for (const r of sorted) {
    if (running + r.total_cents <= ceilingCents) {
      selected.push(r);
      running += r.total_cents;
    } else {
      deferred.push(r);
    }
  }
  return {
    fits: false,
    ceilingCents,
    totalBaseCents: totalBase,
    totalSelectedCents: running,
    totalDeferredCents: deferred.reduce((a, r) => a + r.total_cents, 0),
    selected,
    deferred,
    needsCosting,
    solver: "greedy-smallest-first",
    trace:
      `Greedy smallest-first under ${ceilingCents}c: ${selected.length} selected (${running}c), ` +
      `${deferred.length} deferred. Optimal for maximizing funded line count with equal priorities. ` +
      `Human prioritization still required — confirm with Budget/BAC.`,
  };
}

export interface LpSolver {
  Solve(model: unknown): Record<string, number | boolean | string> & { feasible?: boolean; result?: number };
}

/**
 * LP ceiling fit via javascript-lp-solver (Unlicense / public domain):
 * 0/1 knapsack maximizing funded line count under the cost ceiling.
 * Falls back to greedy on any solver failure. Pass the imported solver in
 * so planning.ts stays side-effect free and testable.
 */
export function fitDraftToCeilingLP(
  draft: PpmpDraftRow[],
  ceilingCents: number,
  solver: LpSolver
): CeilingFit {
  const greedy = fitDraftToCeilingGreedy(draft, ceilingCents);
  if (greedy.fits) return greedy;
  try {
    const costed = draft
      .map((r, i) => ({ r, i }))
      .filter((x) => x.r.total_cents !== null && (x.r.total_cents as number) > 0);
    if (costed.length === 0 || costed.length > 60) return greedy;
    const variables: Record<string, Record<string, number>> = {};
    const binaries: Record<string, number> = {};
    costed.forEach(({ r, i }) => {
      const key = `x${i}`;
      variables[key] = { cost: r.total_cents as number, count: 1 };
      binaries[key] = 1;
    });
    const model = {
      optimize: "count",
      opType: "max",
      constraints: { cost: { max: ceilingCents } },
      variables,
      binaries,
    };
    const res = solver.Solve(model);
    if (!res || res.feasible === false) return greedy;
    const picked = new Set<number>();
    for (const { i } of costed) {
      const v = res[`x${i}`];
      if (v === 1 || v === 1.0) picked.add(i);
    }
    if (picked.size === 0) return greedy;
    const selected = draft.filter((_, i) => picked.has(i));    const deferred = draft.filter(
      (_, i) => !picked.has(i) && draft[i].total_cents !== null
    );
    const totalSelected = selected.reduce((a, r) => a + (r.total_cents ?? 0), 0);
    if (totalSelected > ceilingCents) return greedy;
    return {
      fits: false,
      ceilingCents,
      totalBaseCents: greedy.totalBaseCents,
      totalSelectedCents: totalSelected,
      totalDeferredCents: deferred.reduce((a, r) => a + (r.total_cents ?? 0), 0),
      selected,
      deferred,
      needsCosting: greedy.needsCosting,
      solver: "lp-max-lines",
      trace:
        `javascript-lp-solver 0/1 knapsack (max items, cost<=${ceilingCents}c): ` +
        `${selected.length} selected (${totalSelected}c), ${deferred.length} deferred. ` +
        `Proposed subset only — confirm priorities with Budget/BAC.`,
    };
  } catch {
    return greedy;
  }
}

/** Full item aggregate from the planning server action (all lines, not top-10). */
export interface PlanningItemInput {
  item_key: string;
  description: string;
  unit: string | null;
  category: string | null;
  office: string | null;
  mode: string | null;
  proj_type: string | null;
  source_funds: string | null;
  occurrences: number;
  total_qty: number | null;
  qty_readings: number;
  total_budget_cents: number | null;
  budget_readings: number;
  avg_unit_cost_cents: number | null;
  evidence: EvidenceRef[];
  source: string;
}

function medianOf(vals: number[]): number | null {
  const clean = vals.filter((v) => Number.isFinite(v) && v > 0);
  if (clean.length === 0) return null;
  return Math.round(median(clean));
}

/**
 * Build future forecasts from the FULL item list so every line gets a plan,
 * even when source qty or unit cost is missing.
 * - "lines" = one PPMP workbook row (one item/description entry). Total lines
 *   is the count of such rows across the selected files.
 * - Budget-only (qty missing, budget present): assume 1 lot per recorded line
 *   at the recorded budget — the standard lump-sum planning placeholder.
 * - Cost-missing (qty present, budget missing): unit cost falls back to the
 *   category median, else the file-wide median; totals follow. Flagged for canvass.
 * - Both missing: qty falls back to occurrence count, unit cost to the median
 *   fallback; flagged as placeholder for end-user confirmation.
 * Nothing is invented from outside the files: every fallback derives from
 * medians within the same uploaded workbooks and is labeled as a projection.
 */
export function buildForecastsFromItems(
  items: PlanningItemInput[],
  report: AnalysisReport | null,
  opts: PlanningOptions
): PlanningForecastRow[] {
  const wantCat = opts.categoryFilter.trim().toLowerCase();
  const trendsByKey = new Map<string, AnalysisReport["trends"][number]>();
  const forecastByKey = new Map<string, AnalysisReport["forecasts"][number]>();
  if (report) {
    for (const t of report.trends) trendsByKey.set(t.item_key, t);
    for (const f of report.forecasts) forecastByKey.set(f.item_key, f);
  }

  // Category + file-wide median unit costs from lines that have both.
  const byCatCosts = new Map<string, number[]>();
  const allCosts: number[] = [];
  for (const it of items) {
    if (it.avg_unit_cost_cents !== null && it.avg_unit_cost_cents > 0) {
      const cat = (it.category ?? "Unspecified").toLowerCase();
      const list = byCatCosts.get(cat) ?? [];
      list.push(it.avg_unit_cost_cents);
      byCatCosts.set(cat, list);
      allCosts.push(it.avg_unit_cost_cents);
    }
  }
  const catMedian = (cat: string | null): number | null => {
    const list = byCatCosts.get((cat ?? "Unspecified").toLowerCase()) ?? [];
    return medianOf(list);
  };
  const fileMedian = medianOf(allCosts);
  // Same forward horizon as the report path so full coverage also plans ahead.
  const horizon = planningHorizon(opts.targetYear, lastHistoryYear(report));
  const priceF = compoundPct(opts.pricePct, horizon);

  const rows: PlanningForecastRow[] = [];
  for (const it of items) {
    if (wantCat && wantCat !== "all") {
      if (!`${it.category ?? ""}`.toLowerCase().includes(wantCat)) continue;
    }
    const trend = trendsByKey.get(it.item_key);
    const backend = forecastByKey.get(it.item_key);

    // Prefer backend statistical band when the 3-year gate passed.
    if (backend) {
      const lastPt = trend?.series[trend.series.length - 1];
      const occ = Math.max(1, it.occurrences);
      const fallbackQty = it.total_qty ?? occ;
      const baseCost =
        unitCostOf(lastPt?.budget_cents ?? null, lastPt?.qty ?? null) ??
        it.avg_unit_cost_cents ??
        catMedian(it.category) ??
        fileMedian ??
        0;
      const unitCost = Math.round(baseCost * priceF);
      const residual = Math.max(0, horizon - 1);
      const extraF = opts.method === "growth" ? compoundPct(opts.growthPct, residual) : 1;
      const growB = (q: number | null): number | null =>
        q === null ? null : round2((q ?? fallbackQty) * extraF);
      const total = (q: number | null) => Math.round((q ?? fallbackQty) * unitCost);
      const qBase = growB(backend.point) ?? fallbackQty;
      const qLow = growB(backend.band_low) ?? qBase;
      const qHigh0 = growB(backend.band_high) ?? qBase;
      const qHigh =
        opts.method === "growth" ? round2(qHigh0 * compoundPct(opts.growthPct, 1)) : qHigh0;
      rows.push({
        item_key: it.item_key,
        description: it.description,
        unit: trend?.unit ?? it.unit,
        category: it.category,
        office: it.office,
        mode: it.mode,
        proj_type: it.proj_type ?? inferProjType(it.category),
        source_funds: it.source_funds ?? "General Fund",
        last_qty: lastPt?.qty ?? it.total_qty,
        last_budget_cents: lastPt?.budget_cents ?? it.total_budget_cents,
        last_unit_cost_cents: unitCost,
        qty_low: qLow,
        qty_base: qBase,
        qty_high: qHigh,
        unit_cost_cents: unitCost,
        total_low_cents: total(qLow),
        total_base_cents: total(qBase),
        total_high_cents: total(qHigh),
        method: `statistical_${backend.method}_full_coverage`,
        assumptions: `Backend forecast (${backend.method}, ${backend.confidence}). ${backend.warning} Unit cost from file history; projection only.`,
        evidence: backend.evidence.length > 0 ? backend.evidence : it.evidence,
        source: it.source,
      });
      continue;
    }

    // Trend-series projection via simple-statistics (2+ years).
    if (trend && trend.series.length >= 2) {
      const qtys = trend.series.map((p) => p.qty);
      if (!qtys.some((q) => q === null)) {
        const proj = projectQtyHistory(qtys as number[], opts.method, opts.growthPct, horizon);
        const lastPt = trend.series[trend.series.length - 1];
        const occ = Math.max(1, it.occurrences);
        const baseCost =
          unitCostOf(lastPt.budget_cents, lastPt.qty) ??
          it.avg_unit_cost_cents ??
          catMedian(it.category) ??
          fileMedian ??
          0;
        const unitCost = Math.round(baseCost * priceF);
        const qBase = proj.base ?? lastPt.qty ?? it.total_qty ?? occ;
        const qLow = proj.low ?? qBase;
        const qHigh = proj.high ?? qBase;
        const total = (q: number) => Math.round(q * unitCost);
        rows.push({
          item_key: it.item_key,
          description: it.description,
          unit: trend.unit ?? it.unit,
          category: it.category,
          office: it.office,
          mode: it.mode,
          proj_type: it.proj_type ?? inferProjType(it.category),
          source_funds: it.source_funds ?? "General Fund",
          last_qty: lastPt.qty,
          last_budget_cents: lastPt.budget_cents,
          last_unit_cost_cents: unitCost,
          qty_low: qLow,
          qty_base: qBase,
          qty_high: qHigh,
          unit_cost_cents: unitCost,
          total_low_cents: total(qLow),
          total_base_cents: total(qBase),
          total_high_cents: total(qHigh),
          method: `simple_statistics_${opts.method}_from_${qtys.length}yr`,
          assumptions: `History [${trend.series.map((p) => `${p.year}:${p.qty ?? occ}`).join(", ")}]. ${proj.detail}. Projection only.`,
          evidence: trend.evidence.length > 0 ? trend.evidence : it.evidence,
          source: it.source,
        });
        continue;
      }
    }

    // Full-coverage fallback with estimation so no future row stays blank.
    const occ = Math.max(1, it.occurrences);
    if (it.total_qty !== null && it.total_budget_cents !== null) {
      const baseCost =
        it.avg_unit_cost_cents ??
        catMedian(it.category) ??
        fileMedian ??
        unitCostOf(it.total_budget_cents, it.total_qty);
      const unitCost = baseCost === null ? 0 : Math.round(baseCost * priceF);
      const qBase =
        opts.method === "growth"
          ? round2(it.total_qty * compoundPct(opts.growthPct, horizon))
          : it.total_qty;
      const qHigh =
        opts.method === "growth" ? round2(qBase * compoundPct(opts.growthPct, 1)) : qBase;
      const total = (q: number | null) =>
        q === null || unitCost === null ? null : Math.round(q * unitCost);
      rows.push({
        item_key: it.item_key,
        description: it.description,
        unit: it.unit,
        category: it.category,
        office: it.office,
        mode: it.mode,
        proj_type: it.proj_type ?? inferProjType(it.category),
        source_funds: it.source_funds ?? "General Fund",
        last_qty: it.total_qty,
        last_budget_cents: it.total_budget_cents,
        last_unit_cost_cents: unitCost,
        qty_low: qBase,
        qty_base: qBase,
        qty_high: qHigh,
        unit_cost_cents: unitCost,
        total_low_cents: total(qBase),
        total_base_cents: total(qBase),
        total_high_cents: total(qHigh),
        method: `simple_statistics_${opts.method}_full_line_x${horizon}yr`,
        assumptions:
          `Planned quantities for FY ${opts.targetYear ?? "TBD"} from uploaded entries (${occ} entries)` +
          (opts.method === "growth" ? ` compounded +${opts.growthPct}%/yr over ${horizon}yr` : "") +
          (opts.pricePct ? `; unit cost adjusted +${opts.pricePct}%/yr` : "; unit cost held") +
          `. Projection only — confirm quantities with end-user.`,
        evidence: it.evidence,
        source: it.source,
      });
    } else if (it.total_qty === null && it.total_budget_cents !== null) {
      // Budget-only: plan 1 lot per recorded entry; escalate the lump sum by
      // the price adjustment over the horizon so future totals move.
      const perLine = Math.round((it.total_budget_cents / occ) * priceF);
      const qty = occ;
      const unit = it.unit ?? "lot";
      const grownQty =
        opts.method === "growth" ? (applyGrowth(qty, opts.growthPct) ?? qty) : qty;
      const totalBase = Math.round(qty * perLine);
      rows.push({
        item_key: it.item_key,
        description: it.description,
        unit,
        category: it.category,
        office: it.office,
        mode: it.mode,
        proj_type: it.proj_type ?? inferProjType(it.category),
        source_funds: it.source_funds ?? "General Fund",
        last_qty: null,
        last_budget_cents: it.total_budget_cents,
        last_unit_cost_cents: perLine,
        qty_low: qty,
        qty_base: qty,
        qty_high: grownQty,
        unit_cost_cents: perLine,
        total_low_cents: totalBase,
        total_base_cents: totalBase,
        total_high_cents: Math.round(grownQty * perLine),
        method: `lump_sum_${occ}_lot${occ > 1 ? "s" : ""}_from_budget_x${horizon}yr`,
        assumptions:
          `Quantity not stated in source; ` +
          `future plan assumes 1 ${unit} per recorded entry (${occ} entries) at ` +
          (opts.pricePct
            ? `the budget escalated +${opts.pricePct}%/yr over ${horizon}yr (${formatPlanningPesos(totalBase)} total). `
            : `the recorded budget (${formatPlanningPesos(it.total_budget_cents)} total). `) +
          `Projection only — confirm actual qty/unit with end-user; source ${it.source}.`,
        evidence: it.evidence,
        source: it.source,
      });
    } else {
      // Cost-missing or fully missing: estimate from category/file medians.
      // Planning-only: always show a quantity and a cost (₱0.00 = for canvass).
      const baseUnit = catMedian(it.category) ?? fileMedian ?? 0;
      const fallbackUnit = Math.round(baseUnit * priceF);
      const observedQty = it.total_qty ?? occ;
      const qty =
        opts.method === "growth" && it.total_qty !== null
          ? round2(observedQty * compoundPct(opts.growthPct, horizon))
          : observedQty;
      const unit = it.unit ?? "lot";
      const total = Math.round(qty * fallbackUnit);
      const qHigh = opts.method === "growth" ? (applyGrowth(qty, opts.growthPct) ?? qty) : qty;
      rows.push({
        item_key: it.item_key,
        description: it.description,
        unit,
        category: it.category,
        office: it.office,
        mode: it.mode,
        proj_type: it.proj_type ?? inferProjType(it.category),
        source_funds: it.source_funds ?? "General Fund",
        last_qty: it.total_qty,
        last_budget_cents: it.total_budget_cents,
        last_unit_cost_cents: fallbackUnit,
        qty_low: qty,
        qty_base: qty,
        qty_high: qHigh,
        unit_cost_cents: fallbackUnit,
        total_low_cents: total,
        total_base_cents: total,
        total_high_cents: Math.round(qHigh * fallbackUnit),
        method: "median_fallback_from_file",        assumptions:
          it.total_budget_cents === null && it.total_qty === null
            ? `Quantity and budget not stated in source; future plan uses ${qty} ${unit} (occurrence count) × ` +
              (fallbackUnit > 0
                ? `file/category median unit cost ${formatPlanningPesos(fallbackUnit)}`
                : "₱0.00 placeholder for canvass") +
              `. Confirm with end-user and Budget; source ${it.source}.`
            : `Budget not stated in source; unit cost estimated from ` +
              (catMedian(it.category) !== null && (catMedian(it.category) as number) > 0
                ? `category median ${formatPlanningPesos(catMedian(it.category))}`
                : fileMedian !== null && fileMedian > 0
                  ? `file-wide median ${formatPlanningPesos(fileMedian)}`
                  : "₱0.00 placeholder — canvass required") +
              `. Projection only — confirm via canvass; source ${it.source}.`,
        evidence: it.evidence,
        source: it.source,
      });
    }
  }
  return rows.slice(0, 200);
}

/** Quantity + unit phrasing for GPPB Column 3 (e.g. "10 reams", "2 lots"). */
export function qtySizeText(qty: number | null, unit: string | null): string {
  const q = qty ?? 1;
  const u = (unit ?? "lot").trim() || "lot";
  const qText = Number.isInteger(q) ? q.toLocaleString("en-PH") : q.toFixed(2);
  return `${qText} ${u}`;
}

/**
 * GPPB 12-column CSV export matching the official PPMP sheet layout
 * (Columns 1–12 plus fiscal year / end-user header rows and total budget).
 * Opens directly in Excel.
 */
export function gppbDraftToCsv(
  rows: PpmpDraftRow[],
  targetYear: number | null,
  agency: string
): string {
  const esc = (v: string | number | null): string => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const pesos = (c: number | null) => ((c ?? 0) / 100).toFixed(2);
  const out: string[] = [];
  out.push(`Fiscal Year:,${targetYear ?? "TBD"}`);
  out.push(`End-User or Implementing Unit:,${esc(agency || "General")}`);
  out.push(
    [
      "General Description and Objective of the Project to be Procured (Column 1)",
      "Type of the Project to be Procured whether Goods, Infrastructure and Consulting Services (Column 2)",
      "Quantity and Size of the Project to be Procured (Column 3)",
      "Recommended Mode of Procurement (Column 4)",
      "Pre-Procurement Conference, if applicable (Yes/No) (Column 5)",
      "Start of Procurement Activity (Column 6)",
      "End of Procurement Activity (Column 7)",
      "Expected Delivery/Implementation Period (Column 8)",
      "Source of Funds (Column 9)",
      "Estimated Budget / Authorized Budgetary Allocation (PhP) (Column 10)",
      "Attached Supporting Documents (Column 11)",
      "Remarks (Column 12)",
    ]
      .map(esc)
      .join(",")
  );
  let total = 0;
  for (const r of rows) {
    total += r.total_cents ?? 0;
    out.push(
      [
        esc(r.item),
        esc(r.proj_type),
        esc(qtySizeText(r.qty, r.unit)),
        esc(r.mode.replace(/ \(as recorded — confirm with BAC\)| \(no mode in source\)/, "").trim() || r.mode),
        esc(r.preproc),
        esc(r.start_activity),
        esc(r.end_activity),
        esc(r.delivery_period),
        esc(r.source_funds),
        pesos(r.total_cents),
        esc(r.docs),
        esc(r.remarks),
      ].join(",")
    );
  }
  out.push(`,,,,,,,,TOTAL BUDGET:,${pesos(total)},,`);
  return out.join("\n");
}
