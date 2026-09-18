import { Card } from "@/components/ui/card";
import styles from "../dashboard/page.module.css";
import airStyles from "../inspections/air-section.module.css";
import assetStyles from "../assets/page.module.css";

/**
 * Issues-specific skeleton — mirrors PersonnelIssuesPage 1:1 (crumb,
 * header, issued-items panel with search + 2 filters + 10-col table,
 * completed-requests panel with 6-col table) so content swaps in
 * without layout shift.
 *
 * Static chrome renders as real text with real classes; only live
 * values are pulse placeholders sized to the real cells.
 */

const ISSUED_HEADERS = [
  "Doc",
  "No.",
  "Employee (received by)",
  "Account Code",
  "Article",
  "Account Title",
  "Asset Type",
  "Qty",
  "Date",
  "QR record",
] as const;

const COMPLETED_HEADERS = [
  "Type",
  "Employee",
  "Item",
  "Qty",
  "Resolved",
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
      <p className={styles.crumb}>Personnel / Issues</p>

      {/* Header — same as the real page (no actions) */}
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Issues</h1>
          <p className={styles.subtitle} aria-hidden="true">
            <span className="mt-1 block h-4 w-64 animate-pulse rounded bg-navy-100" />
          </p>
        </div>
      </div>

      <Card className={styles.panel}>
        <p className={styles.panelSub}>
          Each row is one issued asset/stock line: receiving employee, account
          code, article, account title, asset type, and quantity — with its own
          QR record. No cost, supplier, or account-number data is shown or
          encoded.
        </p>

        {/* Controls — search + Doc + Asset type, same layout as IssuesTable */}
        <div className={airStyles.controls}>
          <div className={assetStyles.topRow} style={{ justifyContent: "flex-end" }} aria-hidden="true">
            <div className={assetStyles.searchWrap} style={{ flex: "0 1 22rem" }}>
              <div className="h-9 animate-pulse rounded-md bg-navy-100" />
            </div>
            <div className={assetStyles.filterGroup} style={{ flex: "0 0 10rem" }}>
              <span className={assetStyles.filterLabel}>Doc</span>
              <div className="h-8 animate-pulse rounded-md bg-navy-100" />
            </div>
            <div className={assetStyles.filterGroup} style={{ flex: "0 0 10rem" }}>
              <span className={assetStyles.filterLabel}>Asset type</span>
              <div className="h-8 animate-pulse rounded-md bg-navy-100" />
            </div>
          </div>
        </div>

        {/* Table — same 10 columns, 10 rows */}
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
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-flex h-8 items-center justify-center rounded-[4px] border border-navy-200 bg-white px-3.5 text-xs font-semibold text-navy-700">
                        View QR
                      </span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>Completed request QR records</h2>
        <p className={styles.panelSub}>
          Completed transfers, assignments, repairs, and stock replenishments
          you actioned — each with its own QR record (quantity + transfer
          parties included).
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.table} aria-hidden="true">
            <thead>
              <tr>
                {COMPLETED_HEADERS.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, r) => (
                <tr key={r} style={{ opacity: 1 - r * 0.08 }}>
                  <td>
                    <TextPulse className="h-3.5 w-24" />
                  </td>
                  <td>
                    <TextPulse className="h-3.5 w-28" />
                  </td>
                  <td>
                    <TextPulse className="h-3.5 w-32" />
                  </td>
                  <td>
                    <TextPulse className="h-3.5 w-8" />
                  </td>
                  <td>
                    <TextPulse className="h-3.5 w-20" />
                  </td>
                  <td>
                    <span className="inline-flex h-8 items-center justify-center rounded-[4px] border border-navy-200 bg-white px-3.5 text-xs font-semibold text-navy-700">
                      View QR
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
