import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import styles from "./page.module.css";
import tableStyles from "../users/page.module.css";
import actionStyles from "@/app/personnel/dashboard/page.module.css";

/**
 * Super-admin repairs skeleton — mirrors SuperAdminRepairsPage 1:1
 * (crumb, header, right-aligned search, 7-col table with status pills
 * and View Details buttons, pager) so content swaps in without layout
 * shift.
 *
 * Static chrome renders as real text with the real classes; only live
 * values are pulse placeholders sized to the real cells. Same pattern
 * as the personnel repairs skeleton.
 */

const HEADERS = [
  "Asset / issue",
  "Reported by",
  "Technician",
  "Date",
  "Cost",
  "Status",
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

function PillPulse({ className = "w-16" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`h-[22px] animate-pulse rounded-full bg-navy-100 ${className}`}
    />
  );
}

export default function RepairsLoading() {
  return (
    <section
      className={styles.section}
      aria-busy="true"
      aria-label="Loading repairs"
    >
      <p className={styles.crumb}>Super Admin / Repairs</p>
      <div>
        <h1 className={styles.title}>Repairs</h1>
        <p className={styles.subtitle}>
          <span
            aria-hidden="true"
            className="inline-block h-4 w-40 animate-pulse rounded bg-navy-100 align-middle"
          />{" "}
          repair tickets · read-only
        </p>
      </div>

      <Card className={styles.panel}>
        <div>
          {/* Search — same right-aligned row as the real table */}
          <div className={tableStyles.searchRow} aria-hidden="true">
            <Input
              type="search"
              disabled
              placeholder="Search asset, reporter, technician…"
              aria-label="Search records"
              tabIndex={-1}
            />
          </div>

          {/* Table — same 7 columns, 10 rows (default page size) */}
          <div className={tableStyles.tableWrap}>
            <table className={tableStyles.table} aria-hidden="true">
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
                      <TextPulse className="h-3.5 w-40" />
                      <TextPulse className="mt-1.5 h-3 w-28" />
                    </td>
                    <td>
                      <TextPulse className="h-3.5 w-24" />
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
                      <PillPulse />
                    </td>
                    <td>
                      <span className={actionStyles.inspectLinkSecondary}>
                        View Details
                      </span>
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
        </div>
      </Card>
    </section>
  );
}
