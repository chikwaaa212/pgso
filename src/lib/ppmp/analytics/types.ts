import "server-only";

import type { CanonicalPpmpRow } from "../types";

export interface YearFile {
  fileId: string;
  filename: string;
  fiscalYear: number | null;
  rows: CanonicalPpmpRow[];
}

export interface EvidenceRef {
  file: string;
  sheet: string;
  row: number;
  item: string;
  qty: number | null;
  unit: string | null;
  budget_cents: number | null;
  fiscal_year: number | null;
  hash8: string;
}

export function evidenceOf(r: CanonicalPpmpRow): EvidenceRef {
  return {
    file: r.source.filename,
    sheet: r.source.sheet,
    row: r.source.row,
    item: r.description,
    qty: r.qty,
    unit: r.unit,
    budget_cents: r.budget_cents,
    fiscal_year: r.fiscal_year,
    hash8: r.source.hash8,
  };
}

export interface Overview {
  files: number;
  years: number[];
  line_items: number;
  total_budget_cents: number | null;
  offices: number;
  categories: number;
  budget_only_lines: number;
  low_confidence_lines: number;
  yearly: { year: number; items: number; qty: number | null; budget_cents: number | null }[];
}

/** Optional read-only inventory snapshot for the stock-cover check (P6). */
export interface InventorySnapshot {
  /** item_key -> on-hand quantity. */
  onHand: Map<string, number>;
}

export type TrendClass = "INCREASING" | "DECREASING" | "STABLE" | "VOLATILE" | "INSUFFICIENT_DATA";

export interface Trend {
  item_key: string;
  description: string;
  unit: string | null;
  series: { year: number; qty: number | null; budget_cents: number | null }[];
  qty_class: TrendClass;
  calc_trace: string;
  evidence: EvidenceRef[];
}

export interface Yoy {
  item_key: string;
  description: string;
  from_year: number;
  to_year: number;
  prev_qty: number | null;
  cur_qty: number | null;
  abs_change: number | null;
  pct_change: number | null;
  calc_trace: string;
}

export interface Anomaly {
  item_key: string;
  description: string;
  method: string;
  threshold: string;
  observed: string;
  baseline: string;
  status: "POTENTIAL ANOMALY";
  message: string;
  calc_trace: string;
  evidence: EvidenceRef[];
}

export interface CostChange {
  item_key: string;
  description: string;
  from_year: number;
  to_year: number;
  prev_budget_cents: number | null;
  cur_budget_cents: number | null;
  pct_change: number | null;
  qty_driven: boolean | null;
  calc_trace: string;
  evidence: EvidenceRef[];
}

export interface Forecast {
  item_key: string;
  description: string;
  method: string;
  point: number | null;
  band_low: number | null;
  band_high: number | null;
  confidence: "LOW" | "MEDIUM";
  warning: string;
  calc_trace: string;
  evidence: EvidenceRef[];
}

export interface Recommendation {
  rule_id: string;
  message: string;
  calc_trace: string;
  evidence_refs: EvidenceRef[];
}

export interface QuarterCell {
  year: number;
  quarter: 1 | 2 | 3 | 4;
  /** Lines starting procurement in this quarter. */
  starts: number;
  /** Lines due for delivery in this quarter. */
  deliveries: number;
  /** Lump budgets wholly landing in their delivery quarter. */
  budget_cents: number | null;
}

export interface QuarterlyCalendar {
  cells: QuarterCell[];
  unscheduledStarts: number;
  unscheduledDeliveries: number;
  unscheduledBudgetCents: number | null;
  /** The timing rule applied, shown verbatim in the UI. */
  rule: string;
}

export interface CategorySlice {
  name: string;
  lines: number;
  budget_cents: number | null;
  top: { description: string; budget_cents: number }[];
}

export interface TopItem {
  description: string;
  budget_cents: number;
  qty: number | null;
  unit: string | null;
  category: string | null;
  evidence: EvidenceRef[];
}

export interface DuplicateDesc {
  description: string;
  occurrences: number;
  evidence: EvidenceRef[];
}

/** Within-year delivery momentum (single-file trend read). */
export interface DeliveryMomentum {
  year: number | null;
  monthly: { month: string; lines: number }[];
  direction: TrendClass;
  calc_trace: string;
  datedLines: number;
  undatedLines: number;
}

/** Within-file interpretation: needs no history. Always computed. */
export interface FileInsights {
  totalLines: number;
  totalBudgetCents: number | null;
  byCategory: CategorySlice[];
  byOffice: CategorySlice[];
  byMode: CategorySlice[];
  monthlyStarts: { month: string; lines: number }[];
  monthlyDeliveries: { month: string; lines: number }[];
  scheduleCoverage: { withStart: number; withDelivery: number; total: number };
  topItems: TopItem[];
  duplicates: DuplicateDesc[];
  deliveryMomentum: DeliveryMomentum | null;
  /** Deterministic template sentences over computed numbers. */
  narrative: string[];
}

export interface AnalysisReport {
  overview: Overview;
  fileInsights: FileInsights;
  quarterly: QuarterlyCalendar;
  trends: Trend[];
  yoy: Yoy[];
  anomalies: Anomaly[];
  costs: CostChange[];
  forecasts: Forecast[];
  recommendations: Recommendation[];
  limitations: string[];
}
