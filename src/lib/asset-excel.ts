import ExcelJS from "exceljs";

/**
 * Asset Excel template / import — single source of truth.
 *
 * Headers below are BYTE-EXACT copies from
 * `public/Sample Header and sample Data - updated.xlsx`
 * sheet "PPE CONSOLIDATED" row 1, including the two trailing spaces:
 *   - col 5  "IDENTIFIER " (trailing space)
 *   - col 14 "PROPERTY No. " (trailing space)
 *
 * DO NOT rename, reorder, or add headers — the importer maps by these
 * exact strings so user-filled template files extract cleanly.
 */

export const ASSET_TEMPLATE_SHEET = "PPE CONSOLIDATED";

export const ASSET_EXCEL_HEADERS: string[] = [
  "ACCOUNT CODE",
  "ASSET TYPE",
  "ACCOUNT TITLE",
  "ACCOUNT NAME",
  "IDENTIFIER ",
  "ARTICLE",
  "QTY.",
  "UNIT",
  "DESCRIPTION",
  "DATE ACQUIRED",
  "LOCATION",
  "TOTAL COST",
  "REMARKS",
  "PROPERTY No. ",
  "CONDITION",
  "UNIT COST",
  "END USER",
  "BRAND",
  "No. of Cyl.",
  "Engine Displacement",
  "Fuel Type",
  "ENGINE#",
  "CHASSIS#",
  "COLOR",
  "PLATE NO.",
  "FUND",
  "STATUS",
  "DV TRACKING NUMBER",
  "SUPPLIER/PAYEE",
  "ACCOUNT NAME-CHARGE",
  "ACCOUNT NUMBER",
  "OBR NUMBER",
  "DV NUMBER",
  "DATE RECEIVED AT INVENTORY SECTION",
];

const COLUMN_WIDTHS: number[] = [
  16, // ACCOUNT CODE
  26, // ASSET TYPE
  22, // ACCOUNT TITLE
  22, // ACCOUNT NAME
  14, // IDENTIFIER
  22, // ARTICLE
  8, // QTY.
  10, // UNIT
  44, // DESCRIPTION
  15, // DATE ACQUIRED
  20, // LOCATION
  15, // TOTAL COST
  24, // REMARKS
  24, // PROPERTY No.
  15, // CONDITION
  14, // UNIT COST
  20, // END USER
  16, // BRAND
  12, // No. of Cyl.
  20, // Engine Displacement
  12, // Fuel Type
  18, // ENGINE#
  18, // CHASSIS#
  12, // COLOR
  14, // PLATE NO.
  12, // FUND
  14, // STATUS
  20, // DV TRACKING NUMBER
  22, // SUPPLIER/PAYEE
  22, // ACCOUNT NAME-CHARGE
  18, // ACCOUNT NUMBER
  16, // OBR NUMBER
  16, // DV NUMBER
  24, // DATE RECEIVED AT INVENTORY SECTION
];

export function buildAssetTemplateWorkbook(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "PGSO";
  wb.title = "Asset Import Template (PPE CONSOLIDATED)";
  wb.created = new Date();

  const ws = wb.addWorksheet(ASSET_TEMPLATE_SHEET, {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  ws.columns = ASSET_EXCEL_HEADERS.map((header, i) => ({
    header,
    key: `c${i + 1}`,
    width: COLUMN_WIDTHS[i] ?? 18,
  }));

  // Header row styling — values stay exactly ASSET_EXCEL_HEADERS.
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

  // Guidance row (row 2) — example format, NOT a header. Users overwrite it.
  // Kept to one illustrative row so the template opens with a visible example;
  // the importer skips rows without an ACCOUNT CODE.
  const example: Record<string, string | number> = {
    c1: "1-07-05-010",
    c2: "Machinery and Equipment",
    c3: "MACHINERIES",
    c4: "MACHINERY",
    c6: "TRACTOR",
    c7: 1,
    c8: "unit",
    c9: "Example description — replace this row with your records",
    c11: "PGSO",
    c12: 950000,
    c14: "OFFICE-ITEM 001",
    c15: "SERVICEABLE",
    c16: 950000,
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
    to: { row: 1, column: ASSET_EXCEL_HEADERS.length },
  };

  // Data validation hints (do not restrict — just guide entry).
  // CONDITION col 15: SERVICEABLE / UNSERVICEABLE
  for (let r = 2; r <= 1001; r++) {
    ws.getCell(r, 15).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: ['"SERVICEABLE,UNSERVICEABLE"'],
      showErrorMessage: false,
    };
  }

  return wb;
}

export async function buildAssetTemplateBuffer(): Promise<Buffer> {
  const wb = buildAssetTemplateWorkbook();
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
