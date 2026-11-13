"use client";

import Link from "next/link";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
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
import type { MonthlyPoint } from "@/app/personnel/inspections/actions";
import {
  useMonthlyOverview,
  monthlyInsight,
  monthlyRangeLabel,
} from "@/hooks/use-monthly-overview";
import { MonthlyRangeFilter } from "@/components/dashboard/monthly-range-filter";
import { ChartSkeleton } from "@/components/dashboard/chart-skeleton";
import styles from "./page.module.css";

const chartConfig = {
  deliveries: {
    label: "Deliveries (bars)",
    color: "#243b66",
  },
  inspections: {
    label: "Inspections (line)",
    color: "#f5c518",
  },
} satisfies ChartConfig;

/**
 * Deliveries vs inspections as a single bar + line combo card:
 * monthly delivery volume as bars, inspections as a trend line over them.
 * Super-admin links — the personnel dashboard keeps its own chart.
 */
export function DeliveryInspectionChart({ data }: { data: MonthlyPoint[] }) {
  const {
    data: monthly,
    range,
    setRange,
    loading,
  } = useMonthlyOverview(data);
  const hasData = monthly.some(
    (d) => d.deliveries > 0 || d.inspections > 0
  );

  return (
    <Card className={`${styles.panel} p-4`}>
      <div className={styles.panelHead}>
        <div>
          <h2 className={styles.panelTitle}>Deliveries vs inspections</h2>
          <p className={styles.panelSub}>{monthlyRangeLabel(range)}</p>
        </div>
        <MonthlyRangeFilter
          value={range}
          onChange={setRange}
          loading={loading}
        />
      </div>
      {loading ? (
        <ChartSkeleton />
      ) : hasData ? (
        <ChartContainer config={chartConfig} className="max-h-[280px] w-full">
          <ComposedChart accessibilityLayer data={monthly}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="month"
              tickLine={false}
              tickMargin={10}
              axisLine={false}
              interval={range.month ? "preserveStartEnd" : 0}
              tickFormatter={
                range.month
                  ? (value) => String(value).split(" ")[1] ?? String(value)
                  : undefined
              }
            />
            <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent indicator="dashed" />}
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="deliveries" fill="var(--color-deliveries)" radius={4} />
            <Line
              type="monotone"
              dataKey="inspections"
              stroke="var(--color-inspections)"
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 4 }}
            />
          </ComposedChart>
        </ChartContainer>
      ) : (
        <div className={styles.emptyCard}>
          <p className={styles.emptyCardText}>
            No data for the selected range.
          </p>
          <Link href="/super-admin/reports" className={styles.emptyCardButton}>
            View reports
          </Link>
        </div>
      )}
      <p className={styles.chartCaption}>
        <strong>What this means: </strong>
        {monthlyInsight(monthly, range)}
      </p>
      <div className={styles.panelFooter}>
        <Link href="/super-admin/deliveries" className={styles.inspectLink}>
          View deliveries
        </Link>
        <Link href="/super-admin/inspections" className={styles.inspectLink}>
          View inspections
        </Link>
      </div>
    </Card>
  );
}
