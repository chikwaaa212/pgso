import { Card } from "@/components/ui/card";
import styles from "../dashboard/page.module.css";
import air from "../inspections/air-section.module.css";

/**
 * Documents-specific skeleton — mirrors the default Delivery tab 1:1
 * (crumb, header + type tabs, search, 8-col table, pager) so content
 * swaps in without layout shift.
 *
 * Static chrome renders as real text with real classes; only live
 * values are pulse placeholders sized to the real cells.
 */

const TABS = [
  "Delivery",
  "Inspection",
  "Stocks",
  "Assets",
  "Repairs",
  "IAR Reports",
  "PAR",
  "ICS",
] as const;

const HEADERS = [
  "Ref",
  "Supplier",
  "PO ref",
  "Date delivered",
  "Items",
  "Delivery",
  "Inspection",
  "Receipt",
] as const;

function TextPulse({ className }: { className: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded bg-navy-100 ${className}`}
    />
  );
}

export default function DocumentsLoading() {
  return (
    <section
      className={styles.section}
      aria-busy="true"
      aria-label="Loading documents"
    >
      <p className={styles.crumb}>Personnel / Documents</p>

      {/* Header — same as the real page */}
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Documents</h1>
          <p className={styles.subtitle} aria-hidden="true">
            <span className="mt-1 block h-4 w-48 animate-pulse rounded bg-navy-100" />
          </p>
        </div>
        <div className={styles.actions} aria-hidden="true">
          <div className={air.tabs} role="tablist" aria-label="Document types">
            {TABS.map((t) => (
              <span
                key={t}
                className={air.tab}
                data-active={t === "Delivery"}
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>

      <Card className={styles.panel}>
        {/* Controls — same single search as the real page */}
        <div className={air.controls} aria-hidden="true">
          <div className={`${air.search} h-9 animate-pulse rounded-md bg-navy-100`} />
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
                    <TextPulse className="h-3.5 w-8" />
                  </td>
                  <td>
                    <div className="h-[22px] w-16 animate-pulse rounded-full bg-navy-100" />
                  </td>
                  <td>
                    <div className="h-[22px] w-16 animate-pulse rounded-full bg-navy-100" />
                  </td>
                  <td>
                    <span className={styles.inspectLinkSecondary}>
                      View receipt
                    </span>
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
