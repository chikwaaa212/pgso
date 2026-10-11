/** Shared PPMP analytics types (deterministic pipeline, no AI). */

export type SheetKind = "LINE_LIST" | "PIVOT_SUMMARY" | "SKIP";

export type IssueSeverity = "error" | "warning" | "info";

export interface ValidationIssue {
  severity: IssueSeverity;
  /** Sheet name, or null for workbook-level issues. */
  sheet: string | null;
  row?: number;
  column?: number;
  code: string;
  message: string;
}

export interface SheetProfile {
  name: string;
  kind: SheetKind;
  /** ws.rowCount (includes blanks/formatting rows; usable count comes from the P3 parser). */
  rows: number;
  cols: number;
  /** 1-indexed header row for LINE_LIST sheets. */
  headerRow: number | null;
  /** Header match score (signature hits). */
  headerScore: number;
  /** Why a sheet was skipped or routed to the matrix parser. */
  skipReason: string | null;
}

export interface WorkbookProfile {
  sheets: SheetProfile[];
  /** Resolved fiscal year for the workbook (banner → filename → null). */
  fiscalYear: number | null;
  fiscalYearSource: "banner" | "filename" | null;
  /** End-user / office from the banner row, if found. */
  office: string | null;
  issues: ValidationIssue[];
}

/** Line-item layout variants accepted in V1. */
export type LineVariant =
  | "GPPB_12COL"
  | "DOPH_SPLIT_QTY"
  | "GUADA_NESTED"
  | "LEGACY_7COL";

/** One normalized procurement line (P3 produces these; P2 only profiles). */
export interface CanonicalPpmpRow {
  item_key: string;
  description: string;
  project: string | null;
  type: string | null;
  qty: number | null;
  unit: string | null;
  /** Integer centavos. Lump project budgets carry scope "project-shared". */
  budget_cents: number | null;
  budget_scope: "line" | "project-shared" | null;
  price_cents: number | null;
  total_cents: number | null;
  mode: string | null;
  start: string | null;
  end: string | null;
  delivery: string | null;
  source_funds: string | null;
  office: string | null;
  fiscal_year: number | null;
  /** Sheet name for GPPB workbooks. */
  category: string | null;
  source: {
    file_id: string;
    filename: string;
    sheet: string;
    row: number;
    hash8: string;
  };
  variant: LineVariant;
  confidence: "high" | "low";
  calc_notes: string[];
}
