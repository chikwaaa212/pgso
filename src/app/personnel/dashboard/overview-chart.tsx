"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { mockChartBars } from "@/components/personnel/mock";
import styles from "./page.module.css";

const chartConfig = {
  deliveries: {
    label: "Deliveries",
    color: "#243b66",
  },
  inspections: {
    label: "Inspections",
    color: "#f5c518",
  },
} satisfies ChartConfig;

export function OverviewChart() {
  return (
    <Card className={styles.panel}>
      <div className={styles.panelHead}>
        <div>
          <h2 className={styles.panelTitle}>Deliveries vs inspections</h2>
          <p className={styles.panelSub}>Last 6 months (mock data)</p>
        </div>
      </div>
      <ChartContainer config={chartConfig} className="max-h-[280px] w-full">
        <BarChart accessibilityLayer data={mockChartBars}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="month"
            tickLine={false}
            tickMargin={10}
            axisLine={false}
          />
          <YAxis tickLine={false} axisLine={false} width={32} />
          <ChartTooltip
            cursor={false}
            content={<ChartTooltipContent indicator="dashed" />}
          />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar
            dataKey="deliveries"
            fill="var(--color-deliveries)"
            radius={4}
          />
          <Bar
            dataKey="inspections"
            fill="var(--color-inspections)"
            radius={4}
          />
        </BarChart>
      </ChartContainer>
    </Card>
  );
}
