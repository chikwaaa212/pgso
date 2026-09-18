import { Card } from "@/components/ui/card";
import styles from "../dashboard/page.module.css";
import air from "../inspections/air-section.module.css";

/**
 * Requests-specific skeleton — mirrors PersonnelRequestsPage 1:1
 * (crumb, header + action, status tabs + search + type filter, 9-col
 * table, pager) so content swaps in without layout shift.
 *
 * Static chrome renders as real text with real classes; only live
 * values are pulse placeholders sized to the real cells.
 */

const STATUS_TABS = [
  "All",
  "Pending",
  "Approved",
  "Rejected",
  "Completed",
] as const;

const HEADERS = [
  "Employee",
  "To",
  "Type",
  "Asset",
  "Description",
  "Requested",
  "Resolved",
  "Status",
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

export default function RequestsLoading() {
  return (
    <section
      className={styles.section}
      aria-busy="true"
      aria-label="Loading requests"
    >
      <p className={styles.crumb}>Personnel / Requests</p>

      {/* Header — same as the real page */}
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Requests</h1>
          <p className={styles.subtitle} aria-hidden="true">
            <span className="mt-1 block h-4 w-56 animate-pulse rounded bg-navy-100" />
          </p>
        </div>
        <div className={styles.actions} aria-hidden="true">
          <span className="inline-flex h-8 items-center justify-center gap-2 rounded-[4px] bg-navy-900 px-3.5 text-xs font-semibold text-white">
            New request
          </span>
        </div>
      </div>

      <Card className={styles.panel}>
        {/* Controls — status tabs + search + type filter */}
        <div className={air.controls}>
          <div
            className={air.tabs}
            role="tablist"
            aria-label="Filter by status"
            aria-hidden="true"
          >
            {STATUS_TABS.map((t) => (
              <span
                key={t}
                className={air.tab}
                data-active={t === "All"}
              >
                {t}
              </span>
            ))}
          </div>
          <div
            className={`${air.search} h-9 animate-pulse rounded-md bg-navy-100`}
            aria-hidden="true"
          />
          <div
            className="h-9 w-44 animate-pulse rounded-md bg-navy-100"
            aria-hidden="true"
          />
        </div>

        {/* Table — same 9 columns, 10 rows (default page size) */}
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
                    <TextPulse className="h-3.5 w-24" />
                  </td>
                  <td>
                    <TextPulse className="h-3.5 w-20" />
                  </td>
                  <td>
                    <TextPulse className="h-3.5 w-24" />
                  </td>
                  <td>
                    <TextPulse className="h-3.5 w-28" />
                  </td>
                  <td>
                    <TextPulse className="h-3.5 w-36" />
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
                    <div className="flex items-center gap-1.5">
                      <span className={styles.inspectLink}>Approve</span>
                      <span className={styles.inspectLinkSecondary}>
                        Reject
                      </span>
                    </div>
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
