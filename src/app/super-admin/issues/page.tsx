import { Card } from "@/components/ui/card";
import { browseCompletedRequests, browseIssues } from "../browse/actions";
import { IssuesTable } from "@/app/personnel/issues/issues-table";
import { RequestQrButton } from "@/components/personnel/RequestQrButton";
import { requestTypeLabel } from "@/app/personnel/requests/request-types";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

function fmtDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  });
}

export default async function SuperAdminIssuesPage() {
  const [rows, completed] = await Promise.all([
    browseIssues(),
    browseCompletedRequests(),
  ]);

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Super Admin / Issues</p>
      <div>
        <h1 className={styles.title}>Issues</h1>
        <p className={styles.subtitle}>
          {rows.length} {rows.length === 1 ? "issued item" : "issued items"} · assets
          and stock issued to employees · read-only
          {completed.length > 0
            ? ` · ${completed.length} completed ${completed.length === 1 ? "request" : "requests"}`
            : ""}
        </p>
      </div>
      <Card className={styles.panel}>
        <IssuesTable rows={rows} showLoggedBy />
      </Card>
      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>Completed request QR records</h2>
        <p className={styles.panelSub}>
          All completed requests — transfers, assignments, repairs, and stock
          replenishments from the asset page and the request queue — each with
          its own QR record.
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Type</th>
                <th>Employee</th>
                <th>Item</th>
                <th>Qty</th>
                <th>Resolved</th>
                <th>QR record</th>
              </tr>
            </thead>
            <tbody>
              {completed.map((r) => {
                const qty = (r.lines ?? []).reduce(
                  (sum, l) => sum + (l.quantity || 0),
                  0
                );
                return (
                  <tr key={r.id}>
                    <td>{requestTypeLabel(r.request_type)}</td>
                    <td>{r.employee_name}</td>
                    <td>{r.asset_label ?? "—"}</td>
                    <td>{qty > 0 ? qty : "—"}</td>
                    <td>{fmtDate(r.date_resolved)}</td>
                    <td>
                      <RequestQrButton requestId={r.id} />
                    </td>
                  </tr>
                );
              })}
              {completed.length === 0 && (
                <tr>
                  <td colSpan={6} className={styles.empty}>
                    No completed requests yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}
