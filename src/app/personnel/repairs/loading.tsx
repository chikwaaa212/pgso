import { Card } from "@/components/ui/card";
import styles from "../dashboard/page.module.css";
import stockStyles from "../stocks/page.module.css";
import air from "../inspections/air-section.module.css";
import rep from "./page.module.css";

/**
 * Repairs-specific skeleton — mirrors PersonnelRepairsPage 1:1 (header +
 * yellow action, four summary tiles in one row, status tabs, toolbar,
 * 7-column table, footer) so content swaps in without layout shift.
 *
 * Static chrome renders with the real classes; only live values are pulse
 * placeholders sized to the real cells.
 */

const STATUS_TABS = ["All", "Pending", "In progress", "Completed"] as const;

const STATS = [
  "Total tickets",
  "Pending",
  "In progress",
  "Completed",
] as const;

/** Exactly the columns the real table renders (see page.tsx). */
const HEADERS = [
  "Asset",
  "Reported by",
  "Issue",
  "Cost",
  "Progress",
  "Details",
  "Action",
] as const;

const YELLOW_BTN =
  "inline-flex h-6 items-center justify-center gap-1.5 rounded-[4px] border border-yellow-500 bg-yellow-500 px-3 text-xs font-semibold text-navy-900";

function TextPulse({ className }: { className: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded bg-navy-100 ${className}`}
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
      {/* Header — same as the real page */}
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Repairs</h1>
          <p className={styles.subtitle} aria-hidden="true">
            Only the repair tickets you logged, in one place.
          </p>
        </div>
        <div className={styles.actions} aria-hidden="true">
          <span className={YELLOW_BTN}>
            <span className="block h-[13px] w-[13px] animate-pulse rounded-[2px] bg-navy-300" />
            New repair
          </span>
        </div>
      </div>

      {/* Four summary tiles in one row */}
      <div className={rep.summary} aria-hidden="true">
        {STATS.map((label) => (
          <div key={label} className={stockStyles.summaryCard}>
            <span
              className={`${stockStyles.summaryIcon} animate-pulse`}
              aria-hidden="true"
            />
            <div className={stockStyles.summaryBody}>
              <p className={stockStyles.summaryLabel}>{label}</p>
              <TextPulse className="h-7 w-12" />
              <TextPulse className="h-[1.125rem] w-32" />
            </div>
          </div>
        ))}
      </div>

      {/* Status tabs above the panel */}
      <div className={rep.tabsRow} aria-hidden="true">
        <div className={air.tabs} role="tablist" aria-label="Filter by status">
          {STATUS_TABS.map((t) => (
            <span key={t} className={air.tab} data-active={t === "All"}>
              {t}
            </span>
          ))}
        </div>
      </div>

      <Card className={stockStyles.panel}>
        {/* Toolbar — info line left, search right */}
        <div className={stockStyles.toolbar} aria-hidden="true">
          <p className={stockStyles.toolbarInfo}>
            <span className="block h-[1.125rem] w-40 animate-pulse rounded bg-navy-100" />
          </p>
          <div className={stockStyles.filters}>
            <span className="block h-8 w-72 animate-pulse rounded-md bg-navy-100" />
          </div>
        </div>

        {/* Table — same 7 columns and 10 rows (PAGE_SIZE) as the real page */}
        <div className={styles.tableWrap}>
          <table className={styles.table} aria-hidden="true">
            <thead>
              <tr>
                {HEADERS.map((h) => (
                  <th
                    key={h}
                    className={h === "Action" ? rep.actionHeader : undefined}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 10 }).map((_, r) => (
                <tr key={r}>
                  <td className={rep.assetCell}>
                    <TextPulse className="h-3.5 w-36" />
                  </td>
                  <td>
                    <TextPulse className="h-3.5 w-24" />
                  </td>
                  <td className={rep.issueCell}>
                    <TextPulse className="h-3.5 w-48" />
                  </td>
                  <td className={rep.costCell}>
                    <TextPulse className="h-3.5 w-20" />
                  </td>
                  <td>
                    <div className="h-[22px] w-20 animate-pulse rounded-full bg-navy-100" />
                  </td>
                  <td>
                    <span className="block h-6 w-24 animate-pulse rounded-[4px] bg-navy-100" />
                  </td>
                  <td className={rep.actionCell}>
                    <span className="ml-auto block h-6 w-24 animate-pulse rounded-[4px] bg-navy-100" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer — same position as the real pager / "showing all" line */}
        <div className={stockStyles.footer} aria-hidden="true">
          <span className="block h-[1.125rem] w-36 animate-pulse rounded bg-navy-100" />
        </div>
      </Card>
    </section>
  );
}
