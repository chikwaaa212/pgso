"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { SessionResult } from "../analytics/actions";
import { GppbTable } from "./gppb-table";
import { downloadGppbExcel } from "./gppb-excel";
import {
  buildForecastsFromItems,
  buildPlanningForecasts,
  buildPpmpDraft,
  draftToCsv,
  formatPlanningPesos,
  gppbDraftToCsv,
  type PlanningItemInput,
  type PlanningMethod,
  type PlanningOptions,
} from "@/lib/ppmp/analytics/planning";

export function PlanningView({
  result,
  items,
  agency,
  targetYear,
  ceilingPesos,
  method,
  growthPct,
  pricePct,
  categoryFilter,
}: {
  result: SessionResult;
  items: PlanningItemInput[] | null;
  agency: string;
  targetYear: number | null;
  ceilingPesos: number | null;
  method: PlanningMethod;
  growthPct: number;
  pricePct: number;
  categoryFilter: string;
}) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const opts: PlanningOptions = useMemo(
    () => ({ targetYear, agency, ceilingPesos, method, growthPct, pricePct, categoryFilter }),
    [targetYear, agency, ceilingPesos, method, growthPct, pricePct, categoryFilter]
  );
  const forecasts = useMemo(
    () =>
      items && items.length > 0
        ? buildForecastsFromItems(items, result.report, opts)
        : buildPlanningForecasts(result.report, opts),
    [items, result, opts]
  );
  const draft = useMemo(
    () => buildPpmpDraft(forecasts, result.report, opts),
    [forecasts, result, opts]
  );
  // Most-recommended highlights: top planned totals deserve first budget attention.
  const recommended = useMemo(() => {
    const ranked = [...draft].sort((a, b) => (b.total_cents ?? 0) - (a.total_cents ?? 0));
    const top = ranked.slice(0, 8);
    const topTotal = top.reduce((a, r) => a + (r.total_cents ?? 0), 0);
    const allTotal = ranked.reduce((a, r) => a + (r.total_cents ?? 0), 0);
    const share = allTotal > 0 ? Math.round((topTotal / allTotal) * 100) : 0;
    return { top, topTotal, allTotal, share };
  }, [draft]);

  function downloadCsv() {
    const csv = draftToCsv(draft, targetYear);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `PPMP_DRAFT_FY${targetYear ?? "TBD"}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function downloadGppbCsv() {
    const csv = gppbDraftToCsv(draft, targetYear, agency);
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `PPMP_GPPB_FY${targetYear ?? "TBD"}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function downloadExcel() {
    if (draft.length === 0 || exporting) return;
    setExportError("");
    setExporting(true);
    try {
      await downloadGppbExcel(draft, targetYear, agency);
    } catch {
      setExportError("Excel export failed. Try the GPPB CSV instead.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="grid gap-4">
      <div
        role="note"
        aria-label="Planning assistance notice"
        className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900"
      >
        <strong className="font-semibold">
          This draft is future-planning assistance only.
        </strong>{" "}
        Every figure below is a projection to help you prepare the FY{" "}
        {targetYear ?? "TBD"} PPMP — it does not decide for you and does not change
        your mind or your decision. <strong className="font-semibold">You</strong> set the
        final quantities, budgets, and schedules. Please have your Budget and BAC
        offices validate this draft before submission.
      </div>

      <Card className="p-6">
        <h2 className="text-lg font-semibold">Most recommended for budget planning</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Top {recommended.top.length} items by planned base total —{" "}
          <strong className="font-semibold">{formatPlanningPesos(recommended.topTotal)}</strong> of{" "}
          <strong className="font-semibold">{formatPlanningPesos(recommended.allTotal)}</strong> (
          {recommended.share}%). Suggestions only — confirm these first with Budget; you decide
          the final plan.
        </p>
        <div className="mt-3 grid gap-2">
          {recommended.top.map((r, i) => (
            <div
              key={i}
              className="rounded-md border border-navy-200 bg-navy-50/60 px-3 py-2 text-sm leading-relaxed text-navy-900"
            >
              <strong className="font-semibold">
                #{i + 1} {r.item}
              </strong>{" "}
              — {(r.qty ?? 1).toLocaleString("en-PH")} {r.unit} ·{" "}
              <strong className="font-semibold">{formatPlanningPesos(r.total_cents)}</strong>
              {(r.total_cents ?? 0) === 0 ? (
                <span className="text-zinc-600"> — needs canvass first</span>
              ) : (
                <span className="text-zinc-600">
                  {" "}
                  · {r.proj_type} · {r.delivery_period}
                </span>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Proposed PPMP draft — GPPB format (Columns 1–12)</h2>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={() => void downloadExcel()} disabled={draft.length === 0 || exporting}>
              {exporting ? "Preparing Excel…" : "Export Excel (.xlsx)"}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={downloadCsv} disabled={draft.length === 0}>
              Export CSV for Excel
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={downloadGppbCsv} disabled={draft.length === 0}>
              Export GPPB CSV
            </Button>
          </div>
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          Official PPMP sheet layout, filled automatically from the plan. The .xlsx download matches this on-screen table — same columns, order, budget highlight, and TOTAL BUDGET footer. Milestones are template dates — confirm with BAC.
        </p>
        {exportError ? (
          <p role="alert" className="mt-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
            {exportError}
          </p>
        ) : null}
        <div className="mt-3">
          <GppbTable rows={draft} targetYear={targetYear} agency={agency} />
        </div>
      </Card>
    </div>
  );
}
