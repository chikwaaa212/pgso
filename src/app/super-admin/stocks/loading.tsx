import { Card } from "@/components/ui/card";
import styles from "./page.module.css";
import actionStyles from "@/app/personnel/dashboard/page.module.css";

/**
 * Super-admin inventory skeleton — mirrors SuperAdminInventoryPage 1:1
 * (header, four summary tiles, alert banner slot, toolbar, 6-col ledger
 * with the exact threshold inputs + Set buttons, pager) so content swaps
 * in without layout shift.
 */

const HEADERS = [
  "Item",
  "On hand",
  "Unit cost",
  "Status",
  "Reorder threshold",
  "Recommendation",
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

function TilePulse() {
  return (
    <div className={styles.summaryCard}>
      <span
        aria-hidden="true"
        className="h-8 w-8 shrink-0 animate-pulse rounded-[4px] bg-navy-100"
      />
      <div className="flex min-w-0 flex-col gap-1.5">
        <TextPulse className="h-3 w-20" />
        <TextPulse className="h-5 w-12" />
        <TextPulse className="h-3 w-28" />
      </div>
    </div>
  );
}

export default function InventoryLoading() {
  return (
    <section
      className={styles.section}
      aria-busy="true"
      aria-label="Loading inventory"
    >
      <div>
        <h1 className={styles.title}>Stocks</h1>
        <p className={styles.subtitle}>
          <span
            aria-hidden="true"
            className="inline-block h-4 w-32 animate-pulse rounded bg-navy-100 align-middle"
          />{" "}
          stock lines · reorder thresholds are set by the Administrator
        </p>
      </div>

      <div className={styles.summary} aria-hidden="true">
        <TilePulse />
        <TilePulse />
        <TilePulse />
        <TilePulse />
      </div>

      <div className={styles.banner} aria-hidden="true">
        <span
          className="h-8 w-8 shrink-0 animate-pulse rounded-[4px] bg-navy-100"
        />
        <div className={styles.bannerBody}>
          <TextPulse className="h-3.5 w-56" />
          <TextPulse className="mt-2 h-3 w-72 max-w-full" />
        </div>
      </div>

      <Card className={styles.panel}>
        <div className={styles.toolbar} aria-hidden="true">
          <TextPulse className="h-3 w-32" />
          <div className={styles.filters}>
            <div className={`${styles.search} animate-pulse rounded-md bg-navy-100`} />
            <div className={`${styles.levelSelect} animate-pulse rounded-md bg-navy-100`} />
          </div>
        </div>

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
                    <div className={styles.itemCell}>
                      <TextPulse className="h-3.5 w-40" />
                      <TextPulse className="h-2.5 w-28" />
                    </div>
                  </td>
                  <td>
                    <TextPulse className="h-3.5 w-16" />
                  </td>
                  <td>
                    <TextPulse className="h-3.5 w-20" />
                  </td>
                  <td>
                    <PillPulse className="w-20" />
                  </td>
                  <td>
                    <div className="flex items-center gap-1.5">
                      <span className="h-6 w-20 animate-pulse rounded-[4px] bg-navy-100" />
                      <span className="h-6 w-12 animate-pulse rounded-[4px] bg-navy-100" />
                    </div>
                  </td>
                  <td>
                    <PillPulse className="w-24" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={styles.footer} aria-hidden="true">
          <div className={actionStyles.pager}>
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
