import ExcelJS from "exceljs";

/**
 * Shared Appendix 71 PAR workbook builder.
 * Layout mirrors public/PAR FORM.xls and the web PAR sheet
 * (src/app/personnel/documents/par-report.tsx).
 *
 * 6 columns: A Quantity · B Unit · C Description · D Property No. ·
 * E Date Acquired · F Amount.
 */

export interface ParExcelItem {
  quantity: string | number;
  unit: string;
  description: string;
  propertyNo: string;
  dateAcquired: string;
  amount: string | number;
}

export interface ParExcelInput {
  entity: string;
  fundCluster: string;
  parNo: string;
  items: ParExcelItem[];
  receivedName: string;
  receivedPosition: string;
  receivedDate: string;
  issuedName: string;
  issuedPosition: string;
  issuedDate: string;
}

export const PAR_ITEM_ROWS = 12;

const THIN = { style: "thin" as const, color: { argb: "FF000000" } };
const GRID = { top: THIN, left: THIN, bottom: THIN, right: THIN };

const LABEL_FONT: Partial<ExcelJS.Font> = { name: "Arial", size: 11 };
const VALUE_FONT: Partial<ExcelJS.Font> = {
  name: "Arial",
  size: 11,
  bold: true,
};

function labelCell(cell: ExcelJS.Cell, text: string | number) {
  cell.value = text;
  cell.font = LABEL_FONT;
  cell.alignment = { vertical: "middle", wrapText: true };
  cell.border = GRID;
}

