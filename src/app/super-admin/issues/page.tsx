import { Card } from "@/components/ui/card";
import { browseIssues } from "../browse/actions";
import { IssuesTable } from "@/app/personnel/issues/issues-table";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function SuperAdminIssuesPage() {
  const rows = await browseIssues();

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Super Admin / Issues</p>
      <div>
        <h1 className={styles.title}>Issues</h1>
        <p className={styles.subtitle}>
          {rows.length} {rows.length === 1 ? "issued item" : "issued items"} · assets
          and stock issued to employees · read-only
        </p>
      </div>
      <Card className={styles.panel}>
        <IssuesTable rows={rows} showLoggedBy />
      </Card>
    </section>
  );
}
