import "server-only";

import ExcelJS from "exceljs";
import { normalizeHeader } from "./aliases";
import { clean, rawText } from "./cells";
import { parseMoneyToCentavos } from "./money";

export interface PivotMatrix {
  sheet: string;
  offices: string[];
  categories: string[];
  /** Integer centavos; null where the cell is blank/unreadable. */
  values: (number | null)[][];
  officeTotals: (number | null)[];
  categoryTotals: (number | null)[];
  grandTotal: number | null;
  skippedTotalRows: number;
  skippedBlankRows: number;
}

const MAX_COLS = 60;
const MAX_ROWS = 500;

/**
 * Parse a CODE × OFFICE budget-matrix summary sheet (observed in GUADA
 * "GEN FUND - summary" style sheets). Header row: CODE | OFFICE | <category
 * columns...>. Office rows below; TOTAL rows are excluded from the matrix
 * (analytics recomputes totals). Throws when no pivot header is found.
 */
export async function parsePivotSheet(
  bytes: Uint8Array,
  sheetName: string
): Promise<PivotMatrix> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  const ws = wb.getWorksheet(sheetName);
  if (!ws) throw new Error(`Sheet "${sheetName}" not found.`);

  let headerRow = -1;
  for (let r = 1; r <= Math.min(8, ws.lastRow?.number ?? 0); r++) {
    const row = ws.getRow(r);
    const a = normalizeHeader(clean(rawText(row.getCell(1).value)));
    const b = normalizeHeader(clean(rawText(row.getCell(2).value)));
    if (
      (a === "code" || a === "accountcode" || a === "itemno") &&
      b.includes("office")
    ) {
      headerRow = r;
      break;
    }
  }
  if (headerRow === -1)
    throw new Error(`Sheet "${sheetName}" has no CODE × OFFICE pivot header.`);

  const header = ws.getRow(headerRow);
  const categories: string[] = [];
  for (let c = 3; c <= MAX_COLS; c++) {
    const v = clean(rawText(header.getCell(c).value));
    if (v !== "") categories.push(v.slice(0, 80));
  }

  const offices: string[] = [];
  const values: (number | null)[][] = [];
  let skippedTotalRows = 0;
  let skippedBlankRows = 0;
  const lastRow = Math.min(ws.lastRow?.number ?? 0, MAX_ROWS);
  for (let r = headerRow + 1; r <= lastRow; r++) {
    const row = ws.getRow(r);
    const office = clean(rawText(row.getCell(2).value));
    if (office === "") {
      // Entirely blank row?
      let any = false;
      for (let c = 1; c <= Math.min(categories.length + 2, MAX_COLS); c++) {
        if (clean(rawText(row.getCell(c).value)) !== "") {
          any = true;
          break;
        }
      }
      if (!any) skippedBlankRows++;
      continue;
    }
    if (/^\s*total\b/i.test(office)) {
      skippedTotalRows++;
      continue;
    }
    offices.push(office.slice(0, 80));
    const line: (number | null)[] = [];
    for (let c = 3; c < 3 + categories.length; c++) {
      line.push(parseMoneyToCentavos(clean(rawText(row.getCell(c).value)) || null));
    }
    values.push(line);
  }

  const sum = (ns: (number | null)[]): number | null => {
    let total = 0;
    let any = false;
    for (const n of ns) {
      if (n !== null) {
        total += n;
        any = true;
      }
    }
    return any ? total : null;
  };
  const officeTotals = values.map(sum);
  const categoryTotals = categories.map((_, ci) =>
    sum(values.map((line) => line[ci] ?? null))
  );
  const grandTotal = sum(officeTotals);

  return {
    sheet: sheetName,
    offices,
    categories,
    values,
    officeTotals,
    categoryTotals,
    grandTotal,
    skippedTotalRows,
    skippedBlankRows,
  };
}
