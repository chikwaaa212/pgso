import type { AnalyticsConfig } from "./config";
import { buildSeries } from "./series";
import { buildFileInsights } from "./fileInsights";
import { buildQuarterly } from "./quarterly";
import { buildTrends } from "./trends";
import { buildYoy } from "./yoy";
import { buildAnomalies, buildFileAnomalies } from "./anomalies";
import { buildCosts } from "./costs";
import { buildForecasts } from "./forecast";
import { buildRecommendations } from "./rules";
import type {
  AnalysisReport,
  InventorySnapshot,
  YearFile,
} from "./types";

export type { AnalysisReport };

/**
 * Run the full deterministic pipeline over 1..N yearly files.
 * Single-year input yields overview only, plus an explicit limitation
 * (no cross-year comparison possible). Pure function — no I/O.
 */
export function runAnalysis(
  files: YearFile[],
  config: AnalyticsConfig,
  inventory?: InventorySnapshot
): AnalysisReport {
  const limitations: string[] = [];
  const usable = files.filter((f) => f.fiscalYear !== null);
  const yearlessFiles = files.length - usable.length;
  if (yearlessFiles > 0) {
    limitations.push(
      `${yearlessFiles} file(s) have no resolved fiscal year and were excluded from cross-year comparison. Confirm the year to include them.`
    );
  }

  const allRows = files.flatMap((f) => f.rows);
  const fileInsights = buildFileInsights(allRows);
  const offices = new Set(allRows.map((r) => r.office ?? "unknown"));
  const categories = new Set(allRows.map((r) => r.category ?? "unknown"));
  const budgets = allRows.map((r) => r.budget_cents).filter((b): b is number => b !== null);
  const lowConfidence = allRows.filter((r) => r.confidence === "low").length;
  const budgetOnly = allRows.filter((r) => r.qty === null).length;

  const byYear = new Map<number, typeof allRows>();
  for (const f of usable) {
    const list = byYear.get(f.fiscalYear as number) ?? [];
    list.push(...f.rows.filter((r) => (r.fiscal_year ?? f.fiscalYear) === f.fiscalYear));
    byYear.set(f.fiscalYear as number, list);
  }
  const yearly = [...byYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, rows]) => {
      const qs = rows.map((r) => r.qty).filter((q): q is number => q !== null);
      const bs = rows.map((r) => r.budget_cents).filter((b): b is number => b !== null);
      return {
        year,
        items: rows.length,
        qty: qs.length === rows.length ? qs.reduce((a, b) => a + b, 0) : null,
        budget_cents: bs.length > 0 ? bs.reduce((a, b) => a + b, 0) : null,
      };
    });

  const overview = {
    files: files.length,
    years: yearly.map((y) => y.year),
    line_items: allRows.length,
    total_budget_cents: budgets.length > 0 ? budgets.reduce((a, b) => a + b, 0) : null,
    offices: offices.size,
    categories: categories.size,
    budget_only_lines: budgetOnly,
    low_confidence_lines: lowConfidence,
    yearly,
  };

  if (usable.length < 2) {
    limitations.push(
      "Only one fiscal year with a resolved year is available: year-over-year quantities, trends, cost changes, and forecasts need at least two comparable years. Within-file insights are shown instead."
    );
    if (lowConfidence > 0) {
      limitations.push(
        `${lowConfidence} line(s) are budget-only or low confidence (quantity not machine-readable); quantity comparisons skip them.`
      );
    }
    // Within-file flags + advisory recommendations (no history needed).
    const fileAnomalies = buildFileAnomalies(allRows);
    const fileRecommendations = buildRecommendations([], fileAnomalies, [], [], config);
    const { calendar, limitationNotes } = buildQuarterly(allRows);
    return {
      overview,
      fileInsights,
      quarterly: calendar,
      trends: [],
      yoy: [],
      anomalies: fileAnomalies,
      costs: [],
      forecasts: [],
      recommendations: fileRecommendations,
      limitations: [...limitations, ...limitationNotes],
    };
  }

  const { series, yearless } = buildSeries(usable);
  if (yearless > 0) {
    limitations.push(
      `${yearless} line(s) carry no fiscal year and were excluded from cross-year comparison.`
    );
  }
  if (lowConfidence > 0) {
    limitations.push(
      `${lowConfidence} line(s) are budget-only or low confidence (quantity not machine-readable); quantity comparisons skip them.`
    );
  }

  const trends = buildTrends(series, config);
  const yoy = buildYoy(series);
  const anomalies = buildAnomalies(series, config);
  const costs = buildCosts(series);
  const forecasts = buildForecasts(series, config);
  const recommendations = buildRecommendations(series, anomalies, costs, forecasts, config, inventory);
  const { calendar, limitationNotes } = buildQuarterly(allRows);

  return { overview, fileInsights, quarterly: calendar, trends, yoy, anomalies, costs, forecasts, recommendations, limitations: [...limitations, ...limitationNotes] };
}
