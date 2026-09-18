import { Card } from "@/components/ui/card";
import styles from "../dashboard/page.module.css";
import air from "../inspections/air-section.module.css";

/**
 * Issuances-specific skeleton — mirrors PersonnelIssuancesPage 1:1
 * (crumb, header + Table/Grid toggle, panel with a straight 8-col table,
 * no filter row, no pager) so content swaps in without layout shift.
 * The default view is the table, so the skeleton matches that view.
 *
 * Static chrome renders as real text with real classes; only live
 * values are pulse placeholders sized to the real cells.
 */

const HEADERS = [
  "Doc",
  "No.",
  "Employee",
  "Item",
  "Qty",
  "Total",
  "Date",
  "Report",
] as const;

function TextPulse({ className }: { className: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded bg-navy-100 ${className}`}
    />
  );
}

export default function IssuancesLoading() {
  return (
    <section
      className={styles.section}
      aria-busy="true"
      aria-label="Loading issuances"
    >
      <p className={styles.crumb}>Personnel / Issuances</p>

      {/* Header — same as the real page, including the view toggle */}
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>PAR / ICS Issuances</h1>
          <p className={styles.subtitle} aria-hidden="true">
            <span className="mt-1 block h-4 w-64 animate-pulse rounded bg-navy-100" />
          </p>
        </div>
        <div className={styles.actions} aria-hidden="true">
          <span className={air.tabs}>
            <span className={air.tab} data-active="true">
              Table
            </span>
            <span className={air.tab} data-active={false}>
              Grid
            </span>
          </span>
        </div>
      </div>

      <Card className={styles.panel}>
        {/* Table — same 8 columns, 10 rows */}
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
                    <div className="h-[22px] w-14 animate-pulse rounded-full bg-navy-100" />
                  </td>
                  <td>
                    <TextPulse className="h-3.5 w-20" />
                  </td>
                  <td>
                    <TextPulse className="h-3.5 w-24" />
                  </td>
                  <td>
                    <TextPulse className="h-3.5 w-36" />
                  </td>
                  <td>
                    <TextPulse className="h-3.5 w-8" />
                  </td>
                  <td>
                    <TextPulse className="h-3.5 w-24" />
                  </td>
                  <td>
                    <TextPulse className="h-3.5 w-20" />
                  </td>
                  <td>
                    <span className={styles.inspectLinkSecondary}>
                      View report
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}
