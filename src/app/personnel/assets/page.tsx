import { Card } from "@/components/ui/card";
import { mockAssets } from "@/components/personnel/mock";
import styles from "../dashboard/page.module.css";

function tone(status: string) {
  if (status === "Available") return "ok";
  if (status === "Assigned") return "info";
  return "warn";
}

export default function PersonnelAssetsPage() {
  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Personnel / Assets</p>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Assets</h1>
          <p className={styles.subtitle}>
            Encode items, validate, and assign QR codes.{" "}
            <span className={styles.badge}>Mockup — no live data</span>
          </p>
        </div>
        <div className={styles.actions}>
          <span className={styles.actionPrimary}>Encode asset (soon)</span>
        </div>
      </div>

      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>Asset registry</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Property no.</th>
                <th>Category</th>
                <th>Status</th>
                <th>Location</th>
              </tr>
            </thead>
            <tbody>
              {mockAssets.map((a) => (
                <tr key={a.id}>
                  <td>{a.propertyNo}</td>
                  <td>{a.category}</td>
                  <td>
                    <span className={styles.status} data-tone={tone(a.status)}>
                      {a.status}
                    </span>
                  </td>
                  <td>{a.location}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}
