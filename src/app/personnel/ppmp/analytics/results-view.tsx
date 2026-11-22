"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import type { ComponentType, ReactNode } from "react";
import {
  AlertTriangle,
  CalendarDays,
  FileText,
  Info,
  Lightbulb,
  Sparkles,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import styles from "../workspace.module.css";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { SessionResult } from "./actions";
import type { EvidenceRef } from "@/lib/ppmp/analytics/types";

function peso(cents: number | null): string {
  if (cents === null || cents === undefined) return "—";
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}₱${Math.floor(abs / 100).toLocaleString("en-PH")}.${String(abs % 100).padStart(2, "0")}`;
}

function fmtPct(pct: number | null): string {
  if (pct === null || pct === undefined) return "n/a";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

function fmtQty(qty: number | null): string {
  if (qty === null || qty === undefined) return "not stated";
  return Number.isInteger(qty) ? qty.toLocaleString("en-PH") : qty.toFixed(2);
}

function titleCase(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Plain-language lead paragraph under each card heading. */
function Readout({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-navy-100 bg-navy-50/60 px-3.5 py-2.5 text-sm leading-relaxed text-navy-900">
      {children}
    </p>
  );
}

/** Consistent card heading with an icon and a numbered kicker. */
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

/** Card shell that keeps every analysis section visually consistent. */
function SectionCard({
  icon,
  kicker,
  title,
  description,
  aside,
  className,
  children,
}: {
  icon: ComponentType<{ size?: number | string; "aria-hidden"?: boolean | "true" | "false" }>;
  kicker: string;
  title: string;
  description?: ReactNode;
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={cn("overflow-hidden p-0", className)}>
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

function Chip({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "info" | "ok" | "warn" | "bad";
  children: ReactNode;
}) {
  const tones: Record<string, string> = {
    neutral: "border-navy-200 bg-navy-50 text-navy-700",
    info: "border-blue-200 bg-blue-50 text-blue-800",
    ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warn: "border-amber-300 bg-amber-50 text-amber-900",
    bad: "border-red-200 bg-red-50 text-red-800",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        tones[tone]
      )}
    >
      {children}
    </span>
  );
}

const SERIES_COLORS = ["#1b2a4a", "#b8912a", "#2d4a7a", "#8a9bb5", "#4a6080"];

const TABLE_HEAD =
  "bg-navy-50/70 text-[11px] font-semibold uppercase tracking-wide text-navy-500";
const TABLE_ROW = "border-t border-navy-100 text-navy-900 transition-colors hover:bg-navy-50/40";
const TABLE_CELL = "px-3 py-2.5 align-top";

const TREND_STYLE: Record<string, string> = {
  INCREASING: "border-navy-600 bg-navy-900 text-white",
  DECREASING: "border-zinc-400 bg-zinc-200 text-zinc-800",
  STABLE: "border-green-300 bg-green-50 text-green-900",
  VOLATILE: "border-amber-300 bg-amber-50 text-amber-900",
  INSUFFICIENT_DATA: "border-zinc-300 bg-zinc-100 text-zinc-600",
};

const ANOMALY_METHOD_LABEL: Record<string, string> = {
  first_appearance: "New item",
  disappearance: "Item dropped",
  yoy_spike: "Sharp change vs last year",
  z_score: "Statistical outlier",
  vs_average: "Far from the average",
  cost_divergence: "Quantity and cost moved apart",
  missing_schedule: "Missing schedule",
  category_outlier: "Unusual for its category",
  duplicate_description: "Repeated description",
};

const RULE_LABEL: Record<string, string> = {
  QTY_MULTI_YR: "Quantity across years",
  QTY_ABOVE_AVG: "Quantity above average",
  STOCK_COVER: "Stock cover",
  COST_JUMP: "Cost jump",
  ANOMALY_REVIEW: "Anomaly review",
  FORECAST_CONFIRM: "Forecast check",
};

const RULE_TONE: Record<string, "neutral" | "info" | "ok" | "warn" | "bad"> = {
  QTY_MULTI_YR: "info",
  QTY_ABOVE_AVG: "warn",
  STOCK_COVER: "info",
  COST_JUMP: "warn",
  ANOMALY_REVIEW: "warn",
  FORECAST_CONFIRM: "info",
};

const yearlyChartConfig = {
  budget: { label: "Est. budget (₱)", color: "#243b66" },
  items: { label: "Line items", color: "#f5c518" },
} satisfies ChartConfig;

/**
 * Source rows as compact stacked cards rather than a wide table, so evidence
 * fits inside half-width panels without a horizontal scrollbar.
 */
function EvidenceTable({ rows }: { rows: EvidenceRef[] }) {
  if (rows.length === 0) return <p className="text-xs text-zinc-500">No source rows.</p>;
  return (
    <ul className="mt-1 grid gap-1.5">
      {rows.map((e, i) => (
        <li
          key={`${e.file}-${e.sheet}-${e.row}-${i}`}
          className="rounded-md border border-navy-100 bg-white px-2.5 py-2 text-[11px] leading-snug"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="min-w-0 font-medium text-navy-900" title={e.item}>{e.item}</span>
            <span className="shrink-0 font-semibold tabular-nums text-navy-900">{peso(e.budget_cents)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Trace({ trace, evidence }: { trace: string; evidence?: EvidenceRef[] }) {
  return (
    <details className="group mt-2 text-xs">
      <summary className="cursor-pointer font-medium text-navy-700 underline decoration-navy-300 underline-offset-2 hover:text-navy-900">
        How was this calculated?{evidence && evidence.length > 0 ? " (show work + evidence)" : " (show work)"}
      </summary>
      <p className="mt-1.5 rounded-md bg-navy-50 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-navy-900">
        {trace}
      </p>
      {evidence && evidence.length > 0 ? (
        <div className="mt-2">
          <p className="mb-1 font-semibold text-zinc-600">Source evidence</p>
          <EvidenceTable rows={evidence} />
        </div>
      ) : null}
    </details>
  );
}

/** Collapses repeated descriptions so long text is not listed again and again. */
function aggregateTop(top: { description: string; budget_cents: number }[]) {
  const map = new Map<string, { description: string; budget_cents: number; count: number }>();
  for (const t of top) {
    const found = map.get(t.description);
    if (found) {
      found.budget_cents += t.budget_cents;
      found.count += 1;
    } else {
      map.set(t.description, { description: t.description, budget_cents: t.budget_cents, count: 1 });
    }
  }
  return [...map.values()].sort((a, b) => b.budget_cents - a.budget_cents);
}

/** Small badge used next to a description that appears on more than one line. */
function RepeatBadge({ count }: { count: number }) {
  if (count <= 1) return null;
  return (
    <span className="ml-1.5 inline-flex shrink-0 items-center rounded-full border border-amber-300 bg-amber-50 px-1.5 py-px align-middle text-[10px] font-semibold text-amber-900">
      ×{count} lines
    </span>
  );
}

export function ResultsView({ result }: { result: SessionResult }) {
  const { report, files } = result;
  const chartData = report.overview.yearly.map((y) => ({
    year: String(y.year),
    budget: y.budget_cents !== null && y.budget_cents !== undefined ? Math.round(y.budget_cents / 100) : 0,
    items: y.items,
  }));

  const duplicateCount = new Map(report.fileInsights.duplicates.map((d) => [d.description, d.occurrences]));

  return (
    <div className="grid gap-4">
      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-navy-100 bg-gradient-to-b from-navy-50/70 to-transparent px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.09em] text-navy-400">At a glance</p>
            <h2 className="text-base font-bold text-navy-900">Overview</h2>
            <p className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-zinc-500">
              {files.map((f) => f.filename).join(" · ")}
              {result.configVersion !== null && result.configVersion !== undefined
                ? ` · rules v${result.configVersion}`
                : ""}
            </p>
          </div>
          <span className={styles.status} data-tone="ok">
            <span className={styles.statusDot} aria-hidden="true" />
            Parsed from {report.overview.files} file{report.overview.files === 1 ? "" : "s"}
          </span>
        </div>
        <div className="p-5">
          <div className={styles.kpiGrid}>
            {([
              ["Files compared", String(report.overview.files), "info", "Uploaded workbooks in this run"],
              ["Fiscal years", report.overview.years.join(", ") || "—", "warn", "Years covered by the parsed rows"],
              ["Line items", report.overview.line_items.toLocaleString("en-PH"), "ok", "Readable procurement lines"],
              ["Total est. budget", peso(report.overview.total_budget_cents), "info", "Sum of recorded budgets"],
              ["Offices", String(report.overview.offices), "neutral", "Distinct implementing units"],
              ["Categories", String(report.overview.categories), "neutral", "Distinct item groups"],
              ["Budget-only lines", String(report.overview.budget_only_lines), "warn", "Rows with a budget but no quantity"],
              ["Low-confidence lines", String(report.overview.low_confidence_lines), "bad", "Rows needing a manual check"],
            ] as const).map(([label, value, tone, meta]) => (
              <div key={label} className={styles.kpi} data-tone={tone}>
                <p className={styles.kpiLabel}>{label}</p>
                <p className={styles.kpiValue} title={value}>{value}</p>
                <p className={styles.kpiMeta}>{meta}</p>
              </div>
            ))}
          </div>
          {chartData.length > 0 ? (
            <ChartContainer config={yearlyChartConfig} className="mt-5 max-h-[280px] w-full">
              <BarChart accessibilityLayer data={chartData}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="year" tickLine={false} tickMargin={10} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} width={48} allowDecimals={false} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dashed" />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="budget" fill="var(--color-budget)" radius={4} />
                <Bar dataKey="items" fill="var(--color-items)" radius={4} />
              </BarChart>
            </ChartContainer>
          ) : null}
        </div>
      </Card>

      <SectionCard
        icon={CalendarDays}
        kicker="Timing"
        title="Quarterly schedule"
        description={report.quarterly.rule}
      >
        {result.report.quarterly.cells.length === 0 ? (
          <p className="text-sm text-zinc-600">
            No line has a readable start or delivery month, so no quarterly calendar could be built.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-navy-100">
            <table className="w-full min-w-[520px] border-collapse text-left text-sm">
              <thead>
                <tr className={TABLE_HEAD}>
                  <th className="px-3 py-2 font-semibold">Quarter</th>
                  <th className="px-3 py-2 font-semibold">Procurement starts</th>
                  <th className="px-3 py-2 font-semibold">Budget loading</th>
                </tr>
              </thead>
              <tbody>
                {result.report.quarterly.cells.map((c) => (
                  <tr key={`${c.year}-Q${c.quarter}`} className={TABLE_ROW}>
                    <td className="px-3 py-2.5 font-semibold text-navy-900">{c.year} Q{c.quarter}</td>
                    <td className="px-3 py-2.5 tabular-nums">{c.starts.toLocaleString("en-PH")} line(s)</td>
                    <td className="px-3 py-2.5 font-medium tabular-nums">{peso(c.budget_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {(result.report.quarterly.unscheduledStarts > 0 ||
          result.report.quarterly.unscheduledDeliveries > 0) && (
          <p className="mt-2 text-xs leading-relaxed text-zinc-500">
            <span className="font-semibold text-amber-800">Unscheduled:</span>{" "}
            {result.report.quarterly.unscheduledStarts} line(s) without a readable start month,{" "}
            {result.report.quarterly.unscheduledDeliveries} without a readable delivery month
            {result.report.quarterly.unscheduledBudgetCents !== null && result.report.quarterly.unscheduledBudgetCents !== undefined
              ? ` (${peso(result.report.quarterly.unscheduledBudgetCents)} excluded from quarterly loading)`
              : ""}
            . These lines are counted here, never guessed into a quarter.
          </p>
        )}
      </SectionCard>

      <SectionCard
        icon={FileText}
        kicker="Contents"
        title="File insights"
        description="What this file contains — no history needed. Figures below are computed directly from the parsed lines."
      >
        {result.report.fileInsights.narrative.length > 0 && (
          <ul className="grid gap-1.5 text-sm leading-relaxed text-navy-900">
            {result.report.fileInsights.narrative.map((n, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-navy-400" aria-hidden="true" />
                <span>{n}</span>
              </li>
            ))}
          </ul>
        )}

        {result.report.fileInsights.byCategory.length > 0 && (
          <div className="mt-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Spend by category</p>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {(() => {
                const total = result.report.fileInsights.totalBudgetCents;
                const categories = result.report.fileInsights.byCategory.slice(0, 8);
                const max = Math.max(0, ...categories.map((c) => c.budget_cents ?? 0));
                return categories.map((c, ci) => {
                  const share = c.budget_cents !== null && c.budget_cents !== undefined && total ? (c.budget_cents / total) * 100 : 0;
                  const bar = max > 0 && c.budget_cents ? Math.max(4, Math.round((c.budget_cents / max) * 100)) : 0;
                  const top = aggregateTop(c.top).slice(0, 4);
                  return (
                    <div key={`${c.name}-${ci}`} className="rounded-lg border border-navy-200 bg-white p-3.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 truncate text-sm font-semibold text-navy-900" title={c.name}>{c.name}</p>
                        <span className="shrink-0 rounded-full bg-navy-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-navy-700">
                          {share.toFixed(1)}%
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-zinc-600">
                        {c.lines.toLocaleString("en-PH")} line(s) · {peso(c.budget_cents)} · {share.toFixed(1)}% of spend
                      </p>
                      <div
                        className="mt-2 h-2 overflow-hidden rounded-full bg-navy-100"
                        role="img"
                        aria-label={`${c.name} ${share.toFixed(1)} percent of spend`}
                      >
                        <div className="h-full rounded-full bg-navy-900" style={{ width: `${bar}%` }} />
                      </div>
                      {top.length > 0 && (
                        <ul className="mt-2.5 divide-y divide-navy-100 text-xs text-zinc-600">
                          {top.map((t, i) => (
                            <li key={`${t.description}-${i}`} className="flex items-baseline justify-between gap-2 py-1 first:pt-0 last:pb-0">
                              <span className="min-w-0 truncate" title={t.description}>
                                {t.description}
                                <RepeatBadge count={t.count} />
                              </span>
                              <span className="shrink-0 font-medium tabular-nums text-navy-900">{peso(t.budget_cents)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {result.report.fileInsights.topItems.length > 0 && (
          <div className="mt-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Largest planned budgets</p>
            <div className="overflow-x-auto rounded-md border border-navy-100">
              <table className="w-full min-w-[560px] border-collapse text-left text-sm">
                <thead>
                  <tr className={TABLE_HEAD}>
                    <th className="px-3 py-2 font-semibold">Item</th>
                    <th className="px-3 py-2 font-semibold">Budget</th>
                    <th className="px-3 py-2 font-semibold">Qty</th>
                    <th className="px-3 py-2 font-semibold">Category</th>
                  </tr>
                </thead>
                <tbody>
                  {result.report.fileInsights.topItems.slice(0, 10).map((t, i) => (
                    <tr key={`${t.description}-${i}`} className={TABLE_ROW}>
                      <td className={cn(TABLE_CELL, "max-w-[320px] font-medium text-navy-900")}>
                        <span>{t.description}</span>
                        <RepeatBadge count={duplicateCount.get(t.description) ?? 1} />
                        <Trace
                          trace={`Budget ${peso(t.budget_cents)}${t.qty !== null && t.qty !== undefined ? ` for ${fmtQty(t.qty)}${t.unit ? ` ${t.unit}` : ""}` : ", quantity not stated"}.`}
                          evidence={t.evidence}
                        />
                      </td>
                      <td className={cn(TABLE_CELL, "text-xs font-medium tabular-nums")}>{peso(t.budget_cents)}</td>
                      <td className={cn(TABLE_CELL, "text-xs tabular-nums")}>
                        {t.qty !== null && t.qty !== undefined ? `${fmtQty(t.qty)}${t.unit ? ` ${t.unit}` : ""}` : "—"}
                      </td>
                      <td className={cn(TABLE_CELL, "max-w-[160px] truncate text-xs text-zinc-600")} title={t.category ?? ""}>
                        {t.category ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {result.report.fileInsights.duplicates.length > 0 && (
          <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-3 text-sm text-amber-900">
            <p className="font-semibold">Repeated descriptions — confirm intentional repeats versus duplicates</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs leading-relaxed">
              {result.report.fileInsights.duplicates.slice(0, 5).map((d, i) => (
                <li key={`${d.description}-${i}`}>
                  {d.description} <span className="font-semibold">(×{d.occurrences})</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </SectionCard>

      <SectionCard icon={TrendingUp} kicker="Movement" title="Trends">
          {report.trends.length === 0 ? (
            result.report.fileInsights.deliveryMomentum ? (
              <div className="text-sm">
                <Readout>
                  With a single year of history there are no multi-year trends yet — but deliveries bunch up in{" "}
                  {(() => {
                    const m = result.report.fileInsights.deliveryMomentum as NonNullable<typeof result.report.fileInsights.deliveryMomentum>;
                    const peak = [...m.monthly].sort((a, b) => b.lines - a.lines)[0];
                    return `${peak.month} (${peak.lines} line(s))`;
                  })()}
                  , and the within-year pattern reads{" "}
                  {result.report.fileInsights.deliveryMomentum.direction.replace(/_/g, " ").toLowerCase()}.
                </Readout>
                <ChartContainer config={{ lines: { label: "Deliveries due", color: "#1b2a4a" } }} className="mt-3 max-h-[220px] w-full">
                  <BarChart
                    accessibilityLayer
                    data={result.report.fileInsights.deliveryMomentum.monthly.map((p) => ({ month: p.month.slice(5), lines: p.lines }))}
                  >
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="month" tickLine={false} tickMargin={8} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} width={28} allowDecimals={false} />
                    <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dashed" />} />
                    <Bar dataKey="lines" fill="var(--color-lines)" radius={4} />
                  </BarChart>
                </ChartContainer>
                <Trace trace={result.report.fileInsights.deliveryMomentum.calc_trace} />
              </div>
            ) : (
              <p className="text-sm text-zinc-600">Insufficient data for trend classification — no readable schedule or history.</p>
            )
          ) : (
            <div className="text-sm">
              {(() => {
                const counts: Record<string, number> = {};
                for (const t of report.trends) counts[t.qty_class] = (counts[t.qty_class] ?? 0) + 1;
                const steepest = [...report.yoy]
                  .filter((y) => y.pct_change !== null && y.pct_change !== undefined)
                  .sort((a, b) => Math.abs(b.pct_change as number) - Math.abs(a.pct_change as number))[0];
                const parts = Object.entries(counts).map(([k, n]) => `${n} ${k.replace(/_/g, " ").toLowerCase()}`);
                return (
                  <Readout>
                    Of {report.trends.length} tracked item(s), {parts.join(", ")}.
                    {steepest ? ` The steepest move is '${steepest.description}' (${fmtPct(steepest.pct_change)} from ${steepest.from_year} to ${steepest.to_year}).` : ""}
                  </Readout>
                );
              })()}
              {(() => {
                const years = [...new Set(report.trends.flatMap((t) => t.series.map((p) => p.year)))].sort((a, b) => a - b);
                const top = [...report.trends]
                  .sort((a, b) => {
                    const qa = a.series[a.series.length - 1]?.qty ?? 0;
                    const qb = b.series[b.series.length - 1]?.qty ?? 0;
                    return (qb ?? 0) - (qa ?? 0);
                  })
                  .slice(0, 5);
                const data = years.map((y) => {
                  const row: Record<string, number | string> = { year: String(y) };
                  top.forEach((t, i) => {
                    row[`s${i}`] = t.series.find((p) => p.year === y)?.qty ?? 0;
                  });
                  return row;
                });
                return (
                  <ChartContainer
                    config={Object.fromEntries(top.map((t, i) => [`s${i}`, { label: t.description.slice(0, 24), color: SERIES_COLORS[i % SERIES_COLORS.length] }]))}
                    className="mt-3 max-h-[220px] w-full"
                  >
                    <LineChart accessibilityLayer data={data}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="year" tickLine={false} tickMargin={8} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} width={40} allowDecimals={false} />
                      <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dashed" />} />
                      <ChartLegend content={<ChartLegendContent />} />
                      {top.map((_, i) => (
                        <Line key={i} type="monotone" dataKey={`s${i}`} stroke={SERIES_COLORS[i % SERIES_COLORS.length]} strokeWidth={2} dot={false} />
                      ))}
                    </LineChart>
                  </ChartContainer>
                );
              })()}
              <div className="mt-3 overflow-x-auto rounded-md border border-navy-100">
                <table className="w-full min-w-[420px] border-collapse text-left text-sm">
                  <thead>
                    <tr className={TABLE_HEAD}>
                      <th className="px-3 py-2 font-semibold">Item</th>
                      <th className="px-3 py-2 font-semibold">Yearly quantities</th>
                      <th className="px-3 py-2 font-semibold">Trend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.trends.map((t) => (
                      <tr key={t.item_key} className={TABLE_ROW}>
                        <td className={cn(TABLE_CELL, "max-w-[180px] font-medium text-navy-900")}>{t.description}</td>
                        <td className={cn(TABLE_CELL, "text-xs text-zinc-600")}>
                          {t.series.map((p) => `${p.year}: ${fmtQty(p.qty)}`).join(" · ")}
                          <Trace trace={t.calc_trace} evidence={t.evidence} />
                        </td>
                        <td className={TABLE_CELL}>
                          <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold", TREND_STYLE[t.qty_class] ?? TREND_STYLE.INSUFFICIENT_DATA)}>
                            {t.qty_class.replace(/_/g, " ")}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard
          icon={AlertTriangle}
          kicker="For review"
          title="Potential anomalies"
          description="Rule-based flags for human review — not findings of error, fraud, or impropriety."
          aside={<Chip tone="warn">{report.anomalies.length} flag(s)</Chip>}
        >
          {report.anomalies.length === 0 ? (
            <p className="text-sm text-zinc-600">No unusual changes detected under the current thresholds.</p>
          ) : (
            <div className="text-sm">
              <Readout>
                {report.anomalies.length} flag(s) need a human look
                {(() => {
                  const by: Record<string, number> = {};
                  for (const a of report.anomalies) by[a.method] = (by[a.method] ?? 0) + 1;
                  const parts = Object.entries(by).map(([m, n]) => `${n} ${(ANOMALY_METHOD_LABEL[m] ?? titleCase(m)).toLowerCase()}`);
                  return parts.length > 0 ? `: ${parts.join(", ")}.` : ".";
                })()}
              </Readout>
              <ul className="mt-3 grid gap-2">
                {report.anomalies.map((a, i) => (
                  <li key={`${a.item_key}-${a.method}-${i}`} className="rounded-lg border border-amber-300 bg-amber-50/70 px-3.5 py-3 text-amber-950">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="min-w-0 font-semibold leading-snug">{a.description}</p>
                      <Chip tone="warn">{ANOMALY_METHOD_LABEL[a.method] ?? titleCase(a.method)}</Chip>
                    </div>
                    <p className="mt-1 leading-relaxed">{a.message}</p>
                    <dl className="mt-2 grid gap-x-4 gap-y-1 border-t border-amber-200/70 pt-2 text-[11px] sm:grid-cols-3">
                      <div>
                        <dt className="font-semibold uppercase tracking-wide text-amber-700">Threshold</dt>
                        <dd className="text-amber-900">{a.threshold}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold uppercase tracking-wide text-amber-700">Observed</dt>
                        <dd className="text-amber-900">{a.observed}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold uppercase tracking-wide text-amber-700">Baseline</dt>
                        <dd className="text-amber-900">{a.baseline}</dd>
                      </div>
                    </dl>
                    <div className="[&_summary]:text-amber-900 [&_p]:text-amber-900">
                      <Trace trace={a.calc_trace} evidence={a.evidence} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </SectionCard>

      <SectionCard icon={Wallet} kicker="Spend" title="Cost analysis">
          {report.costs.length === 0 ? (
            result.report.fileInsights.byCategory.some((c) => c.budget_cents !== null) ? (
              <div className="text-sm">
                {(() => {
                  const cats = result.report.fileInsights.byCategory.filter((c) => c.budget_cents !== null && c.budget_cents !== undefined);
                  const top = cats[0];
                  const total = result.report.fileInsights.totalBudgetCents;
                  const share = top && total ? ((top.budget_cents as number) / total) * 100 : 0;
                  return (
                    <Readout>
                      Single-year file — spend concentrates in ‘{top?.name}’ at {peso(top?.budget_cents ?? null)} ({share.toFixed(1)}% of planned spend).
                      Compare more years to see cost movement over time.
                    </Readout>
                  );
                })()}
                <div className="mt-3 overflow-x-auto rounded-md border border-navy-100">
                  <table className="w-full min-w-[420px] border-collapse text-left text-sm">
                    <thead>
                      <tr className={TABLE_HEAD}>
                        <th className="px-3 py-2 font-semibold">Category</th>
                        <th className="px-3 py-2 font-semibold">Lines</th>
                        <th className="px-3 py-2 font-semibold">Budget</th>
                        <th className="px-3 py-2 font-semibold">Share of spend</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const total = result.report.fileInsights.totalBudgetCents;
                        return result.report.fileInsights.byCategory.slice(0, 10).map((c, i) => (
                          <tr key={`${c.name}-${i}`} className={TABLE_ROW}>
                            <td className={cn(TABLE_CELL, "max-w-[240px] truncate font-medium text-navy-900")} title={c.name}>{c.name}</td>
                            <td className={cn(TABLE_CELL, "text-xs tabular-nums")}>{c.lines.toLocaleString("en-PH")}</td>
                            <td className={cn(TABLE_CELL, "text-xs tabular-nums")}>{peso(c.budget_cents)}</td>
                            <td className={cn(TABLE_CELL, "text-xs tabular-nums")}>
                              {c.budget_cents !== null && c.budget_cents !== undefined && total ? `${((c.budget_cents / total) * 100).toFixed(1)}%` : "—"}
                            </td>
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="text-sm text-zinc-600">No readable estimated budgets in this file.</p>
            )
          ) : (
            <div className="text-sm">
              {(() => {
                const first = report.overview.yearly[0];
                const last = report.overview.yearly[report.overview.yearly.length - 1];
                const change =
                  first && last && first.budget_cents !== null && first.budget_cents !== undefined &&
                  last.budget_cents !== null && last.budget_cents !== undefined && first.budget_cents !== 0
                    ? ((last.budget_cents - first.budget_cents) / Math.abs(first.budget_cents)) * 100
                    : null;
                const biggest = [...report.costs]
                  .filter((c) => c.pct_change !== null && c.pct_change !== undefined)
                  .sort((a, b) => Math.abs(b.pct_change as number) - Math.abs(a.pct_change as number))[0];
                return (
                  <Readout>
                    Planned spend {change === null ? "has no comparable yearly totals" : change >= 0 ? `rose ${fmtPct(change)}` : `fell ${fmtPct(change)}`} from {first?.year} to {last?.year}
                    ({peso(first?.budget_cents ?? null)} → {peso(last?.budget_cents ?? null)}).
                    {biggest ? ` Largest item move: ‘${biggest.description}’ (${fmtPct(biggest.pct_change)}, ${biggest.qty_driven === null ? "quantity not stated" : biggest.qty_driven ? "quantity-driven" : "price-driven"}).` : ""}
                  </Readout>
                );
              })()}
              <ChartContainer config={{ budget: { label: "Est. budget (₱)", color: "#1b2a4a" } }} className="mt-3 max-h-[220px] w-full">
                <BarChart
                  accessibilityLayer
                  data={report.overview.yearly.map((y) => ({
                    year: String(y.year),
                    budget: y.budget_cents !== null && y.budget_cents !== undefined ? Math.round(y.budget_cents / 100) : 0,
                  }))}
                >
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="year" tickLine={false} tickMargin={8} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} width={48} allowDecimals={false} />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dashed" />} />
                  <Bar dataKey="budget" fill="var(--color-budget)" radius={4} />
                </BarChart>
              </ChartContainer>
              <div className="mt-3 overflow-x-auto rounded-md border border-navy-100">
                <table className="w-full min-w-[480px] border-collapse text-left text-sm">
                  <thead>
                    <tr className={TABLE_HEAD}>
                      <th className="px-3 py-2 font-semibold">Item</th>
                      <th className="px-3 py-2 font-semibold">Period</th>
                      <th className="px-3 py-2 font-semibold">Budget change</th>
                      <th className="px-3 py-2 font-semibold">Driver</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.costs.map((c, i) => (
                      <tr key={`${c.item_key}-${i}`} className={TABLE_ROW}>
                        <td className={cn(TABLE_CELL, "max-w-[240px] font-medium text-navy-900")}>{c.description}</td>
                        <td className={cn(TABLE_CELL, "text-xs tabular-nums")}>{c.from_year} → {c.to_year} ({peso(c.prev_budget_cents)} → {peso(c.cur_budget_cents)})</td>
                        <td className={cn(TABLE_CELL, "text-xs font-medium tabular-nums")}>{fmtPct(c.pct_change)}</td>
                        <td className={cn(TABLE_CELL, "text-xs text-zinc-600")}>
                          {c.qty_driven === null ? "quantity not stated" : c.qty_driven ? "Quantity-driven" : "Price-driven"}
                          <Trace trace={c.calc_trace} evidence={c.evidence} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard icon={Sparkles} kicker="Projection" title="Forecast">
          {report.forecasts.length === 0 ? (
            result.report.quarterly.cells.some((c) => c.budget_cents !== null && c.budget_cents !== undefined) ? (
              <div className="text-sm">
                <p className="leading-relaxed text-zinc-600">
                  No statistical forecast yet (needs three comparable years) — showing the scheduled pipeline instead.
                  This is planned load from delivery months, not a forecast.
                </p>
                <ul className="mt-3 grid gap-1.5 text-navy-900">
                  {result.report.quarterly.cells
                    .filter((c) => c.budget_cents !== null && c.budget_cents !== undefined)
                    .map((c) => (
                      <li key={`${c.year}-Q${c.quarter}`} className="flex items-center justify-between gap-3 rounded-md border border-navy-100 px-3 py-2">
                        <span className="font-semibold">{c.year} Q{c.quarter}</span>
                        <span className="font-medium tabular-nums">{peso(c.budget_cents)} planned</span>
                      </li>
                    ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-zinc-600">Forecasting needs at least three comparable years per item.</p>
            )
          ) : (
            <div className="text-sm">
              {(() => {
                const low = report.forecasts.filter((f) => f.confidence === "LOW").length;
                const med = report.forecasts.length - low;
                return (
                  <Readout>
                    {report.forecasts.length} item estimate(s) from history alone
                    ({low} low confidence with 3-year histories{med > 0 ? `, ${med} medium` : ""}).
                    Treat these as planning inputs and confirm against consumption and stock.
                  </Readout>
                );
              })()}
              <ul className="mt-3 grid gap-2 lg:grid-cols-2">
                {report.forecasts.map((f) => (
                  <li key={f.item_key} className="rounded-lg border border-navy-200 bg-white px-3.5 py-3 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="min-w-0 font-semibold leading-snug text-navy-900">
                        {f.description}: estimate {fmtQty(f.point)} (range {fmtQty(f.band_low)}–{fmtQty(f.band_high)})
                      </p>
                      <Chip tone={f.confidence === "LOW" ? "warn" : "info"}>{f.confidence} confidence</Chip>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-600">
                      Method: {titleCase(f.method)} · {f.warning}
                    </p>
                    <Trace trace={f.calc_trace} evidence={f.evidence} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </SectionCard>

      <SectionCard
        icon={Lightbulb}
        kicker="Advisory"
        title="Recommendations for review"
        description="Advisory only — PGSO personnel make the final decision."
        aside={<Chip tone="info">{report.recommendations.length} item(s)</Chip>}
      >
        {report.recommendations.length === 0 ? (
          <p className="text-sm text-zinc-600">Nothing exceeds the review thresholds.</p>
        ) : (
          <div>
            <Readout>
              {report.recommendations.length} advisory item(s): review each against consumption records and current stock before finalizing the PPMP.
            </Readout>
            <ul className="mt-3 grid gap-2 lg:grid-cols-2">
              {report.recommendations.map((r, i) => (
                <li key={`${r.rule_id}-${i}`} className="rounded-lg border border-navy-200 bg-white px-3.5 py-3 text-sm text-navy-900">
                  <div className="flex flex-wrap items-start gap-2">
                    <Chip tone={RULE_TONE[r.rule_id] ?? "neutral"}>{RULE_LABEL[r.rule_id] ?? titleCase(r.rule_id)}</Chip>
                    <p className="min-w-0 flex-1 leading-relaxed">{r.message}</p>
                  </div>
                  <Trace trace={r.calc_trace} evidence={r.evidence_refs} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </SectionCard>

      {report.limitations.length > 0 ? (
        <SectionCard icon={Info} kicker="Caveats" title="Limitations">
          <ul className="grid gap-1.5 text-sm leading-relaxed text-zinc-600">
            {report.limitations.map((l, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-zinc-400" aria-hidden="true" />
                <span>{l}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}
    </div>
  );
}
