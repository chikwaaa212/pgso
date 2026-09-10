import ExcelJS from "exceljs";

/**
 * Shared Appendix 59 ICS workbook builder.
 * Layout mirrors public/ICS FORM.xls and the web ICS sheet
 * (src/app/personnel/documents/ics-report.tsx).
 *
 * 7 columns: A Quantity · B Unit · C Unit Cost · D Total Cost ·
 * E Description · F Inventory Item No. · G Est. Useful Life.
 */

export interface IcsExcelItem {
  quantity: string | number;
  unit: string;
  unitCost: string | number;
  totalCost: string | number;
  description: string;
  inventoryItemNo: string;
  estUsefulLife: string;
}

export interface IcsExcelInput {
  entity: string;
  fundCluster: string;
  icsNo: string;
  items: IcsExcelItem[];
  receivedFromName: string;
  receivedFromPosition: string;
  receivedFromDate: string;
  receivedByName: string;
  receivedByPosition: string;
  receivedByDate: string;
}

export const ICS_ITEM_ROWS = 12;

const THIN = { style: "thin" as const, color: { argb: "FF000000" } };
const GRID = { top: THIN, left: THIN, bottom: THIN, right: THIN };

const LABEL_FONT: Partial<ExcelJS.Font> = { name: "Arial", size: 11 };
const VALUE_FONT: Partial<ExcelJS.Font> = {
  name: "Arial",
  size: 11,
  bold: true,
};

