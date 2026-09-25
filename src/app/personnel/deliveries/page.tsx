'use client'

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { DeliveryTable } from "./delivery-table";
import { LogDeliveryModal } from "./log-delivery-modal";
import styles from "../dashboard/page.module.css";

export default function PersonnelDeliveriesPage() {
  // Total comes from the server-paged table (fixed 20/page, DB window).
  const [total, setTotal] = useState(0);

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
        <DeliveryTable onTotalChange={setTotal} />
      </Card>
    </section>
  );
}
