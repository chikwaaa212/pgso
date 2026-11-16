import { Card } from "@/components/ui/card";
import { FileCheck2, FileText, ScrollText } from "lucide-react";
import styles from "../dashboard/page.module.css";
import stockStyles from "../stocks/page.module.css";
import docs from "./page.module.css";
import air from "../inspections/air-section.module.css";

/**
 * Issuances-specific skeleton — mirrors PersonnelIssuancesPage 1:1
 * (header + table/grid switch, three summary tiles, All/PAR/ICS tabs,
 * instant-search toolbar, 9-column table, pager) so content swaps in
 * without layout shift.
 *
 * Exported in two layers: the default route skeleton, and the table-only
 * `IssuancesTableSkeleton` the page paints during an in-flight refresh.
 */

const TABS = [
  { label: "All", count: true },
  { label: "PAR", count: true },
  { label: "ICS", count: true },
] as const;

const HEADERS = [
  "Doc",
  "No.",
  "Employee",
  "Item",
  "Qty",
  "Total",
  "Date",
  "Report",
  "Details",
] as const;

function TextPulse({ className }: { className: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded bg-navy-100 ${className}`}
    />
  );
}

function SummaryTiles() {
  const tiles = [
    { label: "Total issuances", meta: "PAR + ICS records", icon: ScrollText },
    { label: "PAR", meta: "Over ₱50,000", icon: FileText },
    { label: "ICS", meta: "₱50,000 or less", icon: FileCheck2 },
  ];
  return (
    <div className={stockStyles.summary} aria-hidden="true">
      {tiles.map(({ label, meta, icon: Icon }) => (
        <div key={label} className={stockStyles.summaryCard}>
          <span className={`${stockStyles.summaryIcon} animate-pulse bg-navy-100`}>
            <Icon size={16} aria-hidden="true" className="opacity-0" />
          </span>
          <div className={stockStyles.summaryBody}>
            <p className={stockStyles.summaryLabel}>{label}</p>
            <p className={stockStyles.summaryValue}>
              <span className="block h-6 w-14 animate-pulse rounded bg-navy-100" />
            </p>
            <p className={stockStyles.summaryMeta}>{meta}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function TabsStrip() {
  return (
    <div className={docs.tabsRow} aria-hidden="true">
      <div className={air.tabs} role="tablist" aria-label="Filter by document type">
        {TABS.map((t) => (
          <span key={t.label} className={air.tab} data-active={t.label === "All"}>
            {t.label}
            <span
              className={docs.tabCount}
              data-active={t.label === "All" ? "true" : undefined}
            >
              <span className="block h-2.5 w-3 animate-pulse rounded bg-navy-200" />
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function ToolbarSkeleton() {
  return (
    <div className={stockStyles.toolbar} aria-hidden="true">
      <p className={stockStyles.toolbarInfo}>
        <span className="block h-3.5 w-44 animate-pulse rounded bg-navy-100" />
      </p>
      <div className={stockStyles.filters}>
        <div
          className={`${stockStyles.search} h-8 animate-pulse rounded-md bg-navy-100`}
        />
      </div>
    </div>
  );
}

/**
 * Table-only loading state used while the active window is in flight.
 * Column set + alignment match the real table exactly.
 */
export function IssuancesTableSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <>
      <div
        className={styles.tableWrap}
        role="status"
        aria-busy="true"
        aria-label="Loading issuances"
      >
        <table className={styles.table} aria-hidden="true">
          <thead>
            <tr>
              {HEADERS.map((h) => (
                <th
                  key={h}
                  style={
                    h === "Report" || h === "Details"
                      ? { textAlign: "right" }
                      : undefined
                  }
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, r) => (
              <tr key={r}>
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
                  <TextPulse className="h-3.5 w-20" />
                </td>
                <td>
                  <TextPulse className="h-3.5 w-20" />
                </td>
                <td style={{ textAlign: "right" }}>
                  <div className="ml-auto h-6 w-24 animate-pulse rounded-[4px] bg-navy-100" />
                </td>
                <td style={{ textAlign: "right" }}>
                  <div className="ml-auto h-6 w-14 animate-pulse rounded-[4px] bg-navy-100" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={stockStyles.footer} aria-hidden="true">
        <span className={stockStyles.footerInfo}>
          <span className="block h-3 w-40 animate-pulse rounded bg-navy-100" />
        </span>
      </div>
    </>
  );
}

export default function IssuancesLoading() {
  return (
    <section
      className={styles.section}
      aria-busy="true"
      aria-label="Loading issuances"
    >
      {/* Header — same as the real page, including the view switch */}
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>PAR / ICS Issuances</h1>
          <p className={styles.subtitle} aria-hidden="true">
            <span className="mt-1 block h-4 w-72 animate-pulse rounded bg-navy-100" />
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

      <SummaryTiles />
      <TabsStrip />

      <Card className={stockStyles.panel}>
        <ToolbarSkeleton />
        <IssuancesTableSkeleton />
      </Card>
    </section>
  );
}
