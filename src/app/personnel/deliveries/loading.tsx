import { Card } from "@/components/ui/card";
import styles from "../dashboard/page.module.css";

/**
 * Deliveries-specific skeleton — mirrors PersonnelDeliveriesPage 1:1
 * (crumb, header + actions, panel head, filter row, 8-col table,
 * pager) so content swaps in without layout shift.
 *
 * Static chrome renders as real text with real classes; only live
 * values are pulse placeholders sized to the real cells.
 */

const FILTERS = ["All", "Complete", "Partial", "Awaiting arrival"] as const;

const HEADERS = [
  "ID",
  "Supplier",
  "PO ref",
  "Date",
  "Target arrival",
  "Type",
  "Items",
  "Delivery",
  "Inspection",
  "Action",
] as const;

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

export default function DeliveriesLoading() {
  return (
    <section
      className={styles.section}
      aria-busy="true"
      aria-label="Loading deliveries"
    >
      <p className={styles.crumb}>Personnel / Deliveries</p>

      {/* Header — same as the real page */}
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Deliveries</h1>
          <p className={styles.subtitle} aria-hidden="true">
            <span className="mt-1 block h-4 w-32 animate-pulse rounded bg-navy-100" />
          </p>
        </div>
        <div className={styles.actions} aria-hidden="true">
          <span className={styles.actionSecondary}>Export (soon)</span>
          <span className={styles.actionPrimary}>Log delivery</span>
        </div>
      </div>

      <Card className={styles.panel}>
        <div>
          <h2 className={styles.panelTitle}>Delivery log</h2>
          <p className={styles.panelSub}>
            Your logged deliveries only — other personnel&apos;s records are
            hidden.
          </p>
        </div>

        <div>
          {/* Filter row — same layout, same controls */}
          <div className={styles.filterRow} aria-hidden="true">
            <div
              className={styles.filterBtns}
              role="group"
              aria-label="Filter by delivery status"
            >
              {FILTERS.map((f) => (
                <span
                  key={f}
                  className={styles.filterBtn}
                  data-active={f === "All"}
                >
                  {f}
                </span>
              ))}
            </div>
            <input
              type="search"
              disabled
              placeholder="Search supplier, PO, or ID…"
              aria-label="Search deliveries"
              className={styles.addInput}
              tabIndex={-1}
            />
          </div>

          {/* Table — same 8 columns, 10 rows (default page size) */}
          <div className={styles.tableWrap}>
            <table className={styles.table} aria-hidden="true">
              <thead>
                <tr>
                  {HEADERS.map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 10 }).map((_, r) => (
                  <tr key={r} style={{ opacity: 1 - r * 0.05 }}>
                    <td>
                      <TextPulse className="h-3.5 w-16" />
                    </td>
                    <td>
                      <TextPulse className="h-3.5 w-24" />
                    </td>
                    <td>
                      <TextPulse className="h-3.5 w-20" />
                    </td>
                    <td>
                      <TextPulse className="h-3.5 w-20" />
                    </td>
                    <td>
                      <TextPulse className="h-3.5 w-20" />
                    </td>
                    <td>
                      <PillPulse className="w-14" />
                    </td>
                    <td>
                      <TextPulse className="h-3.5 w-8" />
                    </td>
                    <td>
                      <PillPulse />
                    </td>
                    <td>
                      <PillPulse className="w-[70px]" />
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <span className={styles.inspectLinkSecondary}>
                          View Details
                        </span>
                        <span className={styles.inspectLink}>Inspect</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pager — same structure as DeliveryTable */}
          <div className={styles.pager} aria-hidden="true">
            <span className={styles.pagerInfo}>
              <span className="block h-3 w-36 animate-pulse rounded bg-navy-100" />
            </span>
            <div className={styles.pagerControls}>
              <span className={styles.pageSizeWrap}>
                <span>Rows</span>
                <span className="h-8 w-[5.5rem] animate-pulse rounded-md bg-navy-100" />
              </span>
              <span className={styles.pageBtn} aria-hidden="true">
                ‹
              </span>
              <span className={styles.pageBtn} data-active="true">
                1
              </span>
              <span className={styles.pageBtn} aria-hidden="true">
                ›
              </span>
            </div>
          </div>
        </div>
      </Card>
    </section>
  );
}
