"use client";

import { useMemo, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import {
  AlertTriangle,
  CalendarRange,
  Gauge,
  Layers3,
  Lightbulb,
  ListChecks,
  Wallet,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import styles from "../workspace.module.css";
import type { SessionResult } from "../analytics/actions";
import type { PpmpHeaderColumn } from "@/lib/ppmp/types";
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
import type { ConsumptionResult } from "@/lib/ppmp/analytics/consumption";

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

const priorityChartConfig = {
  planned: { label: "Planned budget", color: "#243b66" },
} satisfies ChartConfig;

/** Readable axis label: drop long parentheticals and clamp to two short lines. */
function shortItemLabel(name: string): string {
  const cleaned = name.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim() || name;
  if (cleaned.length <= 22) return cleaned;
  const words = cleaned.split(" ");
  let out = "";
  for (const word of words) {
    if ((out ? `${out} ${word}` : word).length > 20) break;
    out = out ? `${out} ${word}` : word;
  }
  return out ? `${out}…` : `${cleaned.slice(0, 20)}…`;
}

/** Compact peso label for the chart axis (values are already in pesos). */
function compactPeso(value: number): string {
  if (!Number.isFinite(value)) return "";
  if (Math.abs(value) >= 1_000_000) return `₱${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `₱${Math.round(value / 1_000)}k`;
  return `₱${Math.round(value)}`;
}

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
  // Most-recommended highlights: top planned totals deserve first budget attention.
  const recommended = useMemo(() => {
    const ranked = [...draft].sort((a, b) => (b.total_cents ?? 0) - (a.total_cents ?? 0));
    const top = ranked.slice(0, 8);
    const topTotal = top.reduce((a, r) => a + (r.total_cents ?? 0), 0);
    const allTotal = ranked.reduce((a, r) => a + (r.total_cents ?? 0), 0);
    const share = allTotal > 0 ? Math.round((topTotal / allTotal) * 100) : 0;
    return { top, topTotal, allTotal, share };
  }, [draft]);
  // Chart-ready shape: pesos (not centavos) so the axis and tooltip read clean.
  const priorityData = useMemo(
    () =>
      recommended.top.map((r) => ({
        item: r.item,
        planned: (r.total_cents ?? 0) / 100,
        share:
          recommended.allTotal > 0
            ? ((r.total_cents ?? 0) / recommended.allTotal) * 100
            : 0,
      })),
    [recommended]
  );

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
        {priorityData.length === 0 ? (
          <p className="rounded-md border border-navy-200 bg-navy-50/60 px-3 py-2 text-sm text-navy-700">
            No planned lines yet — build a draft to see the budget priorities.
          </p>
        ) : (
          <ChartContainer config={priorityChartConfig} className="h-[320px] w-full">
            <AreaChart
              accessibilityLayer
              data={priorityData}
              margin={{ top: 8, right: 12, left: 0, bottom: 8 }}
            >
              <defs>
                <linearGradient id="fill-planned-priority" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-planned)" stopOpacity={0.45} />
                  <stop offset="95%" stopColor="var(--color-planned)" stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="item"
                tickLine={false}
                axisLine={false}
                tickMargin={12}
                interval={0}
                tick={{ fontSize: 11 }}
                tickFormatter={shortItemLabel}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={68}
                tick={{ fontSize: 11 }}
                tickFormatter={compactPeso}
              />
              <ChartTooltip
                cursor={{ stroke: "#cbd5e1", strokeDasharray: "4 4" }}
                content={
                  <ChartTooltipContent
                    hideIndicator
                    formatter={(value, _name, item) => {
                      const share = Number(
                        (item.payload as { share?: number } | undefined)?.share ?? 0
                      );
                      return (
                        <div className="grid w-full gap-0.5">
                          <div className="flex w-full items-center justify-between gap-4">
                            <span className="text-zinc-500">Planned budget</span>
                            <span className="font-semibold tabular-nums text-navy-900">
                              {formatPlanningPesos(Math.round(Number(value) * 100))}
                            </span>
                          </div>
                          <span className="text-[11px] text-zinc-500">
                            {share.toFixed(1)}% of the planned total
                          </span>
                        </div>
                      );
                    }}
                  />
                }
              />
              <Area
                dataKey="planned"
                type="monotone"
                stroke="var(--color-planned)"
                strokeWidth={2}
                fill="url(#fill-planned-priority)"
                dot={{ r: 3, strokeWidth: 2, fill: "#ffffff" }}
                activeDot={{ r: 5 }}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </SectionCard>
    </div>
  );
}
