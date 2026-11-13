import { Card } from "@/components/ui/card";
import { PAGE_SIZE } from "@/lib/constants";
import styles from "../dashboard/page.module.css";
import air from "./air-section.module.css";

/**
 * Inspections-specific skeleton — mirrors the Inspections tab 1:1
 * (header + section tabs, filter/search row, 6-col table with the same row
 * action buttons, pager) so content swaps in without layout shift.
 *
 * Static chrome renders as real text with real classes; only live values are
 * pulse placeholders sized to the real cells.
 */

const HEADERS = [
  "PO ref",
  "Supplier",
  "Target arrival",
  "Date inspected",
  "Result",
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

export default function InspectionsLoading() {
  return (
    <section
      className={styles.section}
      aria-busy="true"
      aria-label="Loading inspections"
    >
      {/* Header — same as the real page */}
      <div className={styles.headerRow}>
        <h1 className={styles.title}>Inspections</h1>
        <div className={styles.actions} aria-hidden="true">
          <div className={air.tabs} role="tablist" aria-label="Inspections sections">
            <span className={air.tab} data-active="true">
              Inspections
            </span>
            <span className={air.tab} data-active="false">
              AIR / IAR
            </span>
          </div>
        </div>
      </div>

      <Card className={styles.panel}>
        {/* Filter + search row — same as the real page */}
        <div className="mb-3 flex flex-wrap items-center justify-end gap-2" aria-hidden="true">
          <span className="h-8 w-48 animate-pulse rounded-md bg-navy-100" />
          <input
            type="search"
            disabled
            placeholder="Search supplier, PO, inspector, or ref…"
            aria-label="Search inspections"
            className="h-8 w-80 max-w-full rounded-md border border-navy-300 bg-white px-3 text-sm"
            tabIndex={-1}
          />
        </div>

        {/* Table — same 6 columns and row actions */}
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
              {Array.from({ length: PAGE_SIZE }).map((_, r) => (
                <tr key={r} style={{ opacity: 1 - r * 0.04 }}>
                  <td>
                    <TextPulse className="h-3.5 w-20" />
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
                    <div className="h-[22px] w-16 animate-pulse rounded-full bg-navy-100" />
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-1.5">
                      <span className="inline-flex h-6 items-center justify-center rounded-[4px] border border-yellow-500/40 bg-yellow-500/20 px-3 text-xs font-semibold text-navy-900">
                        Edit
                      </span>
                      <span className="inline-flex h-6 items-center justify-center rounded-[4px] border border-yellow-500 bg-yellow-500 px-3 text-xs font-semibold text-navy-900">
                        Inspect
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pager — same structure as the real page */}
        <div className={styles.pager} aria-hidden="true">
          <span className={styles.pagerInfo}>
            <span className="block h-3 w-36 animate-pulse rounded bg-navy-100" />
          </span>
          <div className={styles.pagerControls}>
            <span className={styles.pageBtn}>‹</span>
            <span className={styles.pageBtn} data-active="true">
              1
            </span>
            <span className={styles.pageBtn}>›</span>
          </div>
        </div>
      </Card>
    </section>
  );
}