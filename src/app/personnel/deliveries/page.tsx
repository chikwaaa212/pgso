'use client'

import { useMemo } from "react";
import { getDeliveriesList } from "./actions";
import { useCachedAction } from "@/hooks/use-cached-action";
import { CLIENT_CACHE_KEYS } from "@/lib/client-cache";
import { Card } from "@/components/ui/card";
import { DeliveryTable, type DeliveryRow } from "./delivery-table";
import { LogDeliveryModal } from "./log-delivery-modal";
import DeliveriesLoading from "./loading";
import styles from "../dashboard/page.module.css";

function formatDateISO(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  });
}

export default function PersonnelDeliveriesPage() {
  // Cached list: back-navigation paints instantly from memory /
  // sessionStorage and only revalidates silently when stale.
  // getDeliveriesList already fails closed for signed-out callers.
  const { data: deliveries, loading } = useCachedAction(
    CLIENT_CACHE_KEYS.deliveries,
    getDeliveriesList,
    { staleTime: 30_000 }
  );

  const rows: DeliveryRow[] = useMemo(() => {
    return (deliveries ?? []).map((d) => ({
      id: d.id.slice(0, 8).toUpperCase(),
      deliveryId: d.id,
      supplier: d.supplier ?? "—",
      po: d.po_reference ?? "—",
      date: formatDateISO(d.date_delivered),
      arrival: formatDateISO(d.expected_arrival_date),
      kind:
        d.delivery_kind === "stock"
          ? "Stocks"
          : d.delivery_kind === "asset"
            ? "Assets"
            : "—",
      status:
        d.delivery_status === "partial"
          ? "Partial"
          : d.delivery_status === "awaiting"
            ? "Awaiting arrival"
            : "Complete",
      itemCount: d.item_count,
      inspectionStatus: (d.inspection_status as DeliveryRow["inspectionStatus"]) ?? "pending",
      inspectionRef: d.id.slice(0, 8).toUpperCase(),
    }));
  }, [deliveries]);

  if (loading) {
    return <DeliveriesLoading />;
  }

  const total = rows.length;

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
