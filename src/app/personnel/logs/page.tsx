import { Card } from "@/components/ui/card";
import { getMyLogs } from "./actions";
import { LogsTable } from "./logs-table";
import styles from "../dashboard/page.module.css";

export const dynamic = "force-dynamic";

export default async function PersonnelLogsPage() {
  const rows = await getMyLogs();

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Personnel / Logs</p>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>My Activity Logs</h1>
          <p className={styles.subtitle}>
            {rows.length} {rows.length === 1 ? "entry" : "entries"} created
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
        <LogsTable rows={rows} />
      </Card>
    </section>
  );
}
