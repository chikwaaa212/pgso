import { Card } from "@/components/ui/card";
import styles from "./page.module.css";
import actionStyles from "@/app/personnel/dashboard/page.module.css";

/**
 * Super-admin transactions skeleton — mirrors SuperAdminTransactionsPage
 * 1:1 (crumb, header with stat counts, 4 panels: 6-col deliveries with
 * View Details buttons, 4-col requests, 5-col repairs with View Details
 * buttons, 4-col issuances with View buttons) so content swaps in
 * without layout shift.
 *
 * Static chrome renders as real text with real classes; only live
 * values are pulse placeholders sized to the real cells.
 */

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

function RowPulse({ cols }: { cols: React.ReactNode[] }) {
  return (
    <>
      {cols.map((c, i) => (
        <td key={i}>{c}</td>
      ))}
    </>
  );
}

export default function TransactionsLoading() {
  return (
    <section
      className={styles.section}
      aria-busy="true"
      aria-label="Loading transactions"
    >
      <p className={styles.crumb}>Super Admin / Transactions</p>
      <div>
        <h1 className={styles.title}>Transactions</h1>
        <p className={styles.subtitle}>
          <span
            aria-hidden="true"
            className="inline-block h-4 w-64 animate-pulse rounded bg-navy-100 align-middle"
          />{" "}
          · view-only oversight
        </p>
      </div>

      {/* Recent deliveries — same 6 columns, 5 rows */}
      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>Recent deliveries</h2>
        <p className={styles.panelSub}>
          Newest first. Open a row to see the full delivery record.
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.table} aria-hidden="true">
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
              {Array.from({ length: 5 }).map((_, r) => (
                <tr key={r} style={{ opacity: 1 - r * 0.08 }}>
                  <RowPulse
                    cols={[
                      <TextPulse key="s" className="h-3.5 w-24" />,
                      <TextPulse key="p" className="h-3.5 w-20" />,
                      <TextPulse key="d" className="h-3.5 w-20" />,
                      <PillPulse key="st" />,
                      <PillPulse key="i" />,
                      <span
                        key="b"
                        className={actionStyles.inspectLinkSecondary}
                      >
                        View Details
                      </span>,
                    ]}
                  />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Recent employee requests — same 5 columns, 5 rows */}
      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>Recent employee requests</h2>
        <p className={styles.panelSub}>
          Transfer, new-assignment and repair requests.
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.table} aria-hidden="true">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Type</th>
                <th>Date</th>
                <th>Status</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, r) => (
                <tr key={r} style={{ opacity: 1 - r * 0.08 }}>
                  <RowPulse
                    cols={[
                      <TextPulse key="e" className="h-3.5 w-24" />,
                      <TextPulse key="t" className="h-3.5 w-20" />,
                      <TextPulse key="d" className="h-3.5 w-20" />,
                      <PillPulse key="st" />,
                      <span
                        key="b"
                        className={actionStyles.inspectLinkSecondary}
                      >
                        View Details
                      </span>,
                    ]}
                  />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Recent repairs — same 5 columns, 5 rows */}
      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>Recent repairs</h2>
        <p className={styles.panelSub}>Repair tickets and technicians.</p>
        <div className={styles.tableWrap}>
          <table className={styles.table} aria-hidden="true">
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
              {Array.from({ length: 5 }).map((_, r) => (
                <tr key={r} style={{ opacity: 1 - r * 0.08 }}>
                  <RowPulse
                    cols={[
                      <TextPulse key="a" className="h-3.5 w-40" />,
                      <TextPulse key="t" className="h-3.5 w-24" />,
                      <TextPulse key="d" className="h-3.5 w-20" />,
                      <PillPulse key="st" />,
                      <span
                        key="b"
                        className={actionStyles.inspectLinkSecondary}
                      >
                        View Details
                      </span>,
                    ]}
                  />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Recent PAR / ICS issuances — same 4 columns, 5 rows */}
      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>Recent PAR / ICS issuances</h2>
        <p className={styles.panelSub}>
          Accountability documents issued to end users.
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.table} aria-hidden="true">
            <thead>
              <tr>
                <th>Doc</th>
                <th>End user</th>
                <th>Date</th>
                <th>Report</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, r) => (
                <tr key={r} style={{ opacity: 1 - r * 0.08 }}>
                  <RowPulse
                    cols={[
                      <TextPulse key="d" className="h-3.5 w-24" />,
                      <TextPulse key="e" className="h-3.5 w-24" />,
                      <TextPulse key="dt" className="h-3.5 w-20" />,
                      <span
                        key="b"
                        className={actionStyles.inspectLinkSecondary}
                      >
                        View report
                      </span>,
                    ]}
                  />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}
