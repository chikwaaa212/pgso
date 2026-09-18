import { Card } from "@/components/ui/card";
import styles from "../dashboard/page.module.css";
import air from "../inspections/air-section.module.css";
import rep from "./page.module.css";

/**
 * Repairs-specific skeleton — mirrors PersonnelRepairsPage 1:1
 * (crumb, header + action, 4 stat cards, status tabs + search,
 * action legend, 10-col table, pager) so content swaps in without
 * layout shift.
 *
 * Static chrome renders as real text with real classes; only live
 * values are pulse placeholders sized to the real cells.
 */

const STATUS_TABS = ["All", "Pending", "In progress", "Completed"] as const;

const LEGEND = [
  "Start repair",
  "Complete repair",
  "Reopen repair",
  "Edit ticket",
  "View receipt",
] as const;

const STATS = [
  "Total tickets",
  "Pending",
  "In progress",
  "Completed",
] as const;

const HEADERS = [
  "Asset",
  "Reported by",
  "Issue",
  "Technician",
  "Repair date",
  "Cost",
  "Progress",
  "Logged",
  "Receipt",
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

export default function RepairsLoading() {
  return (
    <section
      className={styles.section}
      aria-busy="true"
      aria-label="Loading repairs"
    >
      <p className={styles.crumb}>Personnel / Repairs</p>

      {/* Header — same as the real page */}
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Repairs</h1>
          <p className={styles.subtitle} aria-hidden="true">
            <span className="mt-1 block h-4 w-56 animate-pulse rounded bg-navy-100" />
          </p>
        </div>
        <div className={styles.actions} aria-hidden="true">
          <span className="inline-flex h-8 items-center justify-center gap-2 rounded-[4px] bg-navy-900 px-3.5 text-xs font-semibold text-white">
            New repair
          </span>
        </div>
      </div>

      {/* Stats — same 4 cards, same air.stats grid position */}
      <div className={air.stats} aria-hidden="true">
        {STATS.map((label) => (
          <div key={label} className={air.stat}>
            <TextPulse className="h-7 w-12" />
            <p className={air.statLabel}>{label}</p>
          </div>
        ))}
      </div>

      <Card className={styles.panel}>
        {/* Controls — status tabs + search, same air.controls row */}
        <div className={air.controls}>
          <div
            className={air.tabs}
            role="tablist"
            aria-label="Filter by status"
            aria-hidden="true"
          >
            {STATUS_TABS.map((t) => (
              <span key={t} className={air.tab} data-active={t === "All"}>
                {t}
              </span>
            ))}
          </div>
          <div
            className={`${air.search} h-9 animate-pulse rounded-md bg-navy-100`}
            aria-hidden="true"
          />
        </div>

        {/* Legend — same row position as the real page. NOTE: no lucide
            imports here — loading.tsx is a Server Component and the
            installed lucide-react entry is client-only. The tiles below
            are same-size static placeholders so positions still match. */}
        <div className={rep.legend} aria-label="Row actions legend">
          {LEGEND.map((label) => (
            <span key={label} className={rep.legendItem}>
              <span className={rep.legendIcon} aria-hidden="true" />
              {label}
            </span>
          ))}
        </div>

        {/* Table — same 10 columns, 10 rows (default page size) */}
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
                    <TextPulse className="h-3.5 w-24" />
                  </td>
                  <td>
                    <TextPulse className="h-3.5 w-36" />
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
                    <TextPulse className="h-3.5 w-20" />
                  </td>
                  <td>
                    <span className={rep.iconBtn} aria-hidden="true" />
                  </td>
                  <td>
                    <div className="flex items-center gap-1.5">
                      <span className={rep.iconBtn} aria-hidden="true" />
                      <span className={rep.iconBtn} aria-hidden="true" />
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
