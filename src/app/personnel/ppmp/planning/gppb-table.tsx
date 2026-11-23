"use client";

import type { PpmpDraftRow } from "@/lib/ppmp/analytics/planning";
import type { PpmpHeaderColumn } from "@/lib/ppmp/types";
import { formatPlanningPesos, qtySizeText } from "@/lib/ppmp/analytics/planning";

function shortMode(mode: string): string {
  return (
    mode
      .replace(/ \(as recorded — confirm with BAC\)/, "")
      .replace(/ \(no mode in source\)/, "")
      .trim() || mode
  );
}

/**
 * Renders the draft in the exact column layout of the workbook the planner
 * imported (same header labels and order). Values are mapped through the
 * canonical field detected for each column; unknown columns stay blank.
 */
function WorkbookLayoutTable({
  rows,
  columns,
  targetYear,
  agency,
}: {
  rows: PpmpDraftRow[];
  columns: PpmpHeaderColumn[];
  targetYear: number | null;
  agency: string;
}) {
  const total = rows.reduce((a, r) => a + (r.total_cents ?? 0), 0);
  const hasUnitColumn = columns.some((c) => c.field === "unit");

  const text = (r: PpmpDraftRow, field: string | null): string => {
    switch (field) {
      case "description":
        return r.item;
      case "type":
        return r.proj_type;
      case "qty":
        return hasUnitColumn
          ? r.qty === null
            ? "—"
            : r.qty.toLocaleString("en-PH")
          : qtySizeText(r.qty, r.unit);
      case "unit":
        return r.unit;
      case "price":
        return formatPlanningPesos(r.unit_cost_cents);
      case "total":
      case "budget":
        return formatPlanningPesos(r.total_cents);
      case "mode":
        return shortMode(r.mode);
      case "preproc":
        return r.preproc;
      case "start":
        return r.start_activity;
      case "end":
        return r.end_activity;
      case "delivery":
        return r.delivery_period;
      case "source_funds":
        return r.source_funds;
      case "docs":
        return r.docs;
      case "remarks":
        return r.remarks;
      case "office":
        return r.end_user;
      case "category":
        return r.category ?? r.expense_class;
      default:
        return "";
    }
  };

  const numeric = new Set(["qty", "price", "total", "budget"]);

  return (
    <div className="overflow-x-auto rounded-lg border border-navy-200">
      <div className="border-b border-navy-200 bg-navy-50/60 px-3 py-2 text-[11px] text-navy-700">
        {agency || "General"} · Fiscal Year {targetYear ?? "TBD"} · columns follow the
        uploaded workbook
      </div>
      <table className="w-full border-collapse text-left text-[11px] leading-snug" aria-label="Planning draft in the imported workbook layout">
        <thead>
          <tr>
            {columns.map((col, i) => (
              <th
                key={`${col.label}-${i}`}
                className="border-b border-r border-navy-300 bg-navy-50 px-2 py-2 align-top font-semibold text-navy-900 last:border-r-0"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="align-top odd:bg-white even:bg-navy-50/30 hover:bg-amber-50/40">
              {columns.map((col, j) => {
                const value = text(r, col.field);
                return (
                  <td
                    key={`${i}-${j}`}
                    className={`border-b border-r border-navy-200 px-2 py-2 last:border-r-0 ${
                      numeric.has(col.field ?? "")
                        ? "text-right tabular-nums whitespace-nowrap"
                        : ""
                    } ${col.field === "total" || col.field === "budget" ? "bg-sky-100 font-semibold" : ""}`}
                  >
                    {value || "\u00A0"}
                  </td>
                );
              })}
            </tr>
          ))}
          <tr className="bg-navy-50">
            {columns.map((col, i) => (
              <td
                key={`total-${i}`}
                className="border-t-2 border-navy-300 px-2 py-2 text-right font-semibold text-navy-900"
              >
                {i === columns.length - 1
                  ? formatPlanningPesos(total)
                  : col.field === "total" || col.field === "budget"
                    ? formatPlanningPesos(total)
                    : ""}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/**
 * GPPB-formatted PPMP table (Columns 1–12) rendered automatically from the
 * planning draft — the same layout as the official PPMP workbook sheet.
 */
export function GppbTable({
  rows,
  targetYear,
  agency,
  columns,
}: {
  rows: PpmpDraftRow[];
  targetYear: number | null;
  agency: string;
  /** Header row of the imported workbook; when present, it wins. */
  columns?: PpmpHeaderColumn[] | null;
}) {
  if (columns && columns.length > 1) {
    return (
      <WorkbookLayoutTable rows={rows} columns={columns} targetYear={targetYear} agency={agency} />
    );
  }
  const total = rows.reduce((a, r) => a + (r.total_cents ?? 0), 0);
  return (
    <div className="overflow-hidden rounded-lg border border-navy-200">
        <table className="w-full border-collapse text-left text-[10px] leading-snug">
          <tbody>
            <tr className="bg-white">
              <td className="border-b border-r border-navy-200 px-2.5 py-2 font-semibold text-navy-900">
                Fiscal Year:
              </td>
              <td className="border-b border-r border-navy-200 px-2.5 py-2 font-bold text-navy-900" colSpan={5}>
                {targetYear ?? "TBD"}
              </td>
              <td className="border-b border-navy-200" colSpan={6} />
            </tr>
            <tr className="bg-white">
              <td className="border-b border-r border-navy-200 px-2.5 py-2 font-semibold text-navy-900" colSpan={2}>
                End-User or Implementing Unit: {agency || "General"}
              </td>
              <td className="border-b border-navy-200" colSpan={10} />
            </tr>
          </tbody>
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="border-b border-r border-navy-300 bg-navy-50 px-1.5 py-2 text-center font-semibold text-navy-900" colSpan={5}>
                PROCUREMENT PROJECT DETAILS
              </th>
              <th className="border-b border-r border-navy-300 bg-navy-50 px-1.5 py-2 text-center font-semibold text-navy-900" colSpan={3}>
                PROJECTED TIMELINE (MM/YYYY)
              </th>
              <th className="border-b border-r border-navy-300 bg-navy-50 px-1.5 py-2 text-center font-semibold text-navy-900" colSpan={2}>
                FUNDING DETAILS
              </th>
              <th className="border-b border-navy-300 bg-navy-50 px-1.5 py-2" colSpan={2} />
            </tr>
            <tr>
              {[
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
              ].map((h, i) => (
                <th
                  key={`${h}-${i}`}
                  className="border-b border-r border-navy-300 bg-white px-1.5 py-2 align-top text-[10px] font-medium text-navy-900 last:border-r-0"
                >
                  {h}
                </th>
              ))}
            </tr>
            <tr className="bg-zinc-100 text-[10px] font-semibold text-zinc-600">
              {Array.from({ length: 12 }, (_, i) => (
                <td key={i} className="border-b border-r border-navy-200 px-1.5 py-1 text-center last:border-r-0">
                  Column {i + 1}
                </td>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="align-top odd:bg-white even:bg-navy-50/30 hover:bg-amber-50/40">
                <td className="border-b border-r border-navy-200 px-1.5 py-2 font-medium text-navy-900">{r.item}</td>
                <td className="border-b border-r border-navy-200 px-1.5 py-2 text-center">{r.proj_type}</td>
                <td className="border-b border-r border-navy-200 px-1.5 py-2">{qtySizeText(r.qty, r.unit)}</td>
                <td className="border-b border-r border-navy-200 px-1.5 py-2 text-center">{shortMode(r.mode)}</td>
                <td className="border-b border-r border-navy-200 px-1.5 py-2 text-center">{r.preproc}</td>
                <td className="border-b border-r border-navy-200 px-1.5 py-2 text-center tabular-nums">{r.start_activity}</td>
                <td className="border-b border-r border-navy-200 px-1.5 py-2 text-center tabular-nums">{r.end_activity}</td>
                <td className="border-b border-r border-navy-200 px-1.5 py-2 text-center tabular-nums">{r.delivery_period}</td>
                <td className="border-b border-r border-navy-200 px-1.5 py-2 text-center">{r.source_funds}</td>
                <td className="border-b border-r border-navy-200 bg-sky-100 px-1.5 py-2 text-right font-semibold tabular-nums text-navy-900 whitespace-nowrap">
                  {formatPlanningPesos(r.total_cents)}
                </td>
                <td className="border-b border-r border-navy-200 px-1.5 py-2">{r.docs}</td>
                <td className="border-b border-navy-200 px-1.5 py-2 italic">{r.remarks}</td>
              </tr>
            ))}
            <tr className="sticky bottom-0 z-10 bg-navy-50">
              <td className="border-t-2 border-navy-300 px-1.5 py-2" colSpan={8} />
              <td className="border-t-2 border-navy-300 px-1.5 py-2 text-right font-semibold text-navy-900">
                TOTAL BUDGET:
              </td>
              <td className="border-t-2 border-navy-300 bg-sky-100 px-1.5 py-2 text-right text-xs font-bold tabular-nums text-navy-900 whitespace-nowrap">
                {formatPlanningPesos(total)}
              </td>
              <td className="border-t-2 border-navy-300 px-1.5 py-2" colSpan={2} />
            </tr>
          </tbody>
        </table>
    </div>
  );
}
