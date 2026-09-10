"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  LabelList,
  Pie,
  PieChart,
  PolarGrid,
  PolarRadiusAxis,
  RadialBar,
  RadialBarChart,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { label } from "@/lib/labels";
import type {
  Analytics,
  MonthlyIssuancePoint,
  Slice,
} from "./analytics";

/**
 * System palette only — hero yellow for the largest slice, then descending
 * navy shades. No semantic rainbow: meaning lives in the legend labels,
 * percentages and insight text, never in hue.
 */
const SYSTEM_PALETTE = [
  "#f5c518", // yellow-500 — largest slice
  "#1b2a4a", // navy-900
  "#2d4a7a", // navy-700
  "#4a6080", // navy-600
  "#6b7a95", // navy-500
  "#8a9bb5", // navy-400
  "#b0bdd0", // navy-300
];

function colorFor(_name: string, index: number): string {
  return SYSTEM_PALETTE[index % SYSTEM_PALETTE.length];
}

function totalOf(data: Slice[]): number {
  return data.reduce((n, s) => n + s.value, 0);
}

function cardStyle(): React.CSSProperties {
  return { padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" };
}

function CardHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div>
      <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: 0 }}>{title}</h3>
      <p style={{ fontSize: "0.8125rem", color: "var(--color-navy-500)", margin: "0.25rem 0 0" }}>{sub}</p>
    </div>
  );
}

function EmptyNote() {
  return <p style={{ fontSize: "0.875rem", color: "var(--color-navy-500)" }}>No data yet.</p>;
}

function Insight({ text }: { text: string }) {
  return (
    <p
      style={{
        fontSize: "0.8125rem",
        lineHeight: 1.5,
        color: "var(--color-navy-700)",
        background: "var(--color-navy-50, #f1f5f9)",
        border: "1px solid var(--color-navy-100)",
        borderRadius: "0.5rem",
        padding: "0.625rem 0.75rem",
        margin: 0,
      }}
    >
      <strong>What this means: </strong>
      {text}
    </p>
  );
}

function LegendList({ data }: { data: Slice[] }) {
  const total = totalOf(data);
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.375rem" }}>
      {data.map((s, i) => (
        <li
          key={s.name}
          style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8125rem" }}
        >
          <span
            aria-hidden="true"
            style={{
              width: "0.625rem",
              height: "0.625rem",
              borderRadius: "9999px",
              background: colorFor(s.name, i),
              flexShrink: 0,
            }}
          />
          <span style={{ flex: 1 }}>{label(s.name)}</span>
          <strong>{s.value.toLocaleString()}</strong>
          <span style={{ color: "var(--color-navy-500)", minWidth: "2.5rem", textAlign: "right" }}>
            {total > 0 ? `${Math.round((s.value / total) * 100)}%` : "—"}
          </span>
        </li>
      ))}
    </ul>
  );
}

type CardProps = {
  title: string;
  sub: string;
  data: Slice[];
  insight: string;
};

/** Horizontal bars — best for a handful of named outcomes. */
export function HBarCard({ title, sub, data, insight }: CardProps) {
  const rows = data.map((s, i) => ({ name: label(s.name), value: s.value, fill: colorFor(s.name, i) }));
  const config: ChartConfig = {
    value: { label: "Count", color: "#243b66" },
  };

  return (
    <Card style={cardStyle()}>
      <CardHead title={title} sub={sub} />
      {rows.length === 0 || totalOf(data) === 0 ? (
        <EmptyNote />
      ) : (
        <ChartContainer config={config} className="max-h-[220px] w-full">
          <BarChart accessibilityLayer data={rows} layout="vertical" margin={{ left: 8, right: 36 }}>
            <CartesianGrid horizontal={false} />
            <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
            <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} width={110} />
            <ChartTooltip content={<ChartTooltipContent hideLabel />} />
            <Bar dataKey="value" radius={4}>
              {rows.map((r) => (
                <Cell key={r.name} fill={r.fill} />
              ))}
              <LabelList dataKey="value" position="right" style={{ fontSize: 12, fontWeight: 700 }} />
            </Bar>
          </BarChart>
        </ChartContainer>
      )}
      <LegendList data={data} />
      <Insight text={insight} />
    </Card>
  );
}

