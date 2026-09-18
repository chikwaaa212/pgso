import { Card } from "@/components/ui/card";
import styles from "../dashboard/page.module.css";
import air from "../inspections/air-section.module.css";

/**
 * Inventory-specific skeleton — mirrors the Stocks page 1:1 (crumb,
 * header + actions, stat tiles, controls, 8-col table, pager) so
 * content swaps in without layout shift.
 *
 * Static chrome renders as real text with real classes; only live
 * values are pulse placeholders sized to the real cells.
 */

const HEADERS = [
  "Item",
  "Account code",
  "Type",
  "Quantity",
  "Unit",
  "Unit cost",
  "Location",
  "Stock level",
] as const;

function TextPulse({ className }: { className: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded bg-navy-100 ${className}`}
    />
  );
}

export default function InventoryLoading() {
  return (
    <section
      className={styles.section}
      aria-busy="true"
      aria-label="Loading stocks"
    >
      <p className={styles.crumb}>Personnel / Inventory</p>

      {/* Header — same as the real page */}
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Stocks</h1>
          <p className={styles.subtitle} aria-hidden="true">
            <span className="mt-1 block h-4 w-48 animate-pulse rounded bg-navy-100" />
          </p>
        </div>
        <div className={styles.actions} aria-hidden="true">
          <span className="inline-flex h-8 items-center justify-center rounded-[4px] border border-navy-200 bg-white px-3.5 text-xs font-semibold text-navy-700">
            Sync from inspections
          </span>
          <span className="inline-flex h-8 items-center justify-center rounded-[4px] bg-navy-900 px-3.5 text-xs font-semibold text-white">
            Add stock
          </span>
        </div>
      </div>

      {/* Stat tiles — same 3-col layout */}
      <div className={air.stats} aria-hidden="true">
        {["Items tracked", "Total units on hand", "Low / critical items"].map(
          (label) => (
            <div key={label} className={air.stat}>
              <p className={air.statValue}>
                <span className="block h-7 w-12 animate-pulse rounded bg-navy-100" />
              </p>
              <p className={air.statLabel}>{label}</p>
            </div>
          )
        )}
      </div>

      <Card className={styles.panel}>
        {/* Delivery-type tabs */}
        <div
          className={styles.filterBtns}
          role="group"
          aria-label="Filter by delivery type"
          style={{ marginBottom: '0.75rem' }}
        >
          {["All", "Stocks", "Assets"].map((t, i) => (
            <span
              key={t}
              className={styles.filterBtn}
              data-active={i === 0}
              aria-hidden="true"
            >
              {t}
            </span>
          ))}
        </div>
        {/* Controls — search + 2 filter selects */}
        <div className={air.controls} aria-hidden="true">
          <div className={`${air.search} h-9 animate-pulse rounded-md bg-navy-100`} />
          <div className="h-9 w-44 animate-pulse rounded-md bg-navy-100" />
          <div className="h-9 w-40 animate-pulse rounded-md bg-navy-100" />
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
                    <TextPulse className="h-3.5 w-28" />
                  </td>
                  <td>
                    <TextPulse className="h-3.5 w-20" />
                  </td>
                  <td>
                    <div className="h-[22px] w-14 animate-pulse rounded-full bg-navy-100" />
                  </td>
                  <td>
                    <TextPulse className="h-3.5 w-10" />
                  </td>
                  <td>
                    <TextPulse className="h-3.5 w-10" />
                  </td>
                  <td>
                    <TextPulse className="h-3.5 w-16" />
                  </td>
                  <td>
                    <TextPulse className="h-3.5 w-24" />
                  </td>
                  <td>
                    <div className="h-[22px] w-20 animate-pulse rounded-full bg-navy-100" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pager — same structure as TablePager */}
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
      </Card>
    </section>
  );
}
