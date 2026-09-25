'use client';

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { LogsTable } from "./logs-table";
import styles from "../dashboard/page.module.css";

export default function PersonnelLogsPage() {
  // Total comes from the server-paged table (fixed 20/page, DB window).
  const [total, setTotal] = useState(0);

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Personnel / Logs</p>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>My Activity Logs</h1>
          <p className={styles.subtitle}>
            {total} {total === 1 ? "entry" : "entries"} created
            under your account — newest first.
          </p>
        </div>
      </div>

      <Card className={styles.panel}>
        <div>
          <h2 className={styles.panelTitle}>Audit trail</h2>
          <p className={styles.panelSub}>
            Every action you take is recorded with its module, purpose, and
            timestamp.
          </p>
        </div>
        <LogsTable onTotalChange={setTotal} />
      </Card>
    </section>
  );
}
