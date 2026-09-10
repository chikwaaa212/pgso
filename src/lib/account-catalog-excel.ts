import ExcelJS from "exceljs";

/**
 * Account catalog Excel template / import — single source of truth.
 *
 * Headers below are BYTE-EXACT copies from
 * `public/Sample Header and sample Data - updated.xlsx`
 * sheet "Sheet1" row 1 (the client's existing catalog data):
 *   ACCOUNT CODE | ASSET TYPE | ACCOUNT TITLE | ACCOUNT NAME
 *
 * DO NOT rename, reorder, or add headers — the importer maps by these
 * exact strings so both the template and the client's original
 * Sheet1 file extract cleanly.
 */

export const CATALOG_TEMPLATE_SHEET = "ACCOUNT CATALOG";

/** Legacy sheet name in the client's original workbook. Accepted on import. */
export const CATALOG_LEGACY_SHEET = "Sheet1";

export const CATALOG_EXCEL_HEADERS: string[] = [
  "ACCOUNT CODE",
  "ASSET TYPE",
  "ACCOUNT TITLE",
  "ACCOUNT NAME",
];

const COLUMN_WIDTHS: number[] = [
  18, // ACCOUNT CODE
  30, // ASSET TYPE
  38, // ACCOUNT TITLE
  44, // ACCOUNT NAME
];

export function buildCatalogTemplateWorkbook(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "PGSO";
  wb.title = "Account Catalog Import Template (Sheet1 headers)";
  wb.created = new Date();

  const ws = wb.addWorksheet(CATALOG_TEMPLATE_SHEET, {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  ws.columns = CATALOG_EXCEL_HEADERS.map((header, i) => ({
    header,
    key: `c${i + 1}`,
    width: COLUMN_WIDTHS[i] ?? 22,
  }));

  // Header row styling — values stay exactly CATALOG_EXCEL_HEADERS.
  const headerRow = ws.getRow(1);
  headerRow.height = 30;
  headerRow.eachCell((cell) => {
    cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1B2A4A" },
    };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FF000000" } },
      left: { style: "thin", color: { argb: "FF000000" } },
      bottom: { style: "thin", color: { argb: "FF000000" } },
      right: { style: "thin", color: { argb: "FF000000" } },
    };
  });

  // Guidance row (row 2) — example from the client's Sheet1 row 2.
  // Users overwrite it; the importer skips rows without an ACCOUNT CODE.
  const example: Record<string, string> = {
    c1: "1-07-01-010",
    c2: "Land",
    c3: "Land",
    c4: "Land",
  };
  const exRow = ws.getRow(2);
  exRow.height = 22;
  Object.entries(example).forEach(([key, value]) => {
    const colIdx = Number(key.slice(1));
    const cell = exRow.getCell(colIdx);
    cell.value = value;
    cell.font = { name: "Arial", size: 10, italic: true, color: { argb: "FF404040" } };
    cell.alignment = { vertical: "middle", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FFB0B0B0" } },
      left: { style: "thin", color: { argb: "FFB0B0B0" } },
      bottom: { style: "thin", color: { argb: "FFB0B0B0" } },
      right: { style: "thin", color: { argb: "FFB0B0B0" } },
    };
  });

  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: CATALOG_EXCEL_HEADERS.length },
  };

  return wb;
}

export async function buildCatalogTemplateBuffer(): Promise<Buffer> {
  const wb = buildCatalogTemplateWorkbook();
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
