import { Card } from "@/components/ui/card";
import styles from "../dashboard/page.module.css";

/**
 * Deliveries-specific skeleton — mirrors PersonnelDeliveriesPage 1:1
 * (crumb, header + actions, panel head, filter row, 7-col table,
 * pager) so content swaps in without layout shift.
 *
 * Static chrome renders as real text with real classes; only live
 * values are pulse placeholders sized to the real cells.
 */

const HEADERS = [
  "PO Ref",
  "Type",
  "Delivery",
  "Inspection",
  "Target Arrival",
  "Logged By",
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

      {/* Header — same as the real page */}
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Deliveries</h1>
        </div>
        <div className={styles.actions} aria-hidden="true">
          <span className={styles.actionSecondary} style={{ height: 24 }}>
            Export (soon)
          </span>
          <span className={styles.actionPrimary} style={{ height: 24 }}>
            Log delivery
          </span>
        </div>
      </div>

      <Card className={styles.panel}>
        <div>
          {/* Search only — status tabs were removed */}
          <div className="mb-3 flex justify-end" aria-hidden="true">
            <input
              type="search"
              disabled
              placeholder="Search supplier, PO, or ID…"
              aria-label="Search deliveries"
              className="h-8 w-80 max-w-full rounded-md border border-navy-300 bg-white px-3 text-sm"
              tabIndex={-1}
            />
          </div>

          {/* Table — same 7 columns, 10 rows (default page size) */}
          <div className={styles.tableWrap}>
            <table className={styles.table} aria-hidden="true">
              <thead>
                <tr>
                  {HEADERS.map((h) => (
                    <th
                      key={h}
                      style={h === "Action" ? { textAlign: "right" } : undefined}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 10 }).map((_, r) => (
                  <tr key={r} style={{ opacity: 1 - r * 0.05 }}>
                    <td>
                      <TextPulse className="h-3.5 w-20" />
                    </td>
                    <td>
                      <PillPulse className="w-14" />
                    </td>
                    <td>
                      <PillPulse />
                    </td>
                    <td>
                      <PillPulse className="w-[70px]" />
                    </td>
                    <td>
                      <TextPulse className="h-3.5 w-20" />
                    </td>
                    <td>
                      <TextPulse className="h-3.5 w-20" />
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1.5">
                        <span className="inline-flex h-6 items-center justify-center rounded-[4px] border border-yellow-500/40 bg-yellow-500/20 px-3 text-xs font-semibold text-navy-900">
                          View Details
                        </span>
                        <span className="inline-flex h-6 items-center justify-center rounded-[4px] border border-yellow-500/40 bg-yellow-500/20 px-3 text-xs font-semibold text-navy-900">
                          Edit
                        </span>
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
