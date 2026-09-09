import { Card } from "@/components/ui/card";
import prisma from "@/lib/prisma";
import styles from "../dashboard/page.module.css";

function tone(status: string | null) {
  if (status === "released" || status === "approved") return "ok";
  if (status === "pending") return "warn";
  return "info";
}

function fmt(date: Date | null | undefined) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  });
}

export default async function PersonnelDocumentsPage() {
  const docs = await prisma.document.findMany({
    orderBy: { created_at: "desc" },
  });

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Personnel / Documents</p>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Documents</h1>
          <p className={styles.subtitle}>
            {docs.length} {docs.length === 1 ? "document" : "documents"} on record
          </p>
        </div>
        <div className={styles.actions}>
          <span className={styles.actionPrimary}>New document (soon)</span>
        </div>
      </div>

      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>Document log</h2>
        {docs.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.panelSub}>No documents recorded yet.</p>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Reference no.</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Date created</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((doc) => (
                  <tr key={doc.id}>
                    <td>{doc.reference_number}</td>
                    <td>{doc.document_type}</td>
                    <td>
                      <span
                        className={styles.status}
                        data-tone={tone(doc.status)}
                      >
                        {doc.status
                          ? doc.status.charAt(0).toUpperCase() +
                            doc.status.slice(1)
                          : "—"}
                      </span>
                    </td>
                    <td>{fmt(doc.date_created)}</td>
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
