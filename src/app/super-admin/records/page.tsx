import Link from "next/link";
import { Card } from "@/components/ui/card";
import { label } from "@/lib/labels";
import { getRecordCounts, getRecentAssets } from "./actions";
import actionStyles from "@/app/personnel/dashboard/page.module.css";
import {
  getLowStockItems,
  getRecentIssuances,
} from "@/app/personnel/dashboard/actions";
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

export default async function SuperAdminRecordsPage() {
  const [counts, assets, lowStock, issuances] = await Promise.all([
    getRecordCounts(),
    getRecentAssets(10),
    getLowStockItems(8),
    getRecentIssuances(8),
  ]);

  const cards = [
    { label: "Assets", value: counts.assets },
    { label: "Stock SKUs", value: counts.stockSkus },
    { label: "IAR records", value: counts.iarRecords },
    { label: "PAR / ICS", value: counts.issuances },
    { label: "Deliveries", value: counts.deliveries },
    { label: "Inspections", value: counts.inspections },
  ];

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Super Admin / Records</p>
      <div>
        <h1 className={styles.title}>Records</h1>
        <p className={styles.subtitle}>
          Registry totals and recent entries across assets, stocks, documents and
          issuances.
        </p>
      </div>

      <div style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "repeat(auto-fit, minmax(9rem, 1fr))" }}>
        {cards.map((c) => (
          <Card key={c.label} style={{ padding: "1rem" }}>
            <div style={{ fontSize: "0.6875rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-navy-500)" }}>
              {c.label}
            </div>
            <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{c.value.toLocaleString()}</div>
          </Card>
        ))}
      </div>

      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>Recently registered assets</h2>
        <p className={styles.panelSub}>
          Newest registry entries · view-only (manage assets under Assets).
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Article</th>
                <th>Code</th>
                <th>Type</th>
                <th>Status</th>
                <th>Location</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.id}>
                  <td>{a.article ?? "—"}</td>
                  <td>{a.account_code ?? "—"}</td>
                  <td>{a.category ?? "—"}</td>
                  <td>
                    <span className={styles.status} data-tone={a.status === "available" ? "ok" : "info"}>
                      {label(a.status)}
                    </span>
                  </td>
                  <td>{a.location ?? "—"}</td>
                  <td>
                    <Link
                      href={`/super-admin/assets/${a.id}`}
                      className={actionStyles.inspectLinkSecondary}
                      aria-label={`View details for asset ${a.article ?? a.id.slice(0, 8).toUpperCase()}`}
                    >
                      View Details
                    </Link>
                  </td>
                </tr>
              ))}
              {assets.length === 0 && (
                <tr>
                  <td colSpan={6} className={styles.empty}>No assets registered yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>Low-stock watchlist</h2>
        <p className={styles.panelSub}>Items at or below reorder threshold.</p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Item</th>
                <th>On hand</th>
                <th>Level</th>
              </tr>
            </thead>
            <tbody>
              {lowStock.map((s) => (
                <tr key={s.id}>
                  <td>{s.item_name}</td>
                  <td>
                    {s.quantity}
                    {s.unit ? ` ${s.unit}` : ""}
                  </td>
                  <td>
                    <span className={styles.status} data-tone={s.level === "low" ? "warn" : "bad"}>
                      {s.level === "out" ? "Out of stock" : s.level === "critical" ? "Critical" : "Low stock"}
                    </span>
                  </td>
                </tr>
              ))}
              {lowStock.length === 0 && (
                <tr>
                  <td colSpan={3} className={styles.empty}>All stock levels healthy.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>Recent PAR / ICS</h2>
        <p className={styles.panelSub}>Latest accountability documents.</p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Doc</th>
                <th>End user</th>
                <th>Date</th>
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
                </tr>
              ))}
              {issuances.length === 0 && (
                <tr>
                  <td colSpan={3} className={styles.empty}>Nothing issued yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}
