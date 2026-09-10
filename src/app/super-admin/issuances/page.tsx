import Link from "next/link";
import { browseIssuances } from "../browse/actions";
import { Card } from "@/components/ui/card";
import styles from "@/app/personnel/dashboard/page.module.css";

function fmt(iso: string | null | undefined) {
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

function peso(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(n);
}

export default async function SuperAdminIssuancesPage() {
  const rows = await browseIssuances();
  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Super Admin / Issuances</p>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>PAR / ICS Issuances</h1>
          <p className={styles.subtitle}>
            {rows.length} {rows.length === 1 ? "record" : "records"} · value
            over ₱50,000 → PAR, ₱50,000 or less → ICS · every issuance from all
            personnel
          </p>
        </div>
      </div>
      <Card className={styles.panel}>
        {rows.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.panelSub}>
              No PAR/ICS records yet — they appear here once personnel issue
              items with a signed PAR or ICS.
            </p>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Doc</th>
                  <th>No.</th>
                  <th>Employee</th>
                  <th>Logged By</th>
                  <th>Item</th>
                  <th>Qty</th>
                  <th>Total</th>
                  <th>Date</th>
                  <th>Report</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <span className={styles.status} data-tone={r.doc_type === "PAR" ? "ok" : "info"}>
                        {r.doc_type}
                      </span>
                    </td>
                    <td>{r.doc_no ?? "—"}</td>
                    <td>{r.employee_name}</td>
                    <td>{r.logged_by ?? "—"}</td>
                    <td>{r.item_label}</td>
                    <td>{r.quantity}</td>
                    <td>{peso(r.total_amount)}</td>
                    <td>{fmt(r.doc_date)}</td>
                    <td>
                      <Link
                        href={`/super-admin/issuances/${r.id}`}
                        className={styles.inspectLinkSecondary}
                      >
                        View {r.doc_type}
                      </Link>
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
