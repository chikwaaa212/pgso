import Link from "next/link";
import { Card } from "@/components/ui/card";
import { label } from "@/lib/labels";
import { getRecentDeliveries } from "@/app/personnel/inspections/actions";
import {
  getOperationsStats,
  getRecentIssuances,
  getRecentRepairs,
  getRecentRequests,
} from "@/app/personnel/dashboard/actions";
import actionStyles from "@/app/personnel/dashboard/page.module.css";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  });
}

export default async function SuperAdminTransactionsPage() {
  const [stats, deliveries, requests, repairs, issuances] = await Promise.all([
    getOperationsStats(),
    getRecentDeliveries(10),
    getRecentRequests(10),
    getRecentRepairs(10),
    getRecentIssuances(10),
  ]);

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Super Admin / Transactions</p>
      <div>
        <h1 className={styles.title}>Transactions</h1>
        <p className={styles.subtitle}>
          {stats.totalDeliveries} deliveries · {stats.pendingInspections} pending
          inspection · {stats.pendingRequests} pending requests ·{' '}
          {stats.pendingRepairs + stats.inProgressRepairs} active repairs ·{' '}
          {stats.totalIssuances} PAR/ICS issued · view-only oversight
        </p>
      </div>

      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>Recent deliveries</h2>
        <p className={styles.panelSub}>
          Newest first. Open a row to see the full delivery record.
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Supplier</th>
                <th>PO ref</th>
                <th>Date</th>
                <th>Status</th>
                <th>Inspection</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((d) => (
                <tr key={d.id}>
                  <td>{d.supplier ?? "—"}</td>
                  <td>{d.po_reference ?? "—"}</td>
                  <td>{fmtDate(d.date_delivered)}</td>
                  <td>
                    <span className={styles.status} data-tone="info">
                      {label(d.delivery_status)}
                    </span>
                  </td>
                  <td>
                    <span
                      className={styles.status}
                      data-tone={
                        d.inspection_status === "passed"
                          ? "ok"
                          : d.inspection_status === "failed"
                            ? "bad"
                            : "warn"
                      }
                    >
                      {label(d.inspection_status)}
                    </span>
                  </td>
                  <td>
                    <Link
                      href={`/super-admin/deliveries/${d.id}`}
                      className={actionStyles.inspectLinkSecondary}
                      aria-label={`View details for delivery ${d.id.slice(0, 8).toUpperCase()}`}
                    >
                      View Details
                    </Link>
                  </td>
                </tr>
              ))}
              {deliveries.length === 0 && (
                <tr>
                  <td colSpan={6} className={styles.empty}>No deliveries logged yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>Recent employee requests</h2>
        <p className={styles.panelSub}>Transfer, new-assignment and repair requests.</p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Type</th>
                <th>Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id}>
                  <td>{r.employee_name}</td>
                  <td>{label(r.request_type)}</td>
                  <td>{fmtDate(r.date_requested)}</td>
                  <td>
                    <span
                      className={styles.status}
                      data-tone={
                        r.status === "completed"
                          ? "ok"
                          : r.status === "rejected"
                            ? "bad"
                            : r.status === "approved"
                              ? "info"
                              : "warn"
                      }
                    >
                      {label(r.status)}
                    </span>
                  </td>
                </tr>
              ))}
              {requests.length === 0 && (
                <tr>
                  <td colSpan={4} className={styles.empty}>No requests yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>Recent repairs</h2>
        <p className={styles.panelSub}>Repair tickets and technicians.</p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Asset / issue</th>
                <th>Technician</th>
                <th>Date</th>
                <th>Status</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {repairs.map((r) => (
                <tr key={r.id}>
                  <td>{r.asset_label ?? r.description.slice(0, 60)}</td>
                  <td>{r.technician ?? "—"}</td>
                  <td>{fmtDate(r.repair_date)}</td>
                  <td>
                    <span
                      className={styles.status}
                      data-tone={r.status === "completed" ? "ok" : r.status === "in_progress" ? "info" : "warn"}
                    >
                      {label(r.status)}
                    </span>
                  </td>
                  <td>
                    <Link
                      href={`/super-admin/repairs/${r.id}`}
                      className={actionStyles.inspectLinkSecondary}
                      aria-label={`View details for repair ${r.id.slice(0, 8).toUpperCase()}`}
                    >
                      View Details
                    </Link>
                  </td>
                </tr>
              ))}
              {repairs.length === 0 && (
                <tr>
                  <td colSpan={5} className={styles.empty}>No repair tickets yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>Recent PAR / ICS issuances</h2>
        <p className={styles.panelSub}>Accountability documents issued to end users.</p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Doc</th>
                <th>End user</th>
                <th>Date</th>
                <th>Report</th>
              </tr>
            </thead>
            <tbody>
              {issuances.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.doc_type}
                    {r.doc_no ? ` · ${r.doc_no}` : ""}
                  </td>
                  <td>{r.employee_name}</td>
                  <td>{fmtDate(r.created_at)}</td>
                  <td>
                    <Link
                      href={`/super-admin/issuances/${r.id}`}
                      className={actionStyles.inspectLinkSecondary}
                      aria-label={`View ${r.doc_type} report ${r.doc_no ?? r.id.slice(0, 8).toUpperCase()}`}
                    >
                      View {r.doc_type}
                    </Link>
                  </td>
                </tr>
              ))}
              {issuances.length === 0 && (
                <tr>
                  <td colSpan={4} className={styles.empty}>Nothing issued yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}
