'use client'

import { usePathname } from "next/navigation";
import { Card } from "@/components/ui/card";
import { DeliveryTable } from "./delivery-table";
import { LogDeliveryModal } from "./log-delivery-modal";
import { portalFromPathname } from "@/lib/portal-path";
import styles from "../dashboard/page.module.css";

export default function PersonnelDeliveriesPage() {
  const readOnly = portalFromPathname(usePathname()) === "super-admin";
  return (
    <section className={styles.section}>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Deliveries</h1>
        </div>
        <div className={styles.actions}>
          <span className={styles.actionSecondary} style={{ height: 24 }}>
            Export (soon)
          </span>
          {readOnly ? null : <LogDeliveryModal />}
        </div>
      </div>

      <Card className={styles.panel}>
        <DeliveryTable readOnly={readOnly} />
      </Card>
    </section>
  );
}
