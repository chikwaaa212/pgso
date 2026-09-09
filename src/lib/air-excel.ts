import ExcelJS from "exceljs";

/**
 * Shared Appendix 62 AIR workbook builder.
 * Layout mirrors public/templates/AIR FORM (1).xls + AIR.jpg and the
 * web IAR page (src/app/personnel/inspections/[id]/iar).
 *
 * 4 columns: A = left label · B = left value · C = right label · D = right value.
 * Value cells use indent 1 (≈10px gap from their horizontal label).
 */

export interface AirExcelItem {
  stockNo: string;
  description: string;
  unit: string;
  qty: string | number;
}

export interface AirExcelInput {
  entity: string;
  supplier: string;
  poNoDate: string;
  department: string;
  rcCode: string;
  fundCluster: string;
  iarNo: string;
  iarDate: string;
  invoiceNo: string;
  invoiceDate: string;
  items: AirExcelItem[];
  dateInspected: string;
  inspectorName: string;
  inspectionPassed: boolean;
  dateReceived: string;
  complete: boolean;
  partial: boolean;
  custodianName: string;
}

export const AIR_ITEM_ROWS = 12;

const THIN = { style: "thin" as const, color: { argb: "FF000000" } };
const GRID = { top: THIN, left: THIN, bottom: THIN, right: THIN };

const LABEL_FONT: Partial<ExcelJS.Font> = { name: "Arial", size: 11 };
const VALUE_FONT: Partial<ExcelJS.Font> = {
  name: "Arial",
  size: 11,
  bold: true,
};

function labelCell(cell: ExcelJS.Cell, text: string) {
  cell.value = text;
  cell.font = LABEL_FONT;
  cell.alignment = { vertical: "middle", wrapText: true };
  cell.border = GRID;
}

function valueCell(cell: ExcelJS.Cell, text: string | number) {
  cell.value = text;
  cell.font = VALUE_FONT;
  // indent 1 ≈ 10px gap from the horizontal label (matches web form gap:10px)
  cell.alignment = { vertical: "middle", wrapText: true, indent: 1 };
  cell.border = GRID;
}

