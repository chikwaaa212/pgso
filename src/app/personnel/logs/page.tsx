'use client';

import { Card } from "@/components/ui/card";
import { getMyLogs } from "./actions";
import { useCachedAction } from "@/hooks/use-cached-action";
import { CLIENT_CACHE_KEYS } from "@/lib/client-cache";
import { LogsTable } from "./logs-table";
import LogsLoading from "./loading";
import styles from "../dashboard/page.module.css";

export default function PersonnelLogsPage() {
  // Cached trail: back-navigation paints instantly from memory /
  // sessionStorage and only revalidates silently when stale — same
  // SWR pattern as dashboard / deliveries / requests.
  const { data: rows, loading } = useCachedAction(
    CLIENT_CACHE_KEYS.logs,
    getMyLogs,
    { staleTime: 30_000 }
  );

  if (loading) {
    return <LogsLoading />;
  }

  const list = rows ?? [];

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Personnel / Logs</p>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>My Activity Logs</h1>
          <p className={styles.subtitle}>
            {list.length} {list.length === 1 ? "entry" : "entries"} created
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
        <LogsTable rows={list} />
      </Card>
    </section>
  );
}
