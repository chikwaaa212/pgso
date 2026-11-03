"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { SessionResult } from "../analytics/actions";
import { GppbTable } from "./gppb-table";
import { downloadGppbExcel } from "./gppb-excel";
import {
  buildForecastsFromItems,
  buildPlanningBasis,
  buildPlanningForecasts,
  buildPpmpDraft,
  draftToCsv,
  formatPlanningPesos,
  gppbDraftToCsv,
  type PlanningItemInput,
  type PlanningMethod,
  type PlanningOptions,
} from "@/lib/ppmp/analytics/planning";
import {
  compareToPlanned,
  type ConsumptionResult,
} from "@/lib/ppmp/analytics/consumption";

export function PlanningView({
  result,
  items,
  consumption,
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
  consumption: ConsumptionResult | null;
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
    () => ({
      targetYear,
      agency,
      ceilingPesos,
      method,
      growthPct,
      pricePct,
      categoryFilter,
      consumption: consumption?.suggestions ?? null,
    }),
    [targetYear, agency, ceilingPesos, method, growthPct, pricePct, categoryFilter, consumption]
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
  // Plain-language basis: what the system applied/raised/defaulted, so the
  // draft is auditable before anyone signs it.
  const basis = useMemo(
    () =>
      buildPlanningBasis(forecasts, draft, result.report, opts, {
        files: result.files,
        items,
      }),
    [forecasts, draft, result, opts, items]
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

  // Consumption check: compare every planned quantity against the issuance
  // history suggestion so a planner can see over/under-planning before export.
  const consumptionCheck = useMemo(() => {
    if (!consumption) return null;
    const byKey = new Map(consumption.suggestions.map((s) => [s.itemKey, s]));
    const rows = forecasts.map((f) => {
      const suggestion = byKey.get(f.item_key) ?? null;
      return {
        item_key: f.item_key,
        description: f.description,
        unit: f.unit,
        planned: f.qty_base,
        comparison: compareToPlanned(f.qty_base, suggestion),
      };
    });
    const noticed = rows.filter((r) => r.comparison.status !== "unknown");
    const under = noticed.filter((r) => r.comparison.status === "under").length;
    const over = noticed.filter((r) => r.comparison.status === "over").length;
    const aligned = noticed.filter((r) => r.comparison.status === "aligned").length;
    const unmatched = rows.length - noticed.length;
    return {
      years: consumption.years,
      matchedItems: consumption.suggestions.length,
      totalLines: consumption.totalLines,
      matchedLines: consumption.matchedLines,
      unmatchedLines: consumption.unmatchedLines,
      rows: noticed.slice(0, 12),
      under,
      over,
      aligned,
      unmatched,
    };
  }, [consumption, forecasts]);

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

      <Card className="p-6" aria-label="Basis for this planning draft">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Basis for this planning draft</h2>
            <p className="mt-1 text-xs text-zinc-500">
              What the system applied from your files, what it increased, how each line
              was projected, and which values it defaulted — so you can see exactly where
              this draft comes from before editing or exporting it.
            </p>
          </div>
          <span className="rounded-full border border-navy-200 bg-navy-50 px-2.5 py-1 text-xs font-medium text-navy-800">
            Projection — not final
          </span>
        </div>
        <p className="mt-3 rounded-md border border-navy-200 bg-navy-50/60 px-3 py-2 text-sm leading-relaxed text-navy-900">
          {basis.headline}
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {basis.sections.map((section) => (
            <div key={section.title} className="rounded-md border border-zinc-200 bg-zinc-50/40 p-3">
              <h3 className="text-sm font-semibold text-navy-900">{section.title}</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-zinc-700">
                {section.lines.map((line, i) => (
                  <li key={`${section.title}-${i}`}>{line}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Card>

      {consumptionCheck ? (
        <Card className="p-6" aria-label="Consumption check against issuance history">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">Consumption check — actual issuance history</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Planned quantities vs. what was actually issued in FY{" "}
                {consumptionCheck.years.join(", ") || "—"}. Advisory only: you decide the
                final quantity.
              </p>
            </div>
            <span className="rounded-full border border-navy-200 bg-navy-50 px-2.5 py-1 text-xs font-medium text-navy-800">
              {method === "consumption" ? "Applied to this draft" : "Comparison only"}
            </span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-navy-900">
            {consumptionCheck.matchedItems} item(s) matched issuance history ·{" "}
            {consumptionCheck.matchedLines.toLocaleString("en-PH")} of{" "}
            {consumptionCheck.totalLines.toLocaleString("en-PH")} issuance line(s) matched ·{" "}
            {consumptionCheck.unmatchedLines.toLocaleString("en-PH")} unmatched or outside the
            window. {consumptionCheck.under} under-planned · {consumptionCheck.over} over-planned ·{" "}
            {consumptionCheck.aligned} aligned · {consumptionCheck.unmatched} line(s) without
            history.
          </p>
          {consumptionCheck.rows.length === 0 ? (
            <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              No planned line could be matched to issuance history. Imported issuance records and
              PPMP descriptions must share the same normalized description and unit.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
                    <th className="py-2 pr-3 font-semibold">Item</th>
                    <th className="py-2 pr-3 font-semibold">Planned</th>
                    <th className="py-2 pr-3 font-semibold">Suggested (base)</th>
                    <th className="py-2 pr-3 font-semibold">Range</th>
                    <th className="py-2 font-semibold">Check</th>
                  </tr>
                </thead>
                <tbody>
                  {consumptionCheck.rows.map((row) => (
                    <tr key={row.item_key} className="border-b border-zinc-100 align-top">
                      <td className="py-2 pr-3">
                        {row.description}
                        {row.unit ? <span className="text-zinc-500"> ({row.unit})</span> : null}
                      </td>
                      <td className="py-2 pr-3 tabular-nums">
                        {row.planned === null ? "missing" : row.planned.toLocaleString("en-PH")}
                      </td>
                      <td className="py-2 pr-3 tabular-nums">
                        {row.comparison.suggestedBase === null
                          ? "—"
                          : row.comparison.suggestedBase.toLocaleString("en-PH")}
                      </td>
                      <td className="py-2 pr-3 tabular-nums text-zinc-600">
                        {row.comparison.suggestedLow === null || row.comparison.suggestedHigh === null
                          ? "—"
                          : `${row.comparison.suggestedLow.toLocaleString("en-PH")}–${row.comparison.suggestedHigh.toLocaleString("en-PH")}`}
                      </td>
                      <td className="py-2">
                        <span
                          className={
                            row.comparison.status === "under"
                              ? "text-amber-800"
                              : row.comparison.status === "over"
                                ? "text-navy-800"
                                : "text-emerald-800"
                          }
                        >
                          {row.comparison.label}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}

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
