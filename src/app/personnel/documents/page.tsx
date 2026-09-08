import { Card } from "@/components/ui/card";
import { mockDocuments } from "@/components/personnel/mock";
import styles from "../dashboard/page.module.css";

function tone(status: string) {
  if (status === "Released" || status === "Approved") return "ok";
  return "warn";
}

export default function PersonnelDocumentsPage() {
  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Personnel / Documents</p>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Documents</h1>
          <p className={styles.subtitle}>
            Generate and track RIS, PAR, ICS, and AIR.{" "}
            <span className={styles.badge}>Mockup — no live data</span>
          </p>
        </div>
        <div className={styles.actions}>
          <span className={styles.actionPrimary}>New document (soon)</span>
        </div>
      </div>

      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>Document log</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Reference</th>
                <th>Type</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {mockDocuments.map((doc) => (
                <tr key={doc.id}>
                  <td>{doc.ref}</td>
                  <td>{doc.type}</td>
                  <td>
                    <span className={styles.status} data-tone={tone(doc.status)}>
                      {doc.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}