/** Vertical columns — best for comparing a few buckets side by side. */
export function ColumnCard({ title, sub, data, insight }: CardProps) {
  const rows = data.map((s, i) => ({ name: label(s.name), value: s.value, fill: colorFor(s.name, i) }));
  const config: ChartConfig = {
    value: { label: "Count", color: "#243b66" },
  };

  return (
    <Card style={cardStyle()}>
      <CardHead title={title} sub={sub} />
      {rows.length === 0 || totalOf(data) === 0 ? (
        <EmptyNote />
      ) : (
        <ChartContainer config={config} className="max-h-[220px] w-full">
          <BarChart accessibilityLayer data={rows} margin={{ top: 20 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="name" tickLine={false} axisLine={false} interval={0} style={{ fontSize: 11 }} />
            <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
            <ChartTooltip content={<ChartTooltipContent hideLabel />} />
            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
              {rows.map((r) => (
                <Cell key={r.name} fill={r.fill} />
              ))}
              <LabelList dataKey="value" position="top" style={{ fontSize: 12, fontWeight: 700 }} />
            </Bar>
          </BarChart>
        </ChartContainer>
      )}
      <LegendList data={data} />
      <Insight text={insight} />
    </Card>
  );
}

/** The single donut — kept for the request mix, the key decision queue. */
export function DonutCard({ title, sub, data, insight }: CardProps) {
  const total = totalOf(data);
  const config: ChartConfig = Object.fromEntries(
    data.map((s, i) => [s.name, { label: label(s.name), color: colorFor(s.name, i) }])
  );

  return (
    <Card style={cardStyle()}>
      <CardHead title={title} sub={sub} />
      {total === 0 ? (
        <EmptyNote />
      ) : (
        <ChartContainer config={config} className="max-h-[220px] w-full">
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent hideLabel />} />
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="85%" paddingAngle={3} strokeWidth={0}>
              {data.map((s, i) => (
                <Cell key={s.name} fill={colorFor(s.name, i)} />
              ))}
            </Pie>
            <ChartLegend content={<ChartLegendContent nameKey="name" />} />
          </PieChart>
        </ChartContainer>
      )}
      <LegendList data={data} />
      <Insight text={insight} />
    </Card>
  );
}

/** 100% stacked bar — fleet composition in a single glanceable strip. */
export function StackedBarCard({ title, sub, data, insight }: CardProps) {
  const total = totalOf(data);
  const datum = Object.fromEntries(data.map((s, i) => [`k${i}`, total > 0 ? (s.value / total) * 100 : 0]));
  const config: ChartConfig = Object.fromEntries(
    data.map((s, i) => [`k${i}`, { label: label(s.name), color: colorFor(s.name, i) }])
  );

  return (
    <Card style={cardStyle()}>
      <CardHead title={title} sub={sub} />
      {total === 0 ? (
        <EmptyNote />
      ) : (
        <ChartContainer config={config} className="max-h-[92px] w-full">
          <BarChart accessibilityLayer data={[datum]} layout="vertical" margin={{ left: 0, right: 0 }}>
            <XAxis type="number" domain={[0, 100]} hide />
            <YAxis type="category" dataKey={() => ""} hide />
            {data.map((s, i) => (
              <Bar key={s.name} dataKey={`k${i}`} stackId="mix" fill={colorFor(s.name, i)} radius={i === 0 ? [6, 0, 0, 6] : i === data.length - 1 ? [0, 6, 6, 0] : 0} />
            ))}
          </BarChart>
        </ChartContainer>
      )}
      <LegendList data={data} />
      <Insight text={insight} />
    </Card>
  );
}

/** Concentric-ring radial — PAR vs ICS share wrapped in a circle. */
export function RingsCard({ title, sub, data, insight }: CardProps) {
  const total = totalOf(data);
  const datum = Object.fromEntries(data.map((s, i) => [`k${i}`, total > 0 ? (s.value / total) * 100 : 0]));
  const config: ChartConfig = Object.fromEntries(
    data.map((s, i) => [`k${i}`, { label: label(s.name), color: colorFor(s.name, i) }])
  );

  return (
    <Card style={cardStyle()}>
      <CardHead title={title} sub={sub} />
      {total === 0 ? (
        <EmptyNote />
      ) : (
        <ChartContainer config={config} className="mx-auto aspect-square max-h-[250px] w-full max-w-[280px]">
          <RadialBarChart data={[datum]} startAngle={90} endAngle={-270} innerRadius={36} outerRadius={104}>
            <PolarGrid gridType="circle" radialLines={false} stroke="none" />
            {data.map((s, i) => (
              <RadialBar key={s.name} dataKey={`k${i}`} stackId="mix" fill={colorFor(s.name, i)} cornerRadius={6} />
            ))}
            <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
              <Label
                content={({ viewBox }) => {
                  if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                    return (
                      <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                        <tspan x={viewBox.cx} y={viewBox.cy} style={{ fontSize: "1.5rem", fontWeight: 800, fill: "var(--color-navy-900)" }}>
                          {total.toLocaleString()}
                        </tspan>
                        <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 20} style={{ fontSize: "0.75rem", fill: "var(--color-navy-500)" }}>
                          documents
                        </tspan>
                      </text>
                    );
                  }
                }}
              />
            </PolarRadiusAxis>
          </RadialBarChart>
        </ChartContainer>
      )}
      <LegendList data={data} />
      <Insight text={insight} />
    </Card>
  );
}

