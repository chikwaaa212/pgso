"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import {
  BrowseTable,
  StatusPill,
  fmtDate,
  type BrowseColumn,
} from "@/components/super-admin/BrowseTable";
import { browseDeliveries, type BrowseDeliveryRow } from "../browse/actions";
import styles from "./page.module.css";
import actionStyles from "@/app/personnel/dashboard/page.module.css";

const columns: BrowseColumn<BrowseDeliveryRow>[] = [
  { key: "ref", label: "Ref", value: (r) => r.ref, text: (r) => `${r.ref} ${r.po_reference ?? ""}` },
  { key: "supplier", label: "Supplier", value: (r) => r.supplier ?? "—", text: (r) => r.supplier ?? "" },
  { key: "po", label: "PO ref", value: (r) => r.po_reference ?? "—", text: (r) => r.po_reference ?? "" },
  { key: "date", label: "Date", value: (r) => fmtDate(r.date_delivered), text: (r) => r.date_delivered ?? "" },
  { key: "logged_by", label: "Logged By", value: (r) => r.logged_by ?? "—", text: (r) => r.logged_by ?? "" },
  { key: "status", label: "Status", value: (r) => <StatusPill value={r.delivery_status} />, text: (r) => r.delivery_status ?? "" },
  { key: "inspection", label: "Inspection", value: (r) => <StatusPill value={r.inspection_status} />, text: (r) => r.inspection_status ?? "" },
  { key: "items", label: "Items", value: (r) => r.item_count, text: () => "" },
  {
    key: "action",
    label: "Action",
    value: (r) => (
      <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
        <Link
          href={`/super-admin/deliveries/${r.id}`}
          className={actionStyles.inspectLinkSecondary}
          aria-label={`View details for delivery ${r.ref}`}
        >
          View Details
        </Link>
        <Link
          href={`/super-admin/inspections/${r.id}`}
          className={actionStyles.inspectLink}
          aria-label={`View inspection record for delivery ${r.ref}`}
        >
          View Inspection
        </Link>
      </div>
    ),
    text: () => "",
  },
];

export default function SuperAdminDeliveriesPage() {
  const [rows, setRows] = useState<BrowseDeliveryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void browseDeliveries().then((r) => {
      setRows(r);
      setLoading(false);
    });
  }, []);

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Super Admin / Deliveries</p>
      <div>
        <h1 className={styles.title}>Deliveries</h1>
        <p className={styles.subtitle}>
          {loading ? "Loading…" : `${rows.length} ${rows.length === 1 ? "delivery" : "deliveries"} logged by all personnel`} · read-only
        </p>
      </div>
      <Card className={styles.panel}>
        <BrowseTable rows={rows} columns={columns} searchPlaceholder="Search supplier, PO, ref, logger…" pageSizeKey="pgso:admin:deliveries" getRowKey={(r) => r.id} />
      </Card>
    </section>
  );
}
