import { Card } from "@/components/ui/card";
import prisma from "@/lib/prisma";
import styles from "../dashboard/page.module.css";

function tone(status: string | null) {
  if (status === "completed") return "ok";
  if (status === "in_progress") return "info";
  return "warn";
}

function fmt(date: Date) {
  return new Date(date).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  });
}

export default async function PersonnelRepairsPage() {
  const repairs = await prisma.repair.findMany({
    orderBy: { created_at: "desc" },
  });

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Personnel / Repairs</p>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Repairs</h1>
          <p className={styles.subtitle}>
            {repairs.length} repair {repairs.length === 1 ? "ticket" : "tickets"} on record
          </p>
        </div>
      </div>

      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>Repair tickets</h2>
        {repairs.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.panelSub}>No repair tickets recorded yet.</p>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Description</th>
                  <th>Technician</th>
                  <th>Repair date</th>
                  <th>Cost</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {repairs.map((r) => (
                  <tr key={r.id}>
                    <td>{r.asset_id.slice(0, 8).toUpperCase()}</td>
                    <td>{r.description}</td>
                    <td>{r.technician ?? "Unassigned"}</td>
                    <td>{fmt(r.repair_date)}</td>
                    <td>
                      {r.cost != null
                        ? `₱${Number(r.cost).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`
                        : "—"}
                    </td>
                    <td>
                      <span className={styles.status} data-tone={tone(r.status)}>
                        {r.status
                          ? r.status.charAt(0).toUpperCase() +
                            r.status.slice(1).replace(/_/g, " ")
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
