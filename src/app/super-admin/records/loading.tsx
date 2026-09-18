import { Card } from "@/components/ui/card";
import styles from "./page.module.css";
import actionStyles from "@/app/personnel/dashboard/page.module.css";

/**
 * Super-admin records skeleton — mirrors SuperAdminRecordsPage 1:1
 * (crumb, header, 6 stat cards, assets table with View Details buttons,
 * low-stock table, issuances table) so content swaps in without layout
 * shift.
 *
 * Static chrome renders as real text with real classes; only live
 * values are pulse placeholders sized to the real cells.
 */

const STAT_LABELS = [
  "Assets",
  "Stock SKUs",
  "IAR records",
  "PAR / ICS",
  "Deliveries",
  "Inspections",
];

function TextPulse({ className }: { className: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded bg-navy-100 ${className}`}
    />
  );
}

function PillPulse({ className = "w-16" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`h-[22px] animate-pulse rounded-full bg-navy-100 ${className}`}
    />
  );
}

export default function RecordsLoading() {
  return (
    <section
      className={styles.section}
      aria-busy="true"
      aria-label="Loading records"
    >
      <p className={styles.crumb}>Super Admin / Records</p>
      <div>
        <h1 className={styles.title}>Records</h1>
        <p className={styles.subtitle}>
          Registry totals and recent entries across assets, stocks, documents
          and issuances.
        </p>
      </div>

      {/* Stat cards — same 6-up auto-fit grid */}
      <div
        style={{
          display: "grid",
          gap: "0.75rem",
          gridTemplateColumns: "repeat(auto-fit, minmax(9rem, 1fr))",
        }}
        aria-hidden="true"
      >
        {STAT_LABELS.map((label) => (
          <Card key={label} style={{ padding: "1rem" }}>
            <div
              style={{
                fontSize: "0.6875rem",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "var(--color-navy-500)",
              }}
            >
              {label}
            </div>
            <div className="mt-1 h-8 w-16 animate-pulse rounded bg-navy-100" />
          </Card>
        ))}
      </div>

      {/* Recently registered assets — same 6 columns, 5 rows */}
      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>Recently registered assets</h2>
        <p className={styles.panelSub}>
          Newest registry entries · view-only (manage assets under Assets).
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.table} aria-hidden="true">
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
              {Array.from({ length: 5 }).map((_, r) => (
                <tr key={r} style={{ opacity: 1 - r * 0.08 }}>
                  <td>
                    <TextPulse className="h-3.5 w-28" />
                  </td>
                  <td>
                    <TextPulse className="h-3.5 w-20" />
                  </td>
                  <td>
                    <TextPulse className="h-3.5 w-20" />
                  </td>
                  <td>
                    <PillPulse />
                  </td>
                  <td>
                    <TextPulse className="h-3.5 w-20" />
                  </td>
                  <td>
                    <span className={actionStyles.inspectLinkSecondary}>
                      View Details
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Low-stock watchlist — same 3 columns, 5 rows */}
      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>Low-stock watchlist</h2>
        <p className={styles.panelSub}>
          Items at or below reorder threshold.
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.table} aria-hidden="true">
            <thead>
              <tr>
                <th>Item</th>
                <th>On hand</th>
                <th>Level</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, r) => (
                <tr key={r} style={{ opacity: 1 - r * 0.08 }}>
                  <td>
                    <TextPulse className="h-3.5 w-32" />
                  </td>
                  <td>
                    <TextPulse className="h-3.5 w-16" />
                  </td>
                  <td>
                    <PillPulse className="w-20" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Recent PAR / ICS — same 3 columns, 5 rows */}
      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>Recent PAR / ICS</h2>
        <p className={styles.panelSub}>Latest accountability documents.</p>
        <div className={styles.tableWrap}>
          <table className={styles.table} aria-hidden="true">
            <thead>
              <tr>
                <th>Doc</th>
                <th>End user</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, r) => (
                <tr key={r} style={{ opacity: 1 - r * 0.08 }}>
                  <td>
                    <TextPulse className="h-3.5 w-24" />
                  </td>
                  <td>
                    <TextPulse className="h-3.5 w-28" />
                  </td>
                  <td>
                    <TextPulse className="h-3.5 w-20" />
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
