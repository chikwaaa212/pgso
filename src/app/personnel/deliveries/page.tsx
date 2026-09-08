import prisma from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { DeliveryCharts } from "./delivery-charts";
import { DeliveryTable, type DeliveryRow } from "./delivery-table";
import { LogDeliveryModal } from "./log-delivery-modal";
import styles from "../dashboard/page.module.css";

function formatDate(value: Date | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  });
}

function lastSixMonths(now: Date) {
  const months: { key: string; label: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push({
      key: `${d.getUTCFullYear()}-${d.getUTCMonth()}`,
      label: d.toLocaleString("en-US", { month: "short", timeZone: "UTC" }),
    });
  }
  return months;
}

export default async function PersonnelDeliveriesPage() {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const total = await prisma.delivery.count();
  const complete = await prisma.delivery.count({
    where: { delivery_status: "complete" },
  });
  const partial = await prisma.delivery.count({
    where: { delivery_status: "partial" },
  });
  const thisMonth = await prisma.delivery.count({
    where: { date_delivered: { gte: monthStart } },
  });
  const deliveries = await prisma.delivery.findMany({
    orderBy: { created_at: "desc" },
    include: { _count: { select: { items: true } } },
  });
  const recentDates = await prisma.delivery.findMany({
    select: { date_delivered: true },
    where: {
      date_delivered: {
        gte: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1)),
      },
    },
  });

  const months = lastSixMonths(now);
  const monthly = months.map((m) => ({
    month: m.label,
    deliveries: recentDates.filter((d) => {
      if (!d.date_delivered) return false;
      const dt = new Date(d.date_delivered);
      return `${dt.getUTCFullYear()}-${dt.getUTCMonth()}` === m.key;
    }).length,
  }));

  const stats = [
    {
      label: "Total Deliveries",
      value: String(total),
      delta: total === 1 ? "1 record" : `${total} records`,
    },
    {
      label: "Complete",
      value: String(complete),
      delta:
        total > 0 ? `${Math.round((complete / total) * 100)}% completion` : "No records yet",
    },
    {
      label: "Partial",
      value: String(partial),
      delta: partial > 0 ? "Awaiting balance" : "Nothing pending",
    },
    {
      label: "This Month",
      value: String(thisMonth),
      delta: now.toLocaleString("en-US", { month: "long", year: "numeric" }),
    },
  ];

  const rows: DeliveryRow[] = deliveries.map((d) => ({
    id: d.id.slice(0, 8).toUpperCase(),
    supplier: d.supplier ?? "—",
    po: d.po_reference ?? "—",
    date: formatDate(d.date_delivered),
    status: d.delivery_status === "partial" ? "Partial" : "Complete",
    itemCount: d._count.items,
  }));

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Personnel / Deliveries</p>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Deliveries</h1>
          <p className={styles.subtitle}>
            {total} {total === 1 ? "delivery" : "deliveries"} logged
          </p>
        </div>
        <div className={styles.actions}>
          <span className={styles.actionSecondary}>Export (soon)</span>
          <LogDeliveryModal />
        </div>
      </div>

      <div className={styles.stats}>
        {stats.map((stat) => (
          <Card key={stat.label} className={styles.statCard}>
            <span className={styles.statLabel}>{stat.label}</span>
            <span className={styles.statValue}>{stat.value}</span>
            <span className={styles.statDelta}>{stat.delta}</span>
          </Card>
        ))}
      </div>

      <DeliveryCharts
        monthly={monthly}
        mix={[
          { status: "complete", value: complete },
          { status: "partial", value: partial },
        ]}
      />

      <Card className={styles.panel}>
        <div>
          <h2 className={styles.panelTitle}>Delivery log</h2>
          <p className={styles.panelSub}>
            Live records from the database — search and filter below.
          </p>
        </div>
        <DeliveryTable rows={rows} />
      </Card>
    </section>
  );
}
