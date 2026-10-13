"use client";

import type { PpmpDraftRow } from "@/lib/ppmp/analytics/planning";
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
 * GPPB-formatted PPMP table (Columns 1–12) rendered automatically from the
 * planning draft — the same layout as the official PPMP workbook sheet.
 */
export function GppbTable({
  rows,
  targetYear,
  agency,
}: {
  rows: PpmpDraftRow[];
  targetYear: number | null;
  agency: string;
}) {
  const total = rows.reduce((a, r) => a + (r.total_cents ?? 0), 0);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1400px] border-collapse text-left text-xs">
        <tbody>
          <tr>
            <td className="border border-navy-200 px-2 py-1.5 font-semibold text-navy-900">
              Fiscal Year:
            </td>
            <td className="border border-navy-200 px-2 py-1.5 font-bold text-navy-900" colSpan={5}>
              {targetYear ?? "TBD"}
            </td>
            <td className="border border-navy-200 px-2 py-1.5" colSpan={6} />
          </tr>
          <tr>
            <td className="border border-navy-200 px-2 py-1.5 font-semibold text-navy-900" colSpan={2}>
              End-User or Implementing Unit: {agency || "General"}
            </td>
            <td className="border border-navy-200 px-2 py-1.5 text-center font-semibold text-navy-900" colSpan={10} />
          </tr>
        </tbody>
        <thead>
          <tr>
            <th className="border border-navy-300 bg-navy-50 px-2 py-2 text-center font-semibold text-navy-900" colSpan={5}>
              PROCUREMENT PROJECT DETAILS
            </th>
            <th className="border border-navy-300 bg-navy-50 px-2 py-2 text-center font-semibold text-navy-900" colSpan={3}>
              PROJECTED TIMELINE (MM/YYYY)
            </th>
            <th className="border border-navy-300 bg-navy-50 px-2 py-2 text-center font-semibold text-navy-900" colSpan={2}>
              FUNDING DETAILS
            </th>
            <th className="border border-navy-300 bg-navy-50 px-2 py-2" colSpan={2} />
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
            ].map((h) => (
              <th key={h} className="border border-navy-300 bg-white px-2 py-2 align-top text-[11px] font-medium text-navy-900">
                {h}
              </th>
            ))}
          </tr>
          <tr className="bg-zinc-100 text-[11px] font-semibold text-zinc-600">
            {Array.from({ length: 12 }, (_, i) => (
              <td key={i} className="border border-navy-200 px-2 py-1 text-center">
                Column {i + 1}
              </td>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="align-top">
              <td className="border border-navy-200 px-2 py-2 font-medium text-navy-900">{r.item}</td>
              <td className="border border-navy-200 px-2 py-2 text-center">{r.proj_type}</td>
              <td className="border border-navy-200 px-2 py-2">{qtySizeText(r.qty, r.unit)}</td>
              <td className="border border-navy-200 px-2 py-2 text-center">{shortMode(r.mode)}</td>
              <td className="border border-navy-200 px-2 py-2 text-center">{r.preproc}</td>
              <td className="border border-navy-200 px-2 py-2 text-center">{r.start_activity}</td>
              <td className="border border-navy-200 px-2 py-2 text-center">{r.end_activity}</td>
              <td className="border border-navy-200 px-2 py-2 text-center">{r.delivery_period}</td>
              <td className="border border-navy-200 px-2 py-2 text-center">{r.source_funds}</td>
              <td className="border border-navy-200 bg-sky-200 px-2 py-2 text-right font-semibold text-navy-900">
                {formatPlanningPesos(r.total_cents)}
              </td>
              <td className="border border-navy-200 px-2 py-2">{r.docs}</td>
              <td className="border border-navy-200 px-2 py-2 italic">{r.remarks}</td>
            </tr>
          ))}
          <tr>
            <td className="border border-navy-200 px-2 py-2" colSpan={8} />
            <td className="border border-navy-200 px-2 py-2 text-right font-semibold text-navy-900">
              TOTAL BUDGET:
            </td>
            <td className="border border-navy-300 px-2 py-2 text-right font-bold text-navy-900">
              {formatPlanningPesos(total)}
            </td>
            <td className="border border-navy-200 px-2 py-2" colSpan={2} />
          </tr>
        </tbody>
      </table>
    </div>
  );
}
