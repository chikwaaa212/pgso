import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import styles from "./page.module.css";
import actionStyles from "@/app/personnel/dashboard/page.module.css";
import air from "@/app/personnel/inspections/air-section.module.css";

/**
 * Super-admin logs skeleton — mirrors SuperAdminLogsPage 1:1 (crumb,
 * header, right-aligned search + module dropdown, 5-col table, pager)
 * so content swaps in without layout shift.
 *
 * Static chrome renders as real text with the real classes; only live
 * values are pulse placeholders sized to the real cells. Same pattern
 * as the personnel logs skeleton.
 */

const HEADERS = ["When", "User", "Module", "Action", "Purpose / summary"] as const;

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
      aria-label="Loading logs"
    >
      <p className={styles.crumb}>Super Admin / Logs</p>
      <div>
        <h1 className={styles.title}>System Logs</h1>
        <p className={styles.subtitle}>
          <span
            aria-hidden="true"
            className="inline-block h-4 w-40 animate-pulse rounded bg-navy-100 align-middle"
          />{" "}
          entries across all users — newest first.
        </p>
      </div>

      <Card className={styles.panel}>
        {/* Controls — same right-aligned search + module dropdown */}
        <div className={air.controls} aria-hidden="true">
          <Input
            type="search"
            disabled
            placeholder="Search action, user, module…"
            aria-label="Search logs"
            tabIndex={-1}
            className={air.search}
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
                    <TextPulse className="h-3.5 w-32" />
                  </td>
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
                    <TextPulse className="h-3.5 w-full" />
                    <TextPulse className="mt-1.5 h-3 w-2/3" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pager — same structure as TablePager */}
        <div className={actionStyles.pager} aria-hidden="true">
          <span className={actionStyles.pagerInfo}>
            <span className="block h-3 w-36 animate-pulse rounded bg-navy-100" />
          </span>
          <div className={actionStyles.pagerControls}>
            <span className={actionStyles.pageSizeWrap}>
              <span>Rows</span>
              <span className="h-8 w-[5.5rem] animate-pulse rounded-md bg-navy-100" />
            </span>
            <span className={actionStyles.pageBtn} aria-hidden="true">
              ‹
            </span>
            <span className={actionStyles.pageBtn} data-active="true">
              1
            </span>
            <span className={actionStyles.pageBtn} aria-hidden="true">
              ›
            </span>
          </div>
        </div>
      </Card>
    </section>
  );
}
