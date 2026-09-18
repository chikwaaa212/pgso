import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import styles from "@/app/personnel/dashboard/page.module.css";
import air from "@/app/personnel/inspections/air-section.module.css";

/**
 * Super-admin documents skeleton — mirrors SuperAdminDocumentsPage 1:1
 * for the default Delivery tab (crumb, header + tab buttons, right
 * search, 9-col table with View receipt buttons, pager) so content swaps
 * in without layout shift.
 *
 * Static chrome renders as real text with the real classes; only live
 * values are pulse placeholders sized to the real cells. Same pattern
 * as the personnel documents page (cached snapshot + modal receipts).
 */

const TABS = [
  "Delivery",
  "Inspection",
  "Stocks",
  "Assets",
  "Repairs",
  "IAR Reports",
  "PAR",
  "ICS",
] as const;

const HEADERS = [
  "Ref",
  "Supplier",
  "PO ref",
  "Date delivered",
  "Items",
  "Logged By",
  "Delivery",
  "Inspection",
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

export default function DocumentsLoading() {
  return (
    <section
      className={styles.section}
      aria-busy="true"
      aria-label="Loading documents"
    >
      <p className={styles.crumb}>Super Admin / Documents</p>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Documents</h1>
          <p className={styles.subtitle}>
            <span
              aria-hidden="true"
              className="inline-block h-4 w-40 animate-pulse rounded bg-navy-100 align-middle"
            />{" "}
            records shown · every document from all personnel
          </p>
        </div>
        <div className={styles.actions} aria-hidden="true">
          <div className={air.tabs} role="tablist" aria-label="Document types">
            {TABS.map((t, i) => (
              <span
                key={t}
                role="tab"
                aria-selected={i === 0}
                className={air.tab}
                data-active={i === 0}
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>

      <Card className={styles.panel}>
        <div className={air.controls} aria-hidden="true">
          <Input
            type="search"
            disabled
            placeholder="Search ref, supplier, PO, status…"
            aria-label="Search delivery documents"
            tabIndex={-1}
            className={air.search}
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
                    <TextPulse className="h-3.5 w-16" />
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
                    <TextPulse className="h-3.5 w-8" />
                  </td>
                  <td>
                    <TextPulse className="h-3.5 w-24" />
                  </td>
                  <td>
                    <PillPulse />
                  </td>
                  <td>
                    <PillPulse className="w-[70px]" />
                  </td>
                  <td>
                    <span className={styles.inspectLinkSecondary}>
                      View receipt
                    </span>
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