export function buildAirWorkbook(input: AirExcelInput): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "PGSO";
  wb.title = "Inspection and Acceptance Report (Appendix 62)";

  const ws = wb.addWorksheet("AIR", {
    pageSetup: {
      paperSize: 9, // A4
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
  ws.pageSetup.printArea = "A1:D27";
  ws.columns = [
    { width: 24 }, // A left label / stock no.
    { width: 30 }, // B left value / description
    { width: 20 }, // C right label / unit
    { width: 20 }, // D right value / quantity
  ];

  // ── Appendix + title ──
  ws.mergeCells("A1:D1");
  const app = ws.getCell("A1");
  app.value = "Appendix 62";
  app.font = { name: "Arial", size: 11, italic: true };
  app.alignment = { horizontal: "right", vertical: "middle" };

  ws.mergeCells("A2:D2");
  const title = ws.getCell("A2");
  title.value = "INSPECTION AND ACCEPTANCE REPORT";
  title.font = { name: "Arial", size: 14, bold: true };
  title.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(2).height = 24;

  // ── Header rows ──
  const headerRows: Array<[string, string, string, string]> = [
    ["Entity Name :", input.entity, "Fund Cluster :", input.fundCluster],
    ["Supplier :", input.supplier, "IAR No. :", input.iarNo],
    ["PO No./Date :", input.poNoDate, "Date :", input.iarDate],
    [
      "Requisitioning Office/Dept. :",
      input.department,
      "Invoice No. :",
      input.invoiceNo,
    ],
    ["Responsibility Center Code :", input.rcCode, "Date :", input.invoiceDate],
  ];
  headerRows.forEach(([ll, lv, rl, rv], i) => {
    const r = 3 + i;
    labelCell(ws.getCell(`A${r}`), ll);
    valueCell(ws.getCell(`B${r}`), lv);
    labelCell(ws.getCell(`C${r}`), rl);
    valueCell(ws.getCell(`D${r}`), rv);
    ws.getRow(r).height = 20;
  });

  // ── Items header ──
  const heads: Array<[string, "center" | "left"]> = [
    ["Stock / Property No.", "center"],
    ["Description", "center"],
    ["Unit", "center"],
    ["Quantity", "center"],
  ];
  ["A", "B", "C", "D"].forEach((col, i) => {
    const c = ws.getCell(`${col}8`);
    c.value = heads[i][0];
    c.font = { name: "Arial", size: 11, bold: true, italic: true };
    c.alignment = {
      horizontal: heads[i][1],
      vertical: "middle",
      wrapText: true,
    };
    c.border = GRID;
  });
  ws.getRow(8).height = 30;

  // ── Item rows (pad to 12 for the ruled handwriting look) ──
  for (let i = 0; i < AIR_ITEM_ROWS; i++) {
    const r = 9 + i;
    const item = input.items[i];
    const vals: Array<string | number> = item
      ? [item.stockNo, item.description, item.unit, item.qty]
      : ["", "", "", ""];
    const aligns = ["center", "left", "center", "center"] as const;
    ["A", "B", "C", "D"].forEach((col, j) => {
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

  // ── Inspection / Acceptance titles ──
  ws.mergeCells("A21:B21");
  ws.mergeCells("C21:D21");
  for (const addr of ["A21", "C21"]) {
    const c = ws.getCell(addr);
    c.value = addr === "A21" ? "INSPECTION" : "ACCEPTANCE";
    c.font = { name: "Arial", size: 11, bold: true, italic: true };
    c.alignment = { horizontal: "center", vertical: "middle" };
    c.border = GRID;
  }
  // borders for the merged ranges
  for (const addr of ["B21", "D21"]) {
    ws.getCell(addr).border = GRID;
  }
  ws.getRow(21).height = 20;

  // ── Dates ──
  labelCell(ws.getCell("A22"), "Date Inspected :");
  valueCell(ws.getCell("B22"), input.dateInspected);
  labelCell(ws.getCell("C22"), "Date Received :");
  valueCell(ws.getCell("D22"), input.dateReceived);
  ws.getRow(22).height = 20;

  // ── Checkboxes (from the saved inspection record) ──
  ws.mergeCells("A23:B23");
  const insp = ws.getCell("A23");
  insp.value = `${input.inspectionPassed ? "☑" : "☐"}  Inspected, verified and found in order as to quantity and specifications`;
  insp.font = LABEL_FONT;
  insp.alignment = { vertical: "middle", wrapText: true };
  insp.border = GRID;
  ws.getCell("B23").border = GRID;

  ws.mergeCells("C23:D23");
  const comp = ws.getCell("C23");
  comp.value = `${input.complete ? "☑" : "☐"}  Complete`;
  comp.font = LABEL_FONT;
  comp.alignment = { vertical: "middle", wrapText: true };
  comp.border = GRID;
  ws.getCell("D23").border = GRID;
  ws.getRow(23).height = 32;

  ws.mergeCells("A24:B24");
  ws.getCell("A24").border = GRID;
  ws.getCell("B24").border = GRID;
  ws.mergeCells("C24:D24");
  const part = ws.getCell("C24");
  part.value = `${input.partial ? "☑" : "☐"}  Partial (pls. specify quantity)`;
  part.font = LABEL_FONT;
  part.alignment = { vertical: "middle", wrapText: true };
  part.border = GRID;
  ws.getCell("D24").border = GRID;
  ws.getRow(24).height = 20;

  // ── Spacer ──
  ws.getRow(25).height = 8;

  // ── Signatures (names come from the saved record) ──
  ws.mergeCells("A26:B26");
  const sigL = ws.getCell("A26");
  sigL.value = input.inspectorName;
  sigL.font = VALUE_FONT;
  sigL.alignment = { horizontal: "center", vertical: "middle" };
  sigL.border = { ...GRID, bottom: THIN };
  ws.getCell("B26").border = { ...GRID, bottom: THIN };

  ws.mergeCells("C26:D26");
  const sigR = ws.getCell("C26");
  sigR.value = input.custodianName;
  sigR.font = VALUE_FONT;
  sigR.alignment = { horizontal: "center", vertical: "middle" };
  sigR.border = { ...GRID, bottom: THIN };
  ws.getCell("D26").border = { ...GRID, bottom: THIN };
  ws.getRow(26).height = 20;

  ws.mergeCells("A27:B27");
  const labL = ws.getCell("A27");
  labL.value = "Inspection Officer/Inspection Committee";
  labL.font = { name: "Arial", size: 10 };
  labL.alignment = { horizontal: "center", vertical: "middle" };

  ws.mergeCells("C27:D27");
  const labR = ws.getCell("C27");
  labR.value = "Supply and/or Property Custodian";
  labR.font = { name: "Arial", size: 10 };
  labR.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(27).height = 16;

  return wb;
}

export async function buildAirBuffer(
  input: AirExcelInput
): Promise<Buffer> {
  const wb = buildAirWorkbook(input);
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export const BLANK_AIR_INPUT: AirExcelInput = {
  entity: "",
  supplier: "",
  poNoDate: "",
  department: "",
  rcCode: "",
  fundCluster: "",
  iarNo: "",
  iarDate: "",
  invoiceNo: "",
  invoiceDate: "",
  items: [],
  dateInspected: "",
  inspectorName: "",
  inspectionPassed: false,
  dateReceived: "",
  complete: false,
  partial: false,
  custodianName: "",
};
