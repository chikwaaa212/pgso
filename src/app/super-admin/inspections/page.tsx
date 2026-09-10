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
import { browseInspections } from "../browse/actions";
import type { UnifiedInspectionRow } from "@/app/personnel/inspections/actions";
import actionStyles from "@/app/personnel/dashboard/page.module.css";
import styles from "./page.module.css";

function resultLabel(d: UnifiedInspectionRow) {
  if (d.inspection_status === "pending") return "Pending";
  return d.result ? d.result.charAt(0).toUpperCase() + d.result.slice(1) : "—";
}

const columns: BrowseColumn<UnifiedInspectionRow>[] = [
  { key: "ref", label: "Ref", value: (r) => r.delivery_ref, text: (r) => `${r.delivery_ref} ${r.po_reference ?? ""}` },
  { key: "supplier", label: "Supplier", value: (r) => r.supplier ?? "—", text: (r) => r.supplier ?? "" },
  { key: "date", label: "Delivered", value: (r) => fmtDate(r.date_delivered), text: (r) => r.date_delivered ?? "" },
  { key: "inspector", label: "Inspector", value: (r) => r.inspector_name ?? "—", text: (r) => r.inspector_name ?? "" },
  { key: "logged_by", label: "Logged By", value: (r) => r.logged_by ?? r.inspector_name ?? "—", text: (r) => r.logged_by ?? r.inspector_name ?? "" },
  { key: "result", label: "Result", value: (r) => <StatusPill value={resultLabel(r)} />, text: (r) => resultLabel(r) },
  { key: "air", label: "AIR", value: (r) => r.iar_no ?? "—", text: (r) => r.iar_no ?? "" },
  {
    key: "view",
    label: "Detail",
    value: (r) => (
      <Link
        href={`/super-admin/inspections/${r.delivery_id}`}
        className={actionStyles.inspectLinkSecondary}
        aria-label={`View details for inspection ${r.delivery_ref}`}
      >
        View Details
      </Link>
    ),
    text: () => "",
  },
];

export default function SuperAdminInspectionsPage() {
  const [rows, setRows] = useState<UnifiedInspectionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void browseInspections().then((r) => {
      setRows(r);
      setLoading(false);
    });
  }, []);

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Super Admin / Inspections</p>
      <div>
        <h1 className={styles.title}>Inspections</h1>
        <p className={styles.subtitle}>
          {loading ? "Loading…" : `${rows.length} ${rows.length === 1 ? "record" : "records"} across all personnel`} · read-only
        </p>
      </div>
      <Card className={styles.panel}>
        <BrowseTable rows={rows} columns={columns} searchPlaceholder="Search supplier, PO, inspector, AIR…" pageSizeKey="pgso:admin:inspections" getRowKey={(r) => r.delivery_id} />
      </Card>
    </section>
  );
}