export function IssuanceTrendCard({
  data,
  insight,
}: {
  data: MonthlyIssuancePoint[];
  insight: string;
}) {
  const config = {
    issuances: { label: "Issuances", color: "#243b66" },
  } satisfies ChartConfig;
  const hasData = data.some((d) => d.issuances > 0);

  return (
    <Card style={cardStyle()}>
      <CardHead title="Issuance trend" sub="PAR / ICS documents issued per month — last 6 months" />
      {hasData ? (
        <ChartContainer config={config} className="max-h-[220px] w-full">
          <AreaChart accessibilityLayer data={data}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="month" tickLine={false} tickMargin={10} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
            <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
            <Area dataKey="issuances" type="monotone" fill="var(--color-issuances)" fillOpacity={0.35} stroke="var(--color-issuances)" strokeWidth={2} />
          </AreaChart>
        </ChartContainer>
      ) : (
        <EmptyNote />
      )}
      <Insight text={insight} />
    </Card>
  );
}

export function StockGaugeCard({
  pct,
  breakdown,
  insight,
}: {
  pct: number;
  breakdown: Slice[];
  insight: string;
}) {
  const total = totalOf(breakdown);
  const config = {
    healthy: { label: "Healthy share", color: "#1b2a4a" },
  } satisfies ChartConfig;

  return (
    <Card style={cardStyle()}>
      <CardHead title="Stock health gauge" sub="Share of stock lines above reorder threshold" />
      {total === 0 ? (
        <EmptyNote />
      ) : (
        <ChartContainer config={config} className="mx-auto aspect-square max-h-[250px] w-full max-w-[280px]">
          <RadialBarChart
            data={[{ name: "healthy", value: pct, fill: "var(--color-healthy)" }]}
            startAngle={90}
            endAngle={-270}
            innerRadius={80}
            outerRadius={110}
          >
            <PolarGrid gridType="circle" radialLines={false} stroke="none" />
            <RadialBar dataKey="value" background cornerRadius={10} />
            <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
              <Label
                content={({ viewBox }) => {
                  if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                    return (
                      <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                        <tspan x={viewBox.cx} y={viewBox.cy} style={{ fontSize: "1.75rem", fontWeight: 800, fill: "var(--color-navy-900)" }}>
                          {pct}%
                        </tspan>
                        <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 22} style={{ fontSize: "0.75rem", fill: "var(--color-navy-500)" }}>
                          healthy
                        </tspan>
                      </text>
                    );
                  }
                }}
              />
            </PolarRadiusAxis>
          </RadialBarChart>
        </ChartContainer>
      )}
      <LegendList data={breakdown} />
      <Insight text={insight} />
    </Card>
  );
}

export function AnalyticsGrid({ data, gridClass }: { data: Analytics; gridClass: string }) {
  return (
    <div>
      <h2 style={{ fontSize: "1.125rem", fontWeight: 700, margin: "1.5rem 0 0.25rem" }}>
        Analytics
      </h2>
      <p style={{ fontSize: "0.8125rem", color: "var(--color-navy-500)", margin: "0 0 1rem" }}>
        Live breakdowns across every transaction type — each with what it means for operations.
      </p>
      <div className={gridClass}>
        <HBarCard
          title="Inspection outcomes"
          sub="Deliveries by inspection result — all time"
          data={data.inspectionOutcome}
          insight={data.insights.inspection}
        />
        <DonutCard
          title="Requests by status"
          sub="Employee requests — all time"
          data={data.requestStatus}
          insight={data.insights.requests}
        />
        <ColumnCard
          title="Repairs by status"
          sub="Repair tickets — all time"
          data={data.repairStatus}
          insight={data.insights.repairs}
        />
        <StackedBarCard
          title="Assets by status"
          sub="Registered fleet composition — all time"
          data={data.assetStatus}
          insight={data.insights.assets}
        />
        <StockGaugeCard pct={data.stockHealthyPct} breakdown={data.stockHealth} insight={data.insights.stock} />
        <RingsCard
          title="Issuances by type"
          sub="PAR vs ICS accountability documents"
          data={data.issuanceByType}
          insight={data.insights.issuance}
        />
        <IssuanceTrendCard data={data.monthlyIssuances} insight={data.insights.trend} />
        <ColumnCard
          title="Documents by type"
          sub="Generated RIS, PAR, ICS, AIR and others"
          data={data.documentsByType}
          insight={data.insights.documents}
        />
      </div>
    </div>
  );
}
