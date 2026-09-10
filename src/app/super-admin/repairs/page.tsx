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
import { browseRepairs } from "../browse/actions";
import type { RepairRow } from "@/app/personnel/repairs/actions";
import actionStyles from "@/app/personnel/dashboard/page.module.css";
import styles from "./page.module.css";

function fmtCost(v: number | null) {
  if (v === null || v === undefined) return "—";
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 }).format(v);
}

const columns: BrowseColumn<RepairRow>[] = [
  {
    key: "asset",
    label: "Asset / issue",
    value: (r) => (
      <span
        style={{
          display: "inline-block",
          minWidth: "14rem",
          maxWidth: "26rem",
          whiteSpace: "normal",
        }}
      >
        {r.asset_label ?? r.description.slice(0, 60)}
      </span>
    ),
    text: (r) => `${r.asset_label ?? ""} ${r.description}`,
  },
  { key: "reporter", label: "Reported by", value: (r) => r.reporter_name, text: (r) => r.reporter_name },
  { key: "tech", label: "Technician", value: (r) => r.technician ?? "—", text: (r) => r.technician ?? "" },
  { key: "date", label: "Date", value: (r) => fmtDate(r.repair_date), text: (r) => r.repair_date },
  { key: "cost", label: "Cost", value: (r) => fmtCost(r.cost), text: () => "" },
  { key: "status", label: "Status", value: (r) => <StatusPill value={r.status} />, text: (r) => r.status ?? "" },
  {
    key: "view",
    label: "Receipt",
    value: (r) => (
      <Link
        href={`/super-admin/repairs/${r.id}`}
        className={actionStyles.inspectLinkSecondary}
        aria-label={`View receipt for repair ${r.id.slice(0, 8).toUpperCase()}`}
      >
        View Details
      </Link>
    ),
    text: () => "",
  },
];

export default function SuperAdminRepairsPage() {
  const [rows, setRows] = useState<RepairRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void browseRepairs().then((r) => {
      setRows(r);
      setLoading(false);
    });
  }, []);

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Super Admin / Repairs</p>
      <div>
        <h1 className={styles.title}>Repairs</h1>
        <p className={styles.subtitle}>
          {loading ? "Loading…" : `${rows.length} repair ${rows.length === 1 ? "ticket" : "tickets"}`} · read-only
        </p>
      </div>
      <Card className={styles.panel}>
        <BrowseTable rows={rows} columns={columns} searchPlaceholder="Search asset, reporter, technician…" pageSizeKey="pgso:admin:repairs" />
      </Card>
    </section>
  );
}
