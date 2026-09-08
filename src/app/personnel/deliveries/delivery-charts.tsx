"use client";

import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import styles from "../dashboard/page.module.css";

export interface MonthlyDeliveries {
  month: string;
  deliveries: number;
}

export interface StatusMixSlice {
  status: "complete" | "partial";
  value: number;
}

const monthlyConfig = {
  deliveries: {
    label: "Deliveries",
    color: "#243b66",
  },
} satisfies ChartConfig;

const mixConfig = {
  complete: {
    label: "Complete",
    color: "#243b66",
  },
  partial: {
    label: "Partial",
    color: "#f5c518",
  },
} satisfies ChartConfig;

export function DeliveryCharts({
  monthly,
  mix,
}: {
  monthly: MonthlyDeliveries[];
  mix: StatusMixSlice[];
}) {
  const mixData = mix.map((s) => ({
    ...s,
    fill:
      s.status === "complete"
        ? "var(--color-complete)"
        : "var(--color-partial)",
  }));
  const hasMonthly = monthly.some((m) => m.deliveries > 0);
  const hasMix = mix.some((s) => s.value > 0);

  return (
    <div className={styles.twoCol}>
      <Card className={styles.panel}>
        <div>
          <h2 className={styles.panelTitle}>Deliveries per month</h2>
          <p className={styles.panelSub}>Last 6 months, live from records</p>
        </div>
        {hasMonthly ? (
          <ChartContainer config={monthlyConfig} className="h-[260px] w-full">
            <BarChart accessibilityLayer data={monthly}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="month"
                tickLine={false}
                tickMargin={10}
                axisLine={false}
              />
              <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent indicator="dashed" />}
              />
              <Bar
                dataKey="deliveries"
                fill="var(--color-deliveries)"
                radius={4}
              />
            </BarChart>
          </ChartContainer>
        ) : (
          <div className={styles.emptyState}>
            <p className={styles.panelSub}>No deliveries in the last 6 months.</p>
          </div>
        )}
      </Card>

      <Card className={styles.panel}>
        <div>
          <h2 className={styles.panelTitle}>Status mix</h2>
          <p className={styles.panelSub}>Complete vs partial, live from records</p>
        </div>
        {hasMix ? (
          <ChartContainer config={mixConfig} className="h-[260px] w-full">
            <PieChart>
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent hideLabel nameKey="status" />}
              />
              <Pie
                data={mixData}
                dataKey="value"
                nameKey="status"
                innerRadius={60}
                strokeWidth={5}
              >
                {mixData.map((entry) => (
                  <Cell key={entry.status} fill={entry.fill} />
                ))}
              </Pie>
              <ChartLegend content={<ChartLegendContent nameKey="status" />} />
            </PieChart>
          </ChartContainer>
        ) : (
          <div className={styles.emptyState}>
            <p className={styles.panelSub}>No deliveries recorded yet.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
