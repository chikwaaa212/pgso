import { Card } from "@/components/ui/card";
import styles from "@/app/personnel/dashboard/page.module.css";
import stockStyles from "@/app/personnel/stocks/page.module.css";
import airStyles from "@/app/personnel/inspections/air-section.module.css";
import docs from "@/app/personnel/issues/page.module.css";

/**
 * Super-admin issues skeleton — mirrors SuperAdminIssuesPage 1:1 (header with
 * Issue + Refresh actions, three summary tiles, Issued / Completed tab strip,
 * then the ledger card with its toolbar and issued-lines table) so content
 * swaps in without layout shift.
 */

const ISSUED_HEADERS = [
  "Doc",
  "No.",
  "Employee (received by)",
  "Logged By",
  "Account Code",
  "Article",
  "Account Title",
  "Asset Type",
  "Qty",
  "Date",
  "QR record",
] as const;

function TextPulse({ className }: { className: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded bg-navy-100 ${className}`}
    />
  );
}

export default function IssuesLoading() {
  return (
    <section
      className={styles.section}
      aria-busy="true"
      aria-label="Loading issues"
    >
      {/* Header — same as the real page, with the issue + refresh actions */}
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Issues</h1>
          <p className={styles.subtitle} aria-hidden="true">
            <span className="mt-1 block h-4 w-96 max-w-full animate-pulse rounded bg-navy-100" />
          </p>
        </div>
        <div className={styles.actions} aria-hidden="true">
          <div className="h-6 w-24 animate-pulse rounded-[4px] bg-yellow-200" />
          <div className="h-6 w-20 animate-pulse rounded-[4px] bg-yellow-200" />
        </div>
      </div>

      {/* Summary tiles */}
      <div className={stockStyles.summary} aria-hidden="true">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className={stockStyles.summaryCard}>
            <span className={stockStyles.summaryIcon}>
              <span className="h-4 w-4 animate-pulse rounded bg-navy-200" />
            </span>
            <div className={stockStyles.summaryBody}>
              <TextPulse className="h-3 w-24" />
              <TextPulse className="mt-1 h-6 w-12" />
              <TextPulse className="mt-1 h-3 w-36" />
            </div>
          </div>
        ))}
      </div>

      {/* View tabs */}
      <div className={docs.tabsRow} aria-hidden="true">
        <div className={airStyles.tabs}>
          <span className="h-7 w-32 animate-pulse rounded-[4px] bg-navy-100" />
          <span className="h-7 w-40 animate-pulse rounded-[4px] bg-navy-100" />
        </div>
      </div>

      <Card className={stockStyles.panel}>
        {/* Toolbar — chips left, search + filters right */}
        <div className={stockStyles.toolbar} aria-hidden="true">
          <div className={docs.chips}>
            <span className="h-[22px] w-16 animate-pulse rounded-full bg-navy-100" />
            <span className="h-[22px] w-24 animate-pulse rounded-full bg-navy-100" />
            <span className="h-[22px] w-16 animate-pulse rounded-full bg-navy-100" />
          </div>
          <div className={stockStyles.filters}>
            <div className="h-8 w-72 max-w-full animate-pulse rounded-md bg-navy-100" />
            <div className="h-8 w-32 animate-pulse rounded-md bg-navy-100" />
            <div className="h-8 w-32 animate-pulse rounded-md bg-navy-100" />
          </div>
        </div>

        {/* Table — same columns, 10 rows */}
        <div className={styles.tableWrap}>
          <table className={styles.table} aria-hidden="true">
            <thead>
              <tr>
                {ISSUED_HEADERS.map((h) => (
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
                    <TextPulse className="h-3.5 w-28" />
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
                    <TextPulse className="h-3.5 w-24" />
                  </td>
                  <td>
                    <TextPulse className="h-3.5 w-24" />
                  </td>
                  <td>
                    <TextPulse className="h-3.5 w-8" />
                  </td>
                  <td>
                    <TextPulse className="h-3.5 w-20" />
                  </td>
                  <td>
                    <span className={docs.actionCell}>
                      <span className="inline-flex h-6 w-20 animate-pulse rounded-[4px] bg-yellow-200" />
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
