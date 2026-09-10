import { getPublicIssues } from "./actions";
import { IssuesTable } from "./issues-table";
import { Card } from "@/components/ui/card";
import styles from "../dashboard/page.module.css";

export const dynamic = "force-dynamic";

export default async function PersonnelIssuesPage() {
  const rows = await getPublicIssues();
  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Personnel / Issues</p>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Issues</h1>
          <p className={styles.subtitle}>
            {rows.length} {rows.length === 1 ? "issued item" : "issued items"} · assets
            and stock issued to employees · costs excluded
          </p>
        </div>
      </div>
      <Card className={styles.panel}>
        <p className={styles.panelSub}>
          Each row is one issued asset/stock line: receiving employee, account
          code, article, account title, asset type, and quantity — with its own
          QR record. No cost, supplier, or account-number data is shown or
          encoded.
        </p>
        <IssuesTable rows={rows} />
      </Card>
    </section>
  );
}
