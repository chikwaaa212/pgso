import { Card } from "@/components/ui/card";
import prisma from "@/lib/prisma";
import styles from "../dashboard/page.module.css";

function tone(status: string | null) {
  if (status === "approved") return "info";
  if (status === "completed") return "ok";
  if (status === "rejected") return "bad";
  return "warn"; // pending
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

export default async function PersonnelRequestsPage() {
  const requests = await prisma.request.findMany({
    orderBy: { date_requested: "desc" },
  });

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Personnel / Requests</p>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Requests</h1>
          <p className={styles.subtitle}>
            {requests.length} {requests.length === 1 ? "request" : "requests"} on record
          </p>
        </div>
      </div>

      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>Request queue</h2>
        {requests.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.panelSub}>No requests submitted yet.</p>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Description</th>
                  <th>Date requested</th>
                  <th>Date resolved</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {r.request_type
                        .replace(/_/g, " ")
                        .replace(/\b\w/g, (c) => c.toUpperCase())}
                    </td>
                    <td>{r.description}</td>
                    <td>{fmt(r.date_requested)}</td>
                    <td>{fmt(r.date_resolved)}</td>
                    <td>
                      <span className={styles.status} data-tone={tone(r.status)}>
                        {r.status
                          ? r.status.charAt(0).toUpperCase() +
                            r.status.slice(1)
                          : "—"}
                      </span>
                    </td>
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
