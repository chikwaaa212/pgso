'use client'

import { useState } from "react";
import { usePathname } from "next/navigation";
import {
  ClipboardCheck,
  Clock3,
  Truck,
  Undo2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/personnel/PageHeader";
import { SummaryTiles } from "@/components/personnel/SummaryTiles";
import { DeliveryTable, type DeliveryStats } from "./delivery-table";
import { LogDeliveryModal } from "./log-delivery-modal";
import { portalFromPathname } from "@/lib/portal-path";
import styles from "../dashboard/page.module.css";
import ui from "@/components/personnel/personnel-ui.module.css";

const EMPTY_STATS: DeliveryStats = {
  total: 0,
  pending: 0,
  passed: 0,
  returned: 0,
};

export default function PersonnelDeliveriesPage() {
  const readOnly = portalFromPathname(usePathname()) === "super-admin";
  const [stats, setStats] = useState<DeliveryStats>(EMPTY_STATS);

  const tiles = [
    {
      label: "Total deliveries",
      value: stats.total.toLocaleString("en-PH"),
      hint: "Newest records in your window",
      icon: Truck,
      tone: "info" as const,
    },
    {
      label: "Pending inspection",
      value: stats.pending.toLocaleString("en-PH"),
      hint: stats.pending === 0 ? "Nothing waiting" : "Awaiting review",
      icon: Clock3,
      tone: stats.pending > 0 ? ("warn" as const) : ("ok" as const),
    },
    {
      label: "Passed",
      value: stats.passed.toLocaleString("en-PH"),
      hint: "Stocked automatically",
      icon: ClipboardCheck,
      tone: "ok" as const,
    },
    {
      label: "Returned",
      value: stats.returned.toLocaleString("en-PH"),
      hint: "Sent back to supplier",
      icon: Undo2,
      tone: stats.returned > 0 ? ("bad" as const) : ("neutral" as const),
    },
  ];

  return (
    <section className={ui.page}>
      <PageHeader
        eyebrow="Procurement"
        title="Deliveries"
        subtitle="Log arriving goods, track their expected arrival, and hand them to inspection. Passed inspections stock the ledger automatically."
        meta={
          <>
            {stats.total.toLocaleString("en-PH")} delivery
            {stats.total === 1 ? "" : "s"} loaded
          </>
        }
        actions={
          readOnly ? null : <LogDeliveryModal />
        }
      />

      <SummaryTiles tiles={tiles} ariaLabel="Delivery summary" />

      <Card className={styles.panel}>
        <DeliveryTable readOnly={readOnly} onStatsChange={setStats} />
      </Card>
    </section>
  );
}
