"use client";

import { qtySizeText, type PpmpDraftRow } from "@/lib/ppmp/analytics/planning";

export const GPPB_HEADERS = [
  "General Description and Objective of the Project to be Procured",
  "Type of the Project to be Procured (whether Goods, Infrastructure and Consulting Services)",
  "Quantity and Size of the Project to be Procured",
  "Recommended Mode of Procurement",
  "Pre-Procurement Conference, if applicable (Yes/No)",
  "Start of Procurement Activity",
  "End of Procurement Activity",
  "Expected Delivery/ Implementation Period",
  "Source of Funds",
  "Estimated Budget / Authorized Budgetary Allocation (PhP)",
  "Attached Supporting Documents",
  "Remarks",
];

const GROUP_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } } as const;
const SUBHEAD_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } } as const;
const BUDGET_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFBAE6FD" } } as const;
const THIN_BORDER = {
  top: { style: "thin" },
  bottom: { style: "thin" },
  left: { style: "thin" },
  right: { style: "thin" },
} as const;

export function shortMode(mode: string): string {
  return (
    mode
      .replace(/ \(as recorded — confirm with BAC\)/, "")
      .replace(/ \(no mode in source\)/, "")
      .trim() || mode
  );
}

type ExcelJSNamespace = typeof import("exceljs");

/**
 * Build the GPPB workbook mirroring the on-screen GppbTable cell-for-cell:
 * fiscal year / end-user header, grouped headers, Column 1–12 sub-header,
 * data rows (budget column highlighted), TOTAL BUDGET footer.
 * Takes the exceljs namespace as a parameter so node tests can inject a
 * static import while the browser path lazy-loads it.
 */
export async function buildGppbWorkbook(
  ExcelJS: ExcelJSNamespace,
  rows: PpmpDraftRow[],
  targetYear: number | null,
  agency: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "PGSO-PSMS Planning";
  const ws = workbook.addWorksheet(`PPMP FY${targetYear ?? "TBD"}`);

  ws.columns = [
    { width: 42 },
    { width: 20 },
    { width: 26 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 20 },
    { width: 18 },
    { width: 22 },
    { width: 26 },
    { width: 26 },
  ];

  const fy = ws.getRow(1);
  fy.getCell(1).value = "Fiscal Year:";
  fy.getCell(1).font = { bold: true };
  fy.getCell(2).value = targetYear ?? "TBD";
  fy.getCell(2).font = { bold: true };

  ws.mergeCells("A2:L2");
  const eu = ws.getRow(2).getCell(1);
  eu.value = `End-User or Implementing Unit: ${agency || "General"}`;
  eu.font = { bold: true };

  const groups: [string, string, string][] = [
    ["A3", "E3", "PROCUREMENT PROJECT DETAILS"],
    ["F3", "H3", "PROJECTED TIMELINE (MM/YYYY)"],
    ["I3", "J3", "FUNDING DETAILS"],
    ["K3", "L3", ""],
  ];
  for (const [from, to, label] of groups) {
    ws.mergeCells(`${from}:${to}`);
    const c = ws.getCell(from);
    c.value = label || undefined;
    c.font = { bold: true };
    c.alignment = { horizontal: "center", vertical: "middle" };
    c.fill = GROUP_FILL;
  }
  for (let col = 1; col <= 12; col++) {
    const c = ws.getRow(3).getCell(col);
    c.border = THIN_BORDER;
    if (!c.fill) c.fill = GROUP_FILL;
  }
  ws.getRow(3).height = 22;

  const head = ws.getRow(4);
  GPPB_HEADERS.forEach((h, i) => {
    const c = head.getCell(i + 1);
    c.value = h;
    c.font = { bold: true, size: 11 };
    c.alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
    c.border = THIN_BORDER;
  });
  ws.getRow(4).height = 60;

  const sub = ws.getRow(5);
  for (let i = 1; i <= 12; i++) {
    const c = sub.getCell(i);
    c.value = `Column ${i}`;
    c.font = { bold: true, size: 11 };
    c.alignment = { horizontal: "center" };
    c.fill = SUBHEAD_FILL;
    c.border = THIN_BORDER;
  }

  let r = 6;
  for (const d of rows) {
    const row = ws.getRow(r);
    const cells: (string | number)[] = [
      d.item,
      d.proj_type,
      qtySizeText(d.qty, d.unit),
      shortMode(d.mode),
      d.preproc,
      d.start_activity,
      d.end_activity,
      d.delivery_period,
      d.source_funds,
      (d.total_cents ?? 0) / 100,
      d.docs,
      d.remarks,
    ];
    cells.forEach((v, i) => {
      const c = row.getCell(i + 1);
      c.value = v;
      c.alignment = { wrapText: true, vertical: "top" };
      c.border = THIN_BORDER;
      if (i === 1 || i === 3 || i === 4 || i === 5 || i === 6 || i === 7 || i === 8) {
        c.alignment = { wrapText: true, vertical: "top", horizontal: "center" };
      }
    });
    const budget = row.getCell(10);
    budget.numFmt = "#,##0.00";
    budget.fill = BUDGET_FILL;
    budget.font = { bold: true };
    budget.alignment = { vertical: "top", horizontal: "right" };
    r++;
  }

  const total = rows.reduce((a, d) => a + (d.total_cents ?? 0), 0);
  const trow = ws.getRow(r);
  for (let col = 1; col <= 12; col++) trow.getCell(col).border = THIN_BORDER;
  const label = trow.getCell(9);
  label.value = "TOTAL BUDGET:";
  label.font = { bold: true };
  label.alignment = { horizontal: "right" };
  const tval = trow.getCell(10);
  tval.value = total / 100;
  tval.numFmt = "#,##0.00";
  tval.font = { bold: true };
  tval.alignment = { horizontal: "right" };

  ws.views = [{ state: "frozen", ySplit: 5 }];
  return workbook;
}

/** Browser download: lazy-loads exceljs so the solver-sized chunk stays out of the initial bundle. */
export async function downloadGppbExcel(
  rows: PpmpDraftRow[],
  targetYear: number | null,
  agency: string
): Promise<void> {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = await buildGppbWorkbook(ExcelJS, rows, targetYear, agency);
  const buf = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `PPMP_GPPB_FY${targetYear ?? "TBD"}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
