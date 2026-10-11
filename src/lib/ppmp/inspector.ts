import "server-only";

import ExcelJS from "exceljs";
import {
  HEADER_MIN_SCORE,
  isHelperRow,
  isPivotHeaderRow,
  normalizeHeader,
  scoreHeaderRow,
} from "./aliases";
import { rawText } from "./cells";
import type { SheetProfile, ValidationIssue, WorkbookProfile } from "./types";

const MAX_SHEETS = 100;
const SCAN_ROWS = 25;
const SCAN_COLS = 20;

interface ScannedSheet {
  ws: ExcelJS.Worksheet;
  /** Dimensions captured BEFORE any cell access (getCell materializes cells). */
  rows: number;
  cols: number;
  /** raw text grid, 0-indexed [row][col]. */
  grid: string[][];
}

function scanSheet(ws: ExcelJS.Worksheet): ScannedSheet {
  const rows = ws.lastRow?.number ?? ws.rowCount;
  const cols = ws.columnCount;
  const grid: string[][] = [];
  const last = Math.min(rows, SCAN_ROWS);
  for (let r = 1; r <= last; r++) {
    const row = ws.getRow(r);
    const cells: string[] = [];
    for (let c = 1; c <= SCAN_COLS; c++) {
      cells.push(rawText(row.getCell(c).value));
    }
    grid.push(cells);
  }
  return { ws, rows, cols, grid };
}

function findFiscalYearBanner(sheets: ScannedSheet[]): number | null {
  for (const { grid } of sheets) {
    for (const cells of grid.slice(0, 12)) {
      const joined = cells.join(" ");
      const m = joined.match(/fiscal\s*year\s*[:\-]?\s*((?:19|20)\d{2})/i);
      if (m) {
        const y = Number(m[1]);
        if (y >= 1990 && y <= 2100) return y;
      }
    }
  }
  return null;
}

function findOfficeBanner(sheets: ScannedSheet[]): string | null {
  for (const { grid } of sheets) {
    for (const cells of grid.slice(0, 12)) {
      const joined = cells.join(" ");
      const m = joined.match(/end[\s\-]*user[^:]{0,60}:\s*(.+)/i);
      if (m) {
        const office = m[1].replace(/\s+/g, " ").trim().slice(0, 120);
        if (office) return office;
      }
    }
  }
  return null;
}

function profileSheet(scanned: ScannedSheet): { profile: SheetProfile; pivot: boolean } {
  const { ws, grid } = scanned;
  // Use pre-scan dimensions: getCell() above materialized cells, which would
  // otherwise inflate ws.columnCount to the scan width.
  const colCount = scanned.cols;
  const base: SheetProfile = {
    name: ws.name,
    kind: "SKIP",
    rows: scanned.rows,
    cols: colCount,
    headerRow: null,
    headerScore: 0,
    skipReason: null,
  };

  // Empty sheet fast path.
  const anyText = grid.some((cells) => cells.some((c) => c.trim() !== ""));
  if (!anyText) {
    return { profile: { ...base, skipReason: "empty sheet" }, pivot: false };
  }

  // Narrow reference sheets (legends, keys, notes) are never PPMP lists:
  // the narrowest real layout observed is 12+ columns.
  if (colCount < 5) {
    return {
      profile: { ...base, skipReason: "narrow reference sheet (legend/key), not a PPMP list" },
      pivot: false,
    };
  }

  // Header anchor: best GPPB signature score in the scan window, ignoring
  // the "Column 1..12" helper row (it sits directly under the header).
  let bestRow = -1;
  let bestScore = 0;
  grid.forEach((cells, i) => {
    const norm = cells.map(normalizeHeader);
    if (isHelperRow(norm)) return;
    const score = scoreHeaderRow(norm);
    if (score > bestScore) {
      bestScore = score;
      bestRow = i + 1; // 1-indexed
    }
  });
  if (bestScore >= HEADER_MIN_SCORE) {
    return {
      profile: { ...base, kind: "LINE_LIST", headerRow: bestRow, headerScore: bestScore },
      pivot: false,
    };
  }

  // Pivot-matrix fast path: CODE|OFFICE header + wide money columns.
  const pivotHit = grid
    .slice(0, 6)
    .some((cells) =>
      isPivotHeaderRow(cells.map(normalizeHeader), colCount)
    );
  if (pivotHit) {
    return {
      profile: {
        ...base,
        kind: "PIVOT_SUMMARY",
        skipReason: "pivot matrix (CODE × OFFICE budget summary): office/category analysis only, not line items",
      },
      pivot: true,
    };
  }

  return { profile: { ...base, headerScore: bestScore, skipReason: "header not recognized" }, pivot: false };
}

