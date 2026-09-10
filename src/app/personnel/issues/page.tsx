import { getCompletedRequestIssues, getPublicIssues } from "./actions";
import { IssuesTable } from "./issues-table";
import { Card } from "@/components/ui/card";
import { RequestQrButton } from "@/components/personnel/RequestQrButton";
import { requestTypeLabel } from "@/app/personnel/requests/request-types";
import styles from "../dashboard/page.module.css";

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

export default async function PersonnelIssuesPage() {
  const [rows, completed] = await Promise.all([
    getPublicIssues(),
    getCompletedRequestIssues(),
  ]);
  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Personnel / Issues</p>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Issues</h1>
          <p className={styles.subtitle}>
            {rows.length} {rows.length === 1 ? "issued item" : "issued items"} · assets
            and stock issued to employees · costs excluded
            {completed.length > 0
              ? ` · ${completed.length} completed ${completed.length === 1 ? "request" : "requests"}`
              : ""}
          </p>
        </div>
      </div>
      <Card className={styles.panel}>
        <p className={styles.panelSub}>
          Each row is one issued asset/stock line: receiving employee, account
          code, article, account title, asset type, and quantity — with its own
          QR record. No cost, supplier, or account-number data is shown or
          encoded.
        </p>
        <IssuesTable rows={rows} />
      </Card>
      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>Completed request QR records</h2>
        <p className={styles.panelSub}>
          Completed transfers, assignments, repairs, and stock replenishments
          you actioned — each with its own QR record (quantity + transfer
          parties included).
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
                  <td colSpan={6} className={styles.emptyState}>
                    No completed requests you actioned yet.
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
