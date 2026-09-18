import { Card } from "@/components/ui/card";
import styles from "../dashboard/page.module.css";
import air from "../inspections/air-section.module.css";

/**
 * Logs-specific skeleton — mirrors PersonnelLogsPage 1:1
 * (crumb, header with no actions, panel head, search + module filter,
 * 5-col table, pager) so content swaps in without layout shift.
 *
 * Static chrome renders as real text with real classes; only live
 * values are pulse placeholders sized to the real cells.
 */

const HEADERS = ["Action", "Module", "Purpose", "Details", "Timestamp"] as const;

function TextPulse({ className }: { className: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded bg-navy-100 ${className}`}
    />
  );
}

export default function LogsLoading() {
  return (
    <section
      className={styles.section}
      aria-busy="true"
      aria-label="Loading activity logs"
    >
      <p className={styles.crumb}>Personnel / Logs</p>

      {/* Header — same as the real page (no actions row) */}
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>My Activity Logs</h1>
          <p className={styles.subtitle} aria-hidden="true">
            <span className="mt-1 block h-4 w-48 animate-pulse rounded bg-navy-100" />
          </p>
        </div>
      </div>

      <Card className={styles.panel}>
        <div>
          <h2 className={styles.panelTitle}>Audit trail</h2>
          <p className={styles.panelSub}>
            Every action you take is recorded with its module, purpose, and
            timestamp.
          </p>
        </div>

        <div>
          {/* Controls — same layout as LogsTable (search + module filter) */}
          <div className={air.controls} aria-hidden="true">
            <div
              className={`${air.search} h-9 animate-pulse rounded-md bg-navy-100`}
            />
            <div className="h-9 w-44 animate-pulse rounded-md bg-navy-100" />
          </div>

          {/* Table — same 5 columns, 10 rows (default page size) */}
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
                      <div className="h-[22px] w-24 animate-pulse rounded-full bg-navy-100" />
                    </td>
                    <td>
                      <TextPulse className="h-3.5 w-16" />
                    </td>
                    <td>
                      <TextPulse className="h-3.5 w-32" />
                    </td>
                    <td>
                      <TextPulse className="h-3.5 w-36" />
                    </td>
                    <td>
                      <TextPulse className="h-3.5 w-28" />
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
        </div>
      </Card>
    </section>
  );
}