/**
 * Read-only workbook profiler. Never mutates the buffer; reads at most
 * SCAN_ROWS x SCAN_COLS per sheet plus dimensions. Throws on corrupt files.
 */
export async function inspectWorkbook(
  bytes: Uint8Array,
  opts: { filename?: string } = {}
): Promise<WorkbookProfile> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as unknown as ArrayBuffer);

  const issues: ValidationIssue[] = [];
  if (wb.worksheets.length === 0) {
    issues.push({
      severity: "error",
      sheet: null,
      code: "EMPTY_WORKBOOK",
      message: "No worksheets found in that file.",
    });
    return { sheets: [], fiscalYear: null, fiscalYearSource: null, office: null, issues };
  }
  if (wb.worksheets.length > MAX_SHEETS) {
    issues.push({
      severity: "error",
      sheet: null,
      code: "TOO_MANY_SHEETS",
      message: `Workbook has ${wb.worksheets.length} sheets (max ${MAX_SHEETS}). Split it by fund or category and try again.`,
    });
    return { sheets: [], fiscalYear: null, fiscalYearSource: null, office: null, issues };
  }

  const scanned = wb.worksheets.map(scanSheet);
  const sheets: SheetProfile[] = [];
  for (const s of scanned) {
    const { profile, pivot } = profileSheet(s);
    sheets.push(profile);
    if (profile.kind === "SKIP" && profile.skipReason === "header not recognized") {
      issues.push({
        severity: "error",
        sheet: profile.name,
        code: "UNSUPPORTED_TEMPLATE",
        message:
          `Sheet "${profile.name}" does not match a known PPMP layout (GPPB 12-col, DOPH split-qty, GUADA nested, or legacy 7-col). ` +
          `Rename columns to the GPPB layout or download the current template.`,
      });
    } else if (pivot) {
      issues.push({
        severity: "info",
        sheet: profile.name,
        code: "PIVOT_SUMMARY",
        message:
          `Sheet "${profile.name}" is a CODE × OFFICE budget matrix and will feed office/category rollups only.`,
      });
    } else if (profile.skipReason === "empty sheet") {
      issues.push({
        severity: "info",
        sheet: profile.name,
        code: "EMPTY_SHEET",
        message: `Sheet "${profile.name}" is empty and will be skipped.`,
      });
    } else if (
      profile.skipReason !== null &&
      profile.skipReason.startsWith("narrow reference sheet")
    ) {
      issues.push({
        severity: "info",
        sheet: profile.name,
        code: "REFERENCE_SHEET",
        message: `Sheet "${profile.name}" looks like a legend/key and will be skipped.`,
      });
    }
  }

  if (!sheets.some((s) => s.kind === "LINE_LIST")) {
    issues.push({
      severity: "error",
      sheet: null,
      code: "NO_USABLE_DATA",
      message: "No sheet with recognizable PPMP line items was found in that file.",
    });
  }

  let fiscalYear = findFiscalYearBanner(scanned);
  let fiscalYearSource: WorkbookProfile["fiscalYearSource"] = fiscalYear !== null ? "banner" : null;
  if (fiscalYear === null && opts.filename) {
    const m = opts.filename.match(/((?:19|20)\d{2})/);
    if (m) {
      const y = Number(m[1]);
      if (y >= 1990 && y <= 2100) {
        fiscalYear = y;
        fiscalYearSource = "filename";
      }
    }
  }
  if (fiscalYear === null) {
    issues.push({
      severity: "warning",
      sheet: null,
      code: "YEAR_UNRESOLVED",
      message:
        "Fiscal year could not be read from the workbook (no 'Fiscal Year: YYYY' banner or year in filename). Confirm the year before comparing across years.",
    });
  }

  const office = findOfficeBanner(scanned);
  if (office === null) {
    issues.push({
      severity: "info",
      sheet: null,
      code: "OFFICE_UNRESOLVED",
      message: "No end-user/office banner was found; office rollups may be partial for this file.",
    });
  }

  return { sheets, fiscalYear, fiscalYearSource, office, issues };
}