export function buildParWorkbook(input: ParExcelInput): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "PGSO";
  wb.title = "Property Acknowledgment Receipt (Appendix 71)";

  const ws = wb.addWorksheet("PAR", {
    pageSetup: {
      paperSize: 1 as ExcelJS.PaperSize, // Letter (matches PAR FORM.xls)
      orientation: "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      horizontalCentered: true,
    },
  });
  ws.pageSetup.margins = {
    left: 0.4,
    right: 0.4,
    top: 0.4,
    bottom: 0.4,
    header: 0.2,
    footer: 0.2,
  };
  ws.pageSetup.printArea = "A1:F29";
  ws.columns = [
    { width: 12 }, // A Quantity
    { width: 12 }, // B Unit
    { width: 34 }, // C Description
    { width: 18 }, // D Property No.
    { width: 16 }, // E Date Acquired
    { width: 18 }, // F Amount
  ];

  // ── Appendix + title ──
  ws.mergeCells("A1:F1");
  const app = ws.getCell("A1");
  app.value = "Appendix 71";
  app.font = { name: "Arial", size: 11, italic: true };
  app.alignment = { horizontal: "right", vertical: "middle" };

  ws.mergeCells("A2:F2");
  const title = ws.getCell("A2");
  title.value = "PROPERTY ACKNOWLEDGMENT RECEIPT";
  title.font = { name: "Arial", size: 14, bold: true };
  title.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(2).height = 24;

  // ── Header rows (mirrors PAR FORM.xls rows 6-7) ──
  ws.mergeCells("A3:F3");
  labelCell(ws.getCell("A3"), `Entity Name : ${input.entity}`);
  ws.getCell("A3").font = LABEL_FONT;
  ws.getRow(3).height = 20;

  ws.mergeCells("A4:C4");
  labelCell(ws.getCell("A4"), `Fund Cluster : ${input.fundCluster}`);
  ws.mergeCells("D4:F4");
  labelCell(ws.getCell("D4"), `PAR No. : ${input.parNo}`);
  ws.getRow(4).height = 20;

  // ── Items header ──
  const heads = [
    "Quantity",
    "Unit",
    "Description",
    "Property Number",
    "Date Acquired",
    "Amount",
  ];
  ["A", "B", "C", "D", "E", "F"].forEach((col, i) => {
    const c = ws.getCell(`${col}5`);
    c.value = heads[i];
    c.font = { name: "Arial", size: 11, bold: true, italic: true };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.border = GRID;
  });
  ws.getRow(5).height = 30;

  // ── Item rows (pad for the ruled handwriting look) ──
  for (let i = 0; i < PAR_ITEM_ROWS; i++) {
    const r = 6 + i;
    const item = input.items[i];
    const vals: Array<string | number> = item
      ? [
          item.quantity,
          item.unit,
          item.description,
          item.propertyNo,
          item.dateAcquired,
          item.amount,
        ]
      : ["", "", "", "", "", ""];
    const aligns = ["center", "center", "left", "center", "center", "right"] as const;
    ["A", "B", "C", "D", "E", "F"].forEach((col, j) => {
      const c = ws.getCell(`${col}${r}`);
      c.value = vals[j];
      c.font = LABEL_FONT;
      c.alignment = {
        horizontal: aligns[j],
        vertical: "middle",
        wrapText: true,
      };
      c.border = GRID;
    });
    ws.getRow(r).height = 20;
  }

  const foot = 6 + PAR_ITEM_ROWS; // 18
  // ── Received / Issued titles ──
  ws.mergeCells(`A${foot}:C${foot}`);
  ws.mergeCells(`D${foot}:F${foot}`);
  for (const addr of [`A${foot}`, `D${foot}`]) {
    const c = ws.getCell(addr);
    c.value = addr === `A${foot}` ? "Received by:" : "Issued by:";
    c.font = { name: "Arial", size: 11, bold: true };
    c.alignment = { vertical: "middle", wrapText: true };
    c.border = GRID;
  }
  for (const addr of [`B${foot}`, `C${foot}`, `E${foot}`, `F${foot}`]) {
    ws.getCell(addr).border = GRID;
  }
  ws.getRow(foot).height = 20;

  // ── Signature names ──
  ws.mergeCells(`A${foot + 1}:C${foot + 1}`);
  const recv = ws.getCell(`A${foot + 1}`);
  recv.value = input.receivedName;
  recv.font = VALUE_FONT;
  recv.alignment = { horizontal: "center", vertical: "middle" };
  recv.border = GRID;
  ws.mergeCells(`D${foot + 1}:F${foot + 1}`);
  const iss = ws.getCell(`D${foot + 1}`);
  iss.value = input.issuedName;
  iss.font = VALUE_FONT;
  iss.alignment = { horizontal: "center", vertical: "middle" };
  iss.border = GRID;
  for (const addr of [`B${foot + 1}`, `C${foot + 1}`, `E${foot + 1}`, `F${foot + 1}`]) {
    ws.getCell(addr).border = GRID;
  }
  ws.getRow(foot + 1).height = 20;

  // ── Signature captions ──
  ws.mergeCells(`A${foot + 2}:C${foot + 2}`);
  const rc = ws.getCell(`A${foot + 2}`);
  rc.value = "Signature over Printed Name of End User";
  rc.font = { name: "Arial", size: 10 };
  rc.alignment = { horizontal: "center", vertical: "middle" };
  ws.mergeCells(`D${foot + 2}:F${foot + 2}`);
  const ic = ws.getCell(`D${foot + 2}`);
  ic.value = "Signature over Printed Name of Supply and/or Property Custodian";
  ic.font = { name: "Arial", size: 10 };
  ic.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  ws.getRow(foot + 2).height = 28;

  // ── Position / Date ──
  const meta: Array<[string, string]> = [
    [`A${foot + 3}:C${foot + 3}`, `Position/Office : ${input.receivedPosition}`],
    [`D${foot + 3}:F${foot + 3}`, `Position/Office : ${input.issuedPosition}`],
    [`A${foot + 4}:C${foot + 4}`, `Date : ${input.receivedDate}`],
    [`D${foot + 4}:F${foot + 4}`, `Date : ${input.issuedDate}`],
  ];
  meta.forEach(([range, text], i) => {
    const addr = range.split(":")[0];
    ws.mergeCells(range);
    const c = ws.getCell(addr);
    c.value = text;
    c.font = LABEL_FONT;
    c.alignment = { vertical: "middle", wrapText: true };
    ws.getRow(foot + 3 + i).height = 20;
  });

  return wb;
}

export async function buildParBuffer(input: ParExcelInput): Promise<Buffer> {
  const wb = buildParWorkbook(input);
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export const BLANK_PAR_INPUT: ParExcelInput = {
  entity: "",
  fundCluster: "",
  parNo: "",
  items: [],
  receivedName: "",
  receivedPosition: "",
  receivedDate: "",
  issuedName: "",
  issuedPosition: "",
  issuedDate: "",
};
