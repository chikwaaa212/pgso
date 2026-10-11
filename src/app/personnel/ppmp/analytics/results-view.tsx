"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";import { Card } from "@/components/ui/card";
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
import type { ReactNode } from "react";

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

/** Plain-language lead paragraph under each card heading. */
function Interpretation({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-sm leading-relaxed text-navy-900">{children}</p>;
}

const SERIES_COLORS = ["#1b2a4a", "#b8912a", "#2d4a7a", "#8a9bb5", "#4a6080"];

function EvidenceTable({ rows }: { rows: EvidenceRef[] }) {
  if (rows.length === 0) return <p className="text-xs text-zinc-500">No source rows.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-xs">
        <thead>
          <tr className="text-zinc-500">
            <th className="px-2 py-1 font-medium">Source file</th>
            <th className="px-2 py-1 font-medium">Sheet</th>
            <th className="px-2 py-1 font-medium">Row</th>
            <th className="px-2 py-1 font-medium">Item</th>
            <th className="px-2 py-1 font-medium">Qty</th>
            <th className="px-2 py-1 font-medium">Budget</th>
            <th className="px-2 py-1 font-medium">Year</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e, i) => (
            <tr key={i} className="border-t border-navy-100 text-navy-900">
              <td className="max-w-[200px] truncate px-2 py-1.5" title={e.file}>{e.file}</td>
              <td className="max-w-[160px] truncate px-2 py-1.5" title={e.sheet}>{e.sheet}</td>
              <td className="px-2 py-1.5">{e.row}</td>
              <td className="max-w-[220px] truncate px-2 py-1.5" title={e.item}>{e.item}</td>
              <td className="px-2 py-1.5">{e.qty !== null && e.qty !== undefined ? `${fmtQty(e.qty)}${e.unit ? ` ${e.unit}` : ""}` : "—"}</td>
              <td className="px-2 py-1.5">{peso(e.budget_cents)}</td>
              <td className="px-2 py-1.5">{e.fiscal_year ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Trace({ trace, evidence }: { trace: string; evidence?: EvidenceRef[] }) {
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer font-medium text-navy-700 underline underline-offset-2">
        How was this calculated?{evidence && evidence.length > 0 ? " (show work + evidence)" : " (show work)"}
      </summary>
      <p className="mt-1 rounded bg-navy-50 px-2 py-1.5 font-mono text-[11px] text-navy-900">{trace}</p>
      {evidence && evidence.length > 0 ? (
        <div className="mt-2">
          <p className="mb-1 font-semibold text-zinc-600">Source evidence</p>
          <EvidenceTable rows={evidence} />
        </div>
      ) : null}
    </details>
  );
}

const TREND_STYLE: Record<string, string> = {
  INCREASING: "border-navy-600 bg-navy-900 text-white",
  DECREASING: "border-zinc-400 bg-zinc-200 text-zinc-800",
  STABLE: "border-green-300 bg-green-50 text-green-900",
  VOLATILE: "border-amber-300 bg-amber-50 text-amber-900",
  INSUFFICIENT_DATA: "border-zinc-300 bg-zinc-100 text-zinc-600",
};

const yearlyChartConfig = {
  budget: { label: "Est. budget (₱)", color: "#243b66" },
  items: { label: "Line items", color: "#f5c518" },
} satisfies ChartConfig;

export function ResultsView({ result }: { result: SessionResult }) {
  const { report, files } = result;
  const chartData = report.overview.yearly.map((y) => ({
    year: String(y.year),
    budget: y.budget_cents !== null && y.budget_cents !== undefined ? Math.round(y.budget_cents / 100) : 0,
    items: y.items,
  }));
  return (
    <div className="grid gap-4">
      <Card className="p-6">
        <h2 className="text-lg font-semibold">Overview</h2>
        <p className="mt-1 text-sm text-zinc-600">
          {files.map((f) => f.filename).join(" · ")}
          {result.configVersion !== null && result.configVersion !== undefined
            ? ` · rules v${result.configVersion}`
            : ""}
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          {[
            ["Files", String(report.overview.files)],
            ["Fiscal years", report.overview.years.join(", ") || "—"],
            ["Line items", report.overview.line_items.toLocaleString("en-PH")],
            ["Total est. budget", peso(report.overview.total_budget_cents)],
            ["Offices", String(report.overview.offices)],
            ["Categories", String(report.overview.categories)],
            ["Budget-only lines", String(report.overview.budget_only_lines)],
            ["Low-confidence lines", String(report.overview.low_confidence_lines)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-md border border-navy-200 px-3 py-2">
              <dt className="text-xs text-zinc-500">{label}</dt>
              <dd className="truncate font-semibold text-navy-900" title={value}>{value}</dd>
            </div>
          ))}
        </dl>
        {chartData.length > 0 ? (
          <ChartContainer config={yearlyChartConfig} className="mt-4 max-h-[280px] w-full">
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
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold">Quarterly schedule</h2>
        <p className="mt-1 text-sm text-zinc-600">{result.report.quarterly.rule}</p>
        {result.report.quarterly.cells.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-600">
            No line has a readable start or delivery month, so no quarterly calendar could be built.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
                <thead>
                  <tr className="text-xs text-zinc-500">
                    <th className="px-2 py-1 font-medium">Quarter</th>
                    <th className="px-2 py-1 font-medium">Procurement starts</th>
                    <th className="px-2 py-1 font-medium">Budget loading</th>
                  </tr>
                </thead>
                <tbody>
                  {result.report.quarterly.cells.map((c) => (
                    <tr key={`${c.year}-Q${c.quarter}`} className="border-t border-navy-100">
                      <td className="px-2 py-2 font-medium text-navy-900">{c.year} Q{c.quarter}</td>
                      <td className="px-2 py-2">{c.starts.toLocaleString("en-PH")} line(s)</td>
                      <td className="px-2 py-2">{peso(c.budget_cents)}</td>
                    </tr>
                  ))}
                </tbody>
            </table>
          </div>
        )}
        {(result.report.quarterly.unscheduledStarts > 0 ||
          result.report.quarterly.unscheduledDeliveries > 0) && (
          <p className="mt-2 text-xs text-zinc-500">
            Unscheduled: {result.report.quarterly.unscheduledStarts} line(s) without a readable start month,{" "}
            {result.report.quarterly.unscheduledDeliveries} without a readable delivery month
            {result.report.quarterly.unscheduledBudgetCents !== null && result.report.quarterly.unscheduledBudgetCents !== undefined
              ? ` (${peso(result.report.quarterly.unscheduledBudgetCents)} excluded from quarterly loading)`
              : ""}
            . These lines are counted here, never guessed into a quarter.
          </p>
        )}
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold">File insights</h2>
        <p className="mt-1 text-sm text-zinc-600">
          What this file contains — no history needed. Figures below are computed directly from the parsed lines.
        </p>
        {result.report.fileInsights.narrative.length > 0 && (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-navy-900">
            {result.report.fileInsights.narrative.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        )}
        {result.report.fileInsights.byCategory.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold text-zinc-600">Spend by category</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {(() => {
                const total = result.report.fileInsights.totalBudgetCents;
                const max = Math.max(
                  0,
                  ...result.report.fileInsights.byCategory
                    .slice(0, 8)
                    .map((c) => c.budget_cents ?? 0)
                );
                return result.report.fileInsights.byCategory.slice(0, 8).map((c) => {
                  const share = c.budget_cents !== null && c.budget_cents !== undefined && total ? (c.budget_cents / total) * 100 : 0;
                  const bar = max > 0 && c.budget_cents ? Math.max(4, Math.round((c.budget_cents / max) * 100)) : 0;
                  return (
                    <div key={c.name} className="rounded-md border border-navy-200 bg-white px-3 py-2.5">
                      <p className="truncate text-sm font-semibold text-navy-900" title={c.name}>{c.name}</p>
                      <p className="mt-0.5 text-xs text-zinc-600">
                        {c.lines.toLocaleString("en-PH")} line(s) · {peso(c.budget_cents)} · {share.toFixed(1)}% of spend
                      </p>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-navy-100" role="img" aria-label={`${c.name} ${share.toFixed(1)} percent of spend`}>
                        <div className="h-full rounded-full bg-navy-900" style={{ width: `${bar}%` }} />
                      </div>
                      {c.top.length > 0 && (
                        <ul className="mt-2 space-y-0.5 text-xs text-zinc-600">
                          {c.top.map((t) => (
                            <li key={t.description} className="flex items-baseline justify-between gap-2">
                              <span className="min-w-0 truncate" title={t.description}>{t.description}</span>
                              <span className="shrink-0 font-medium text-navy-900">{peso(t.budget_cents)}</span>
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
          <div className="mt-4 overflow-x-auto">
            <p className="mb-1 text-xs font-semibold text-zinc-600">Largest planned budgets</p>
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="text-xs text-zinc-500">
                  <th className="px-2 py-1 font-medium">Item</th>
                  <th className="px-2 py-1 font-medium">Budget</th>
                  <th className="px-2 py-1 font-medium">Qty</th>
                  <th className="px-2 py-1 font-medium">Category</th>
                </tr>
              </thead>
              <tbody>
                {result.report.fileInsights.topItems.slice(0, 10).map((t, i) => (
                  <tr key={i} className="border-t border-navy-100 align-top">
                    <td className="max-w-[260px] px-2 py-2 font-medium text-navy-900">
                      {t.description}
                      <Trace trace={`Budget ${peso(t.budget_cents)}${t.qty !== null && t.qty !== undefined ? ` for ${fmtQty(t.qty)}${t.unit ? ` ${t.unit}` : ""}` : ", quantity not stated"}.`} evidence={t.evidence} />
                    </td>
                    <td className="px-2 py-2 text-xs">{peso(t.budget_cents)}</td>
                    <td className="px-2 py-2 text-xs">{t.qty !== null && t.qty !== undefined ? `${fmtQty(t.qty)}${t.unit ? ` ${t.unit}` : ""}` : "—"}</td>
                    <td className="max-w-[160px] truncate px-2 py-2 text-xs text-zinc-600" title={t.category ?? ""}>{t.category ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {result.report.fileInsights.duplicates.length > 0 && (
          <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <p className="font-semibold">Repeated descriptions — confirm intentional repeats versus duplicates</p>
            <ul className="mt-1 list-disc pl-5 text-xs">
              {result.report.fileInsights.duplicates.slice(0, 5).map((d) => (
                <li key={d.description}>{d.description} (×{d.occurrences})</li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-6">
        <h2 className="text-lg font-semibold">Trends</h2>
        {report.trends.length === 0 ? (
          result.report.fileInsights.deliveryMomentum ? (
            <div className="mt-2 text-sm">
              <Interpretation>
                With a single year of history there are no multi-year trends yet — but deliveries bunch up in{" "}
                {(() => {
                  const m = result.report.fileInsights.deliveryMomentum as NonNullable<typeof result.report.fileInsights.deliveryMomentum>;
                  const peak = [...m.monthly].sort((a, b) => b.lines - a.lines)[0];
                  return `${peak.month} (${peak.lines} line(s))`;
                })()}
                , and the within-year pattern reads{" "}
                {result.report.fileInsights.deliveryMomentum.direction.replace(/_/g, " ").toLowerCase()}.
              </Interpretation>
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
            <p className="mt-1 text-sm text-zinc-600">Insufficient data for trend classification — no readable schedule or history.</p>
          )
        ) : (
          <div className="mt-2 text-sm">
            {(() => {
              const counts: Record<string, number> = {};
              for (const t of report.trends) counts[t.qty_class] = (counts[t.qty_class] ?? 0) + 1;
              const steepest = [...report.yoy]
                .filter((y) => y.pct_change !== null && y.pct_change !== undefined)
                .sort((a, b) => Math.abs(b.pct_change as number) - Math.abs(a.pct_change as number))[0];
              const parts = Object.entries(counts).map(([k, n]) => `${n} ${k.replace(/_/g, " ").toLowerCase()}`);
              return (
                <Interpretation>
                  Of {report.trends.length} tracked item(s), {parts.join(", ")}.
                  {steepest ? ` The steepest move is '${steepest.description}' (${fmtPct(steepest.pct_change)} from ${steepest.from_year} to ${steepest.to_year}).` : ""}
                </Interpretation>
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
            <div className="mt-3 max-h-[300px] overflow-y-auto">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead>
                <tr className="text-xs text-zinc-500">
                  <th className="px-2 py-1 font-medium">Item</th>
                  <th className="px-2 py-1 font-medium">Yearly quantities</th>
                  <th className="px-2 py-1 font-medium">Trend</th>
                </tr>
              </thead>
              <tbody>
                {report.trends.map((t) => (
                  <tr key={t.item_key} className="border-t border-navy-100 align-top">
                    <td className="max-w-[180px] px-2 py-2 font-medium text-navy-900">{t.description}</td>
                    <td className="px-2 py-2 text-xs text-zinc-600">
                      {t.series.map((p) => `${p.year}: ${fmtQty(p.qty)}`).join(" · ")}
                      <Trace trace={t.calc_trace} evidence={t.evidence} />
                    </td>
                    <td className="px-2 py-2">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TREND_STYLE[t.qty_class] ?? TREND_STYLE.INSUFFICIENT_DATA}`}>
                        {t.qty_class.replace(/_/g, " ")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            </div>
          </div>
        )}
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold">Potential anomalies</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Rule-based flags for human review — not findings of error, fraud, or impropriety.
        </p>
        {report.anomalies.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-600">No unusual changes detected under the current thresholds.</p>
        ) : (
          <div className="mt-2 text-sm">
            <Interpretation>
              {report.anomalies.length} flag(s) need a human look
              {(() => {
                const by: Record<string, number> = {};
                for (const a of report.anomalies) by[a.method] = (by[a.method] ?? 0) + 1;
                const parts = Object.entries(by).map(([m, n]) => `${n} ${m.replace(/_/g, " ")}`);
                return parts.length > 0 ? `: ${parts.join(", ")}.` : ".";
              })()}
            </Interpretation>
          <ul className="mt-3 grid max-h-[420px] gap-2 overflow-y-auto">
            {report.anomalies.map((a, i) => (
              <li key={i} className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <p className="font-semibold">{a.description}</p>
                <p>{a.message}</p>
                <p className="mt-0.5 text-xs">Method: {a.method} · Threshold: {a.threshold} · Observed: {a.observed} · Baseline: {a.baseline}</p>
                <div className="[&_summary]:text-amber-900 [&_p]:text-amber-900">
                  <Trace trace={a.calc_trace} evidence={a.evidence} />
                </div>
              </li>
            ))}
          </ul>
          </div>
        )}
      </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-6">
        <h2 className="text-lg font-semibold">Cost analysis</h2>
        {report.costs.length === 0 ? (
          result.report.fileInsights.byCategory.some((c) => c.budget_cents !== null) ? (
            <div className="mt-2 text-sm">
              {(() => {
                const cats = result.report.fileInsights.byCategory.filter((c) => c.budget_cents !== null && c.budget_cents !== undefined);
                const top = cats[0];
                const total = result.report.fileInsights.totalBudgetCents;
                const share = top && total ? ((top.budget_cents as number) / total) * 100 : 0;
                return (
                  <Interpretation>
                    Single-year file — spend concentrates in ‘{top?.name}’ at {peso(top?.budget_cents ?? null)} ({share.toFixed(1)}% of planned spend).
                    Compare more years to see cost movement over time.
                  </Interpretation>
                );
              })()}
              <div className="mt-3 max-h-[300px] overflow-y-auto">
              <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-left text-sm">
                <thead>
                  <tr className="text-xs text-zinc-500">
                    <th className="px-2 py-1 font-medium">Category</th>
                    <th className="px-2 py-1 font-medium">Lines</th>
                    <th className="px-2 py-1 font-medium">Budget</th>
                    <th className="px-2 py-1 font-medium">Share of spend</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const total = result.report.fileInsights.totalBudgetCents;
                    return result.report.fileInsights.byCategory.slice(0, 10).map((c) => (
                      <tr key={c.name} className="border-t border-navy-100">
                        <td className="max-w-[240px] truncate px-2 py-2 font-medium text-navy-900" title={c.name}>{c.name}</td>
                        <td className="px-2 py-2 text-xs">{c.lines.toLocaleString("en-PH")}</td>
                        <td className="px-2 py-2 text-xs">{peso(c.budget_cents)}</td>
                        <td className="px-2 py-2 text-xs">
                          {c.budget_cents !== null && c.budget_cents !== undefined && total ? `${((c.budget_cents / total) * 100).toFixed(1)}%` : "—"}
                        </td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
              </div>
              </div>
            </div>
          ) : (
            <p className="mt-1 text-sm text-zinc-600">No readable estimated budgets in this file.</p>
          )
        ) : (
          <div className="mt-2 text-sm">
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
                <Interpretation>
                  Planned spend {change === null ? "has no comparable yearly totals" : change >= 0 ? `rose ${fmtPct(change)}` : `fell ${fmtPct(change)}`} from {first?.year} to {last?.year}
                  ({peso(first?.budget_cents ?? null)} → {peso(last?.budget_cents ?? null)}).
                  {biggest ? ` Largest item move: ‘${biggest.description}’ (${fmtPct(biggest.pct_change)}, ${biggest.qty_driven === null ? "quantity not stated" : biggest.qty_driven ? "quantity-driven" : "price-driven"}).` : ""}
                </Interpretation>
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
          <div className="mt-3 max-h-[300px] overflow-y-auto">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead>
                <tr className="text-xs text-zinc-500">
                  <th className="px-2 py-1 font-medium">Item</th>
                  <th className="px-2 py-1 font-medium">Period</th>
                  <th className="px-2 py-1 font-medium">Budget change</th>
                  <th className="px-2 py-1 font-medium">Driver</th>
                </tr>
              </thead>
              <tbody>
                {report.costs.map((c, i) => (
                  <tr key={i} className="border-t border-navy-100 align-top">
                    <td className="max-w-[240px] px-2 py-2 font-medium text-navy-900">{c.description}</td>
                    <td className="px-2 py-2 text-xs">{c.from_year} → {c.to_year} ({peso(c.prev_budget_cents)} → {peso(c.cur_budget_cents)})</td>
                    <td className="px-2 py-2 text-xs">{fmtPct(c.pct_change)}</td>
                    <td className="px-2 py-2 text-xs text-zinc-600">
                      {c.qty_driven === null ? "quantity not stated" : c.qty_driven ? "quantity-driven" : "price-driven"}
                      <Trace trace={c.calc_trace} evidence={c.evidence} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
          </div>
        )}
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold">Forecast</h2>
        {report.forecasts.length === 0 ? (
          result.report.quarterly.cells.some((c) => c.budget_cents !== null && c.budget_cents !== undefined) ? (
            <div className="mt-2 text-sm">
              <p className="text-zinc-600">
                No statistical forecast yet (needs three comparable years) — showing the scheduled pipeline instead.
                This is planned load from delivery months, not a forecast.
              </p>
              <ul className="mt-2 space-y-1 text-navy-900">
                {result.report.quarterly.cells
                  .filter((c) => c.budget_cents !== null && c.budget_cents !== undefined)
                  .map((c) => (
                    <li key={`${c.year}-Q${c.quarter}`}>
                      <span className="font-semibold">{c.year} Q{c.quarter}:</span> {peso(c.budget_cents)} planned
                    </li>
                  ))}
              </ul>
            </div>
          ) : (
            <p className="mt-1 text-sm text-zinc-600">Forecasting needs at least three comparable years per item.</p>
          )
        ) : (
          <div className="mt-2 text-sm">
            {(() => {
              const low = report.forecasts.filter((f) => f.confidence === "LOW").length;
              const med = report.forecasts.length - low;
              return (
                <Interpretation>
                  {report.forecasts.length} item estimate(s) from history alone
                  ({low} low confidence with 3-year histories{med > 0 ? `, ${med} medium` : ""}).
                  Treat these as planning inputs and confirm against consumption and stock.
                </Interpretation>
              );
            })()}
          <ul className="mt-3 grid max-h-[420px] gap-2 overflow-y-auto">
            {report.forecasts.map((f) => (
              <li key={f.item_key} className="rounded-md border border-navy-200 px-3 py-2 text-sm">
                <p className="font-semibold text-navy-900">
                  {f.description}: estimate {fmtQty(f.point)} (range {fmtQty(f.band_low)}–{fmtQty(f.band_high)})
                </p>
                <p className="text-xs text-zinc-600">Method: {f.method} · Confidence: {f.confidence}. {f.warning}</p>
                <Trace trace={f.calc_trace} evidence={f.evidence} />
              </li>
            ))}
          </ul>
          </div>
        )}
      </Card>
      </div>

      <Card className="p-6">
        <h2 className="text-lg font-semibold">Recommendations for review</h2>
        <p className="mt-1 text-sm text-zinc-600">Advisory only — PGSO personnel make the final decision.</p>
        {report.recommendations.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-600">Nothing exceeds the review thresholds.</p>
        ) : (
          <div className="mt-2">
          <Interpretation>
            {report.recommendations.length} advisory item(s): review each against consumption records and current stock before finalizing the PPMP.
          </Interpretation>
          <ul className="mt-3 grid max-h-[480px] gap-2 overflow-y-auto">
            {report.recommendations.map((r, i) => (
              <li key={i} className="rounded-md border border-navy-200 bg-white px-3 py-2 text-sm text-navy-900">
                <p><span className="mr-2 inline-flex rounded-full bg-navy-900 px-2 py-0.5 text-[11px] font-semibold text-white">{r.rule_id}</span>{r.message}</p>
                <Trace trace={r.calc_trace} evidence={r.evidence_refs} />
              </li>
            ))}
          </ul>
          </div>
        )}
      </Card>

      {report.limitations.length > 0 ? (
        <Card className="p-6">
          <h2 className="text-lg font-semibold">Limitations</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-600">
            {report.limitations.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
