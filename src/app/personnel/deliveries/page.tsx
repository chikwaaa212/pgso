import prisma from "@/lib/prisma";
import { getPersonnelScope } from "@/lib/personnel-scope";
import { Card } from "@/components/ui/card";
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

export default async function PersonnelDeliveriesPage() {
  let rows: DeliveryRow[] = [];
  let total = 0;

  try {
    // Own-data only for personnel; super_admin (browse reuse) sees all.
    const scope = await getPersonnelScope();
    if (scope.isEmpty || !scope.userId) {
      rows = [];
      total = 0;
    } else {
      const where = scope.isSuperAdmin ? {} : { received_by: scope.userId };
      const deliveries = await prisma.delivery.findMany({
        where,
        orderBy: { created_at: "desc" },
        include: { _count: { select: { items: true } } },
      });

      total = await prisma.delivery.count({ where });

      rows = deliveries.map((d) => ({
        id: d.id.slice(0, 8).toUpperCase(),
        deliveryId: d.id,
        supplier: d.supplier ?? "—",
        po: d.po_reference ?? "—",
        date: formatDate(d.date_delivered),
        status: d.delivery_status === "partial" ? "Partial" : "Complete",
        itemCount: d._count.items,
        inspectionStatus: (d.inspection_status as DeliveryRow["inspectionStatus"]) ?? "pending",
        inspectionRef: d.id.slice(0, 8).toUpperCase(),
      }));
    }
  } catch (e) {
    console.error("[PersonnelDeliveriesPage]", e);
  }

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

      <Card className={styles.panel}>
        <div>
          <h2 className={styles.panelTitle}>Delivery log</h2>
          <p className={styles.panelSub}>
            Your logged deliveries only — other personnel&apos;s records are hidden.
          </p>
        </div>
        <DeliveryTable rows={rows} />
      </Card>
    </section>
  );
}
