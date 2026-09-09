import { Card } from "@/components/ui/card";
import prisma from "@/lib/prisma";
import styles from "../dashboard/page.module.css";

function tone(status: string | null) {
  if (status === "available") return "ok";
  if (status === "assigned")  return "info";
  return "warn";
}

function label(status: string | null) {
  if (!status) return "—";
  return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");
}

export default async function PersonnelAssetsPage() {
  const assets = await prisma.asset.findMany({
    orderBy: { created_at: "desc" },
  });

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Personnel / Assets</p>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Assets</h1>
          <p className={styles.subtitle}>
            {assets.length} {assets.length === 1 ? "asset" : "assets"} registered
          </p>
        </div>
        <div className={styles.actions}>
          <span className={styles.actionPrimary}>Encode asset (soon)</span>
        </div>
      </div>

      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>Asset registry</h2>
        {assets.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.panelSub}>No assets registered yet.</p>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Property no.</th>
                  <th>Category</th>
                  <th>Description</th>
                  <th>Condition</th>
                  <th>Status</th>
                  <th>Location</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((a) => (
                  <tr key={a.id}>
                    <td>{a.property_number ?? "—"}</td>
                    <td>{a.category ?? "—"}</td>
                    <td>{a.description ?? "—"}</td>
                    <td>{label(a.condition)}</td>
                    <td>
                      <span className={styles.status} data-tone={tone(a.status)}>
                        {label(a.status)}
                      </span>
                    </td>
                    <td>{a.location ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </section>
  );
}
