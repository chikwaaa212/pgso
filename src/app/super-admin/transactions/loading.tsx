import { Card } from "@/components/ui/card";
import styles from "./page.module.css";
import ui from "@/components/personnel/personnel-ui.module.css";

/**
 * Super-admin transactions skeleton — mirrors SuperAdminTransactionsPage:
 * header with live counts, five summary tiles, then one tabbed panel whose
 * table swaps to the active transaction stream. Static chrome renders as
 * real text and real classes; only live values pulse.
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
      <header className={ui.header}>
        <div className={ui.headerText}>
          <span className={ui.eyebrow}>
            <span className={ui.eyebrowDot} aria-hidden="true" />
            Operations ledger
          </span>
          <div className={ui.titleRow}>
            <h1 className={ui.title}>Transactions</h1>
          </div>
          <p className={ui.subtitle}>
            Every delivery, employee request, repair ticket and PAR/ICS issued
            across the province — inspect any record in a read-only overlay.
          </p>
          <p className={ui.meta}>
            <span
              aria-hidden="true"
              className="inline-block h-3.5 w-72 animate-pulse rounded bg-navy-100 align-middle"
            />
          </p>
        </div>
        <div className={ui.headerActions}>
          <span className="h-6 w-24 animate-pulse rounded-[4px] bg-navy-100" />
        </div>
      </header>

      {/* Summary tiles */}
      <div className={ui.tiles} aria-hidden="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={ui.tile}>
            <span className={ui.tileIcon}>
              <span className="h-4 w-4 animate-pulse rounded bg-navy-200" />
            </span>
            <div className={ui.tileBody}>
              <TextPulse className="h-3 w-24" />
              <TextPulse className="mt-1 h-6 w-12" />
              <TextPulse className="mt-1 h-3 w-32" />
            </div>
          </div>
        ))}
      </div>

      <Card className={styles.panel} aria-hidden="true">
        <div className={styles.panelHead}>
          <div className={styles.tabs}>
            {Array.from({ length: 4 }).map((_, i) => (
              <span
                key={i}
                className="h-8 w-28 animate-pulse rounded-[4px] bg-navy-100"
              />
            ))}
          </div>
          <span className="h-8 w-72 animate-pulse rounded-[4px] bg-navy-100" />
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Reference</th>
                <th>Detail</th>
                <th>Date</th>
                <th>Status</th>
                <th>Inspection</th>
                <th className={styles.actionHead}>Details</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }).map((_, r) => (
                <tr key={r} style={{ opacity: 1 - r * 0.08 }}>
                  <RowPulse
                    cols={[
                      <TextPulse key="a" className="h-3.5 w-36" />,
                      <TextPulse key="b" className="h-3.5 w-24" />,
                      <TextPulse key="c" className="h-3.5 w-20" />,
                      <PillPulse key="st" />,
                      <PillPulse key="ir" />,
                      <div key="bt" className="flex justify-end">
                        <TextPulse className="h-6 w-20" />
                      </div>,
                    ]}
                  />
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={styles.panelFoot}>
          <TextPulse className="h-3 w-48" />
          <TextPulse className="h-3 w-40" />
        </div>
      </Card>
    </section>
  );
}