export function buildIcsWorkbook(input: IcsExcelInput): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "PGSO";
  wb.title = "Inventory Custodian Slip (Appendix 59)";

  const ws = wb.addWorksheet("ICS", {
    pageSetup: {
      paperSize: 1 as ExcelJS.PaperSize, // Letter (matches ICS FORM.xls)
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
  ws.pageSetup.printArea = "A1:G30";
  ws.columns = [
    { width: 12 }, // A Quantity
    { width: 12 }, // B Unit
    { width: 14 }, // C Unit Cost
    { width: 16 }, // D Total Cost
    { width: 34 }, // E Description
    { width: 20 }, // F Inventory Item No.
    { width: 18 }, // G Est. Useful Life
  ];

  // ── Appendix + title ──
  ws.mergeCells("A1:G1");
  const app = ws.getCell("A1");
  app.value = "Appendix 59";
  app.font = { name: "Arial", size: 11, italic: true };
  app.alignment = { horizontal: "right", vertical: "middle" };

  ws.mergeCells("A2:G2");
  const title = ws.getCell("A2");
  title.value = "INVENTORY CUSTODIAN SLIP";
  title.font = { name: "Arial", size: 14, bold: true };
  title.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(2).height = 24;

  // ── Header rows (mirrors ICS FORM.xls rows 6-7) ──
  ws.mergeCells("A3:G3");
  const e = ws.getCell("A3");
  e.value = `Entity Name : ${input.entity}`;
  e.font = LABEL_FONT;
  e.alignment = { vertical: "middle", wrapText: true };

  ws.mergeCells("A4:E4");
  const f = ws.getCell("A4");
  f.value = `Fund Cluster : ${input.fundCluster}`;
  f.font = LABEL_FONT;
  f.alignment = { vertical: "middle", wrapText: true };
  ws.mergeCells("F4:G4");
  const n = ws.getCell("F4");
  n.value = `ICS No. : ${input.icsNo}`;
  n.font = LABEL_FONT;
  n.alignment = { vertical: "middle", wrapText: true };
  ws.getRow(3).height = 20;
  ws.getRow(4).height = 20;

  // ── Items header (two rows: Amount spans Unit/Total Cost) ──
  const top: Array<[string, string]> = [
    ["A5", "Quantity"],
    ["B5", "Unit"],
    ["C5", "Amount"],
    ["E5", "Description"],
    ["F5", "Inventory Item No."],
    ["G5", "Estimated Useful Life"],
  ];
  ws.mergeCells("C5:D5");
  for (const [addr, text] of top) {
    const c = ws.getCell(addr);
    c.value = text;
    c.font = { name: "Arial", size: 11, bold: true, italic: true };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.border = GRID;
  }
  ws.getCell("D5").border = GRID;
  ws.getCell("A5").border = GRID;
  ws.getCell("B5").border = GRID;
  ws.getCell("E5").border = GRID;
  ws.getCell("F5").border = GRID;
  ws.getCell("G5").border = GRID;
  ws.getRow(5).height = 22;

  for (const [addr, text] of [
    ["A6", ""],
    ["B6", ""],
    ["C6", "Unit Cost"],
    ["D6", "Total Cost"],
    ["E6", ""],
    ["F6", ""],
    ["G6", ""],
  ] as Array<[string, string]>) {
    const c = ws.getCell(addr);
    c.value = text;
    c.font = { name: "Arial", size: 11, bold: true, italic: true };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.border = GRID;
  }
  ws.getRow(6).height = 22;

  // ── Item rows (pad for the ruled handwriting look) ──
  for (let i = 0; i < ICS_ITEM_ROWS; i++) {
    const r = 7 + i;
    const item = input.items[i];
    const vals: Array<string | number> = item
      ? [
          item.quantity,
          item.unit,
          item.unitCost,
          item.totalCost,
          item.description,
          item.inventoryItemNo,
          item.estUsefulLife,
        ]
      : ["", "", "", "", "", "", ""];
    const aligns = [
      "center",
      "center",
      "right",
      "right",
      "left",
      "center",
      "center",
    ] as const;
    ["A", "B", "C", "D", "E", "F", "G"].forEach((col, j) => {
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

  const foot = 7 + ICS_ITEM_ROWS; // 19
  // ── Received from / Received by titles ──
  ws.mergeCells(`A${foot}:C${foot}`);
  ws.mergeCells(`D${foot}:G${foot}`);
  for (const [addr, text] of [
    [`A${foot}`, "Received from:"],
    [`D${foot}`, "Received by:"],
  ]) {
    const c = ws.getCell(addr);
    c.value = text;
    c.font = { name: "Arial", size: 11, bold: true };
    c.alignment = { vertical: "middle", wrapText: true };
    c.border = GRID;
  }
  for (const addr of [`B${foot}`, `C${foot}`, `E${foot}`, `F${foot}`, `G${foot}`]) {
    ws.getCell(addr).border = GRID;
  }
  ws.getRow(foot).height = 20;

  // ── Signature names ──
  ws.mergeCells(`A${foot + 1}:C${foot + 1}`);
  const rf = ws.getCell(`A${foot + 1}`);
  rf.value = input.receivedFromName;
  rf.font = VALUE_FONT;
  rf.alignment = { horizontal: "center", vertical: "middle" };
  rf.border = GRID;
  ws.mergeCells(`D${foot + 1}:G${foot + 1}`);
  const rb = ws.getCell(`D${foot + 1}`);
  rb.value = input.receivedByName;
  rb.font = VALUE_FONT;
  rb.alignment = { horizontal: "center", vertical: "middle" };
  rb.border = GRID;
  for (const addr of [
    `B${foot + 1}`,
    `C${foot + 1}`,
    `E${foot + 1}`,
    `F${foot + 1}`,
    `G${foot + 1}`,
  ]) {
    ws.getCell(addr).border = GRID;
  }
  ws.getRow(foot + 1).height = 20;

  // ── Captions + position/date ──
  const meta: Array<[string, string, number]> = [
    [`A${foot + 2}:C${foot + 2}`, "Signature Over Printed Name", 16],
    [`D${foot + 2}:G${foot + 2}`, "Signature Over Printed Name", 16],
    [`A${foot + 3}:C${foot + 3}`, `Position/Office : ${input.receivedFromPosition}`, 20],
    [`D${foot + 3}:G${foot + 3}`, `Position/Office : ${input.receivedByPosition}`, 20],
    [`A${foot + 4}:C${foot + 4}`, `Date : ${input.receivedFromDate}`, 20],
    [`D${foot + 4}:G${foot + 4}`, `Date : ${input.receivedByDate}`, 20],
  ];
  meta.forEach(([range, text, h]) => {
    const addr = range.split(":")[0];
    ws.mergeCells(range);
    const c = ws.getCell(addr);
    c.value = text;
    c.font = LABEL_FONT;
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    const rowNo = Number(addr.replace(/[^0-9]/g, ""));
    ws.getRow(rowNo).height = h;
  });

  return wb;
}

export async function buildIcsBuffer(input: IcsExcelInput): Promise<Buffer> {
  const wb = buildIcsWorkbook(input);
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export const BLANK_ICS_INPUT: IcsExcelInput = {
  entity: "",
  fundCluster: "",
  icsNo: "",
  items: [],
  receivedFromName: "",
  receivedFromPosition: "",
  receivedFromDate: "",
  receivedByName: "",
  receivedByPosition: "",
  receivedByDate: "",
};
