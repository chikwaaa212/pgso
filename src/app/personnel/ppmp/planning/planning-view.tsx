"use client";

import { useMemo, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import {
  AlertTriangle,
  CalendarRange,
  FileSpreadsheet,
  Gauge,
  Layers3,
  Lightbulb,
  ListChecks,
  Wallet,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import styles from "../workspace.module.css";
import type { SessionResult } from "../analytics/actions";
import type { PpmpHeaderColumn } from "@/lib/ppmp/types";
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

function SectionHead({
  icon: Icon,
  kicker,
  title,
}: {
  icon: ComponentType<{ size?: number | string; "aria-hidden"?: boolean | "true" | "false" }>;
  kicker: string;
  title: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span
        className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-navy-100 text-navy-700"
        aria-hidden="true"
      >
        <Icon size={15} />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.09em] text-navy-400">{kicker}</p>
        <h2 className="text-base font-bold text-navy-900">{title}</h2>
      </div>
    </div>
  );
}

function SectionCard({
  icon,
  kicker,
  title,
  description,
  aside,
  children,
}: {
  icon: ComponentType<{ size?: number | string; "aria-hidden"?: boolean | "true" | "false" }>;
  kicker: string;
  title: string;
  description?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-navy-100 bg-gradient-to-b from-navy-50/70 to-transparent px-5 py-4">
        <div className="min-w-0">
          <SectionHead icon={icon} kicker={kicker} title={title} />
          {description ? (
            <div className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-600">{description}</div>
          ) : null}
        </div>
        {aside ? <div className="flex shrink-0 flex-wrap gap-2">{aside}</div> : null}
      </div>
      <div className="p-5">{children}</div>
    </Card>
  );
}

const TABLE_HEAD =
  "bg-navy-50/70 text-[11px] font-semibold uppercase tracking-wide text-navy-500";
const TABLE_ROW = "border-t border-navy-100 text-navy-900 transition-colors hover:bg-navy-50/40";
const TABLE_CELL = "px-3 py-2.5 align-top";

const STATUS_TONE: Record<string, string> = {
  under: "text-amber-800",
  over: "text-navy-800",
  aligned: "text-emerald-800",
};

export function PlanningView({
  result,
  items,
  columns,
  consumption,
  agency,
  targetYear,
  ceilingPesos,
  method,
  growthPct,
  pricePct,
}: {
  result: SessionResult;
  items: PlanningItemInput[] | null;
  columns: PpmpHeaderColumn[] | null;
  consumption: ConsumptionResult | null;
  agency: string;
  targetYear: number | null;
  ceilingPesos: number | null;
  method: PlanningMethod;
  growthPct: number;
  pricePct: number;
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
      // Category filtering was removed from the UI; the draft always covers
      // every line in the selected workbooks.
      categoryFilter: "all",
      consumption: consumption?.suggestions ?? null,
    }),
    [targetYear, agency, ceilingPesos, method, growthPct, pricePct, consumption]
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

  const draftStats = useMemo(() => {
    const totalCents = draft.reduce((a, r) => a + (r.total_cents ?? 0), 0);
    const priced = draft.filter((r) => (r.total_cents ?? 0) > 0).length;
    const unpriced = draft.length - priced;
    const ceilingPct =
      ceilingPesos !== null && ceilingPesos > 0
        ? (totalCents / 100 / ceilingPesos) * 100
        : null;
    return { totalCents, priced, unpriced, ceilingPct };
  }, [draft, ceilingPesos]);

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

  const overCeiling = draftStats.ceilingPct !== null && draftStats.ceilingPct > 100;
  const nearCeiling = draftStats.ceilingPct !== null && draftStats.ceilingPct > 90 && !overCeiling;

  return (
    <div className="grid gap-4">
      <div
        role="note"
        aria-label="Planning assistance notice"
        className="flex gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900"
      >
        <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
        <p>
          <strong className="font-semibold">This draft is future-planning assistance only.</strong>{" "}
          Every figure below is a projection to help you prepare the FY {targetYear ?? "TBD"} PPMP — it does not
          decide for you. <strong className="font-semibold">You</strong> set the final quantities, budgets, and
          schedules. Have your Budget and BAC offices validate this draft before submission.
        </p>
      </div>

      <Card className="overflow-hidden p-0" aria-label="Planning draft snapshot">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-navy-100 bg-gradient-to-b from-navy-50/70 to-transparent px-5 py-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.09em] text-navy-400">
              Draft snapshot
            </p>
            <h2 className="text-base font-bold text-navy-900">
              FY {targetYear ?? "TBD"} plan at a glance
            </h2>
          </div>
          <span
            className={styles.status}
            data-tone={overCeiling ? "bad" : nearCeiling ? "warn" : "ok"}
          >
            <span className={styles.statusDot} aria-hidden="true" />
            {draftStats.ceilingPct === null
              ? "No ceiling set"
              : overCeiling
                ? "Over the ceiling"
                : "Within the ceiling"}
          </span>
        </div>
        <div className="grid gap-4 p-5">
          <div className={styles.kpiGrid}>
            {([
              ["Target year", `FY ${targetYear ?? "TBD"}`, "info", "Forward-looking plan", CalendarRange],
              ["Draft lines", draft.length.toLocaleString("en-PH"), "neutral", "Procurement projects", Layers3],
              ["Draft total", formatPlanningPesos(draftStats.totalCents), "ok", "Projected budget", Wallet],
              [
                "Ceiling used",
                draftStats.ceilingPct === null ? "No cap" : `${draftStats.ceilingPct.toFixed(1)}%`,
                overCeiling ? "bad" : "warn",
                ceilingPesos === null ? "Set a ceiling to track usage" : `of ${formatPlanningPesos(ceilingPesos * 100)}`,
                Gauge,
              ],
              ["Needs canvass", String(draftStats.unpriced), "warn", "Lines with no priced budget", ListChecks],
            ] as const).map(([label, value, tone, meta, Icon]) => (
              <div key={label} className={styles.kpi} data-tone={tone}>
                <p className={styles.kpiLabel}>
                  <Icon size={12} aria-hidden="true" className="mr-1 inline align-[-2px]" />
                  {label}
                </p>
                <p className={styles.kpiValue} title={value}>{value}</p>
                <p className={styles.kpiMeta}>{meta}</p>
              </div>
            ))}
          </div>

          {draftStats.ceilingPct !== null ? (
            <div>
              <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
                <span>Budget ceiling usage</span>
                <span className="font-semibold tabular-nums text-navy-900">
                  {draftStats.ceilingPct.toFixed(1)}%
                </span>
              </div>
              <div
                className="h-2 overflow-hidden rounded-full bg-navy-100"
                role="img"
                aria-label={`${draftStats.ceilingPct.toFixed(1)} percent of the budget ceiling used`}
              >
                <div
                  className={cn(
                    "h-full rounded-full",
                    overCeiling ? "bg-red-500" : nearCeiling ? "bg-amber-500" : "bg-emerald-500"
                  )}
                  style={{ width: `${Math.min(100, Math.max(2, draftStats.ceilingPct))}%` }}
                />
              </div>
              {overCeiling ? (
                <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-red-700">
                  <AlertTriangle size={12} aria-hidden="true" />
                  The draft exceeds the ceiling by{" "}
                  {formatPlanningPesos(draftStats.totalCents - ceilingPesos! * 100)}. Trim lines or raise the cap.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </Card>

      <SectionCard
        icon={FileSpreadsheet}
        kicker="Explainability"
        title="Basis for this planning draft"
        description="What the system applied from your files, what it increased, how each line was projected, and which values it defaulted — so you can see exactly where this draft comes from before editing or exporting it."
        aside={
          <span className="rounded-full border border-navy-200 bg-navy-50 px-2.5 py-1 text-xs font-medium text-navy-800">
            Projection — not final
          </span>
        }
      >
        <p className="rounded-lg border border-navy-200 bg-navy-50/60 px-3.5 py-2.5 text-sm leading-relaxed text-navy-900">
          {basis.headline}
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {basis.sections.map((section) => (
            <div key={section.title} className="rounded-lg border border-navy-200 bg-white p-3.5">
              <h3 className="text-sm font-semibold text-navy-900">{section.title}</h3>
              <ul className="mt-2 grid gap-1.5 text-sm leading-relaxed text-zinc-700">
                {section.lines.map((line, i) => (
                  <li key={`${section.title}-${i}`} className="flex gap-2">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-navy-300" aria-hidden="true" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </SectionCard>

      {consumptionCheck ? (
        <SectionCard
          icon={Gauge}
          kicker="Usage check"
          title="Consumption check — actual issuance history"
          description={
            <>
              Planned quantities vs. what was actually issued in FY{" "}
              {consumptionCheck.years.join(", ") || "—"}. Advisory only: you decide the final quantity.
            </>
          }
          aside={
            <span className="rounded-full border border-navy-200 bg-navy-50 px-2.5 py-1 text-xs font-medium text-navy-800">
              {method === "consumption" ? "Applied to this draft" : "Comparison only"}
            </span>
          }
        >
          <p className="text-sm leading-relaxed text-navy-900">
            {consumptionCheck.matchedItems} item(s) matched issuance history ·{" "}
            {consumptionCheck.matchedLines.toLocaleString("en-PH")} of{" "}
            {consumptionCheck.totalLines.toLocaleString("en-PH")} issuance line(s) matched ·{" "}
            {consumptionCheck.unmatchedLines.toLocaleString("en-PH")} unmatched or outside the window.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 font-semibold text-amber-900">
              {consumptionCheck.under} under-planned
            </span>
            <span className="rounded-full border border-navy-200 bg-navy-50 px-2.5 py-1 font-semibold text-navy-800">
              {consumptionCheck.over} over-planned
            </span>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-800">
              {consumptionCheck.aligned} aligned
            </span>
            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 font-semibold text-zinc-600">
              {consumptionCheck.unmatched} without history
            </span>
          </div>
          {consumptionCheck.rows.length === 0 ? (
            <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              No planned line could be matched to issuance history. Imported issuance records and PPMP
              descriptions must share the same normalized description and unit.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-md border border-navy-100">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead>
                  <tr className={TABLE_HEAD}>
                    <th className="px-3 py-2 font-semibold">Item</th>
                    <th className="px-3 py-2 font-semibold">Planned</th>
                    <th className="px-3 py-2 font-semibold">Suggested (base)</th>
                    <th className="px-3 py-2 font-semibold">Range</th>
                    <th className="px-3 py-2 font-semibold">Check</th>
                  </tr>
                </thead>
                <tbody>
                  {consumptionCheck.rows.map((row) => (
                    <tr key={row.item_key} className={TABLE_ROW}>
                      <td className={cn(TABLE_CELL, "font-medium text-navy-900")}>
                        {row.description}
                        {row.unit ? <span className="font-normal text-zinc-500"> ({row.unit})</span> : null}
                      </td>
                      <td className={cn(TABLE_CELL, "tabular-nums")}>
                        {row.planned === null ? "missing" : row.planned.toLocaleString("en-PH")}
                      </td>
                      <td className={cn(TABLE_CELL, "tabular-nums")}>
                        {row.comparison.suggestedBase === null
                          ? "—"
                          : row.comparison.suggestedBase.toLocaleString("en-PH")}
                      </td>
                      <td className={cn(TABLE_CELL, "tabular-nums text-zinc-600")}>
                        {row.comparison.suggestedLow === null || row.comparison.suggestedHigh === null
                          ? "—"
                          : `${row.comparison.suggestedLow.toLocaleString("en-PH")}–${row.comparison.suggestedHigh.toLocaleString("en-PH")}`}
                      </td>
                      <td className={cn(TABLE_CELL, "font-medium", STATUS_TONE[row.comparison.status] ?? "text-zinc-700")}>
                        {row.comparison.label}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      ) : null}

      <SectionCard
        icon={Lightbulb}
        kicker="Priority"
        title="Most recommended for budget planning"
        description={
          <>
            Top {recommended.top.length} items by planned base total —{" "}
            <strong className="font-semibold">{formatPlanningPesos(recommended.topTotal)}</strong> of{" "}
            <strong className="font-semibold">{formatPlanningPesos(recommended.allTotal)}</strong> (
            {recommended.share}%). Suggestions only — confirm these first with Budget; you decide the final plan.
          </>
        }
      >
        <div className="grid gap-2">
          {recommended.top.map((r, i) => {
            const share =
              recommended.allTotal > 0
                ? ((r.total_cents ?? 0) / recommended.allTotal) * 100
                : 0;
            return (
              <div
                key={i}
                className="rounded-lg border border-navy-200 bg-white px-3.5 py-3 text-sm leading-relaxed text-navy-900"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-semibold">
                      <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-navy-900 text-[10px] font-bold text-white">
                        {i + 1}
                      </span>
                      <span className="truncate" title={r.item}>{r.item}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-600">
                      {(r.qty ?? 1).toLocaleString("en-PH")} {r.unit}
                      {(r.total_cents ?? 0) === 0 ? (
                        <span className="font-medium text-amber-800"> · needs canvass first</span>
                      ) : (
                        <span> · {r.proj_type} · {r.delivery_period}</span>
                      )}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-bold tabular-nums">{formatPlanningPesos(r.total_cents)}</p>
                    <p className="text-[11px] tabular-nums text-zinc-500">{share.toFixed(1)}% of draft</p>
                  </div>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-navy-100">
                  <div
                    className="h-full rounded-full bg-navy-900"
                    style={{ width: `${Math.min(100, Math.max(2, share))}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard
        icon={ListChecks}
        kicker="Export"
        title={
          columns && columns.length > 0
            ? "Proposed PPMP draft — your imported workbook layout"
            : "Proposed PPMP draft — GPPB format (Columns 1–12)"
        }
        description={
          columns && columns.length > 0
            ? "This table uses the same columns, order, and headers as the workbook you selected, filled with the projected FY plan. The Excel download keeps the official GPPB layout for submission; the CSV downloads remain available for reference."
            : "Official PPMP sheet layout, filled automatically from the plan. Milestones are template dates — confirm with BAC."
        }
        aside={
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => void downloadExcel()} disabled={draft.length === 0 || exporting}>
              {exporting ? "Preparing Excel…" : "Export Excel (.xlsx)"}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={downloadCsv} disabled={draft.length === 0}>
              Export CSV
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={downloadGppbCsv} disabled={draft.length === 0}>
              Export GPPB CSV
            </Button>
          </div>
        }
      >
        {exportError ? (
          <p role="alert" className="mb-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
            {exportError}
          </p>
        ) : null}
        <GppbTable rows={draft} targetYear={targetYear} agency={agency} columns={columns} />
      </SectionCard>
    </div>
  );
}
