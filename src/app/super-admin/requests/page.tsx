"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import {
  BrowseTable,
  StatusPill,
  fmtDate,
  type BrowseColumn,
} from "@/components/super-admin/BrowseTable";
import { browseRequests, type BrowseRequestRow } from "../browse/actions";
import { label } from "@/lib/labels";
import styles from "./page.module.css";

const columns: BrowseColumn<BrowseRequestRow>[] = [
  { key: "employee", label: "Employee", value: (r) => r.employee_name, text: (r) => r.employee_name },
  { key: "logged_by", label: "Logged By", value: (r) => r.logged_by ?? "—", text: (r) => r.logged_by ?? "" },
  { key: "type", label: "Type", value: (r) => label(r.request_type), text: (r) => r.request_type },
  { key: "asset", label: "Item", value: (r) => r.asset_label ?? "—", text: (r) => r.asset_label ?? "" },
  { key: "date", label: "Requested", value: (r) => fmtDate(r.date_requested), text: (r) => r.date_requested ?? "" },
  { key: "status", label: "Status", value: (r) => <StatusPill value={r.status} />, text: (r) => r.status ?? "" },
];

export default function SuperAdminRequestsPage() {
  const [rows, setRows] = useState<BrowseRequestRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void browseRequests().then((r) => {
      setRows(r);
      setLoading(false);
    });
  }, []);

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Super Admin / Requests</p>
      <div>
        <h1 className={styles.title}>Requests</h1>
        <p className={styles.subtitle}>
            {loading ? "Loading…" : `${rows.length} employee ${rows.length === 1 ? "request" : "requests"}`} · read-only
        </p>
      </div>
      <Card className={styles.panel}>
        <BrowseTable rows={rows} columns={columns} searchPlaceholder="Search employee, filer, type, item…" pageSizeKey="pgso:admin:requests" />
      </Card>
    </section>
  );
}
