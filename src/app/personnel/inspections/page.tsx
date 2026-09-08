import { Card } from "@/components/ui/card";
import { mockInspections } from "@/components/personnel/mock";
import styles from "../dashboard/page.module.css";

function tone(result: string) {
  if (result === "Passed") return "ok";
  if (result === "Failed") return "bad";
  return "warn";
}

export default function PersonnelInspectionsPage() {
  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Personnel / Inspections</p>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Inspections</h1>
          <p className={styles.subtitle}>
            Record inspection and AIR results.{" "}
            <span className={styles.badge}>Mockup — no live data</span>
          </p>
        </div>
        <div className={styles.actions}>
          <span className={styles.actionPrimary}>New inspection (soon)</span>
        </div>
      </div>

      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>All inspections</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Delivery</th>
                <th>Result</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {mockInspections.map((i) => (
                <tr key={i.id}>
                  <td>{i.id}</td>
                  <td>{i.delivery}</td>
                  <td>
                    <span className={styles.status} data-tone={tone(i.result)}>
                      {i.result}
                    </span>
                  </td>
                  <td>{i.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}
