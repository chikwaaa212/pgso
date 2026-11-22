import { PageHeader } from "@/components/personnel/PageHeader";
import { Card } from "@/components/ui/card";
import ui from "@/components/personnel/personnel-ui.module.css";
import styles from "./page.module.css";

/**
 * Super-admin records skeleton — mirrors SuperAdminRecordsPage 1:1
 * (header with meta line, six summary tiles, tabbed panel with search and
 * rows) so content swaps in without layout shift.
 *
 * Static chrome renders as real text with real classes; only live values
 * are pulse placeholders sized to the real cells.
 */

const TILE_LABELS = [
  "Assets",
  "Stock SKUs",
  "IAR records",
  "PAR / ICS",
  "Deliveries",
  "Inspections",
];

const TABS = ["Recent assets", "Low stock", "PAR / ICS"];

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

export default function RecordsLoading() {
  return (
    <section
      className={styles.section}
      aria-busy="true"
      aria-label="Loading records"
    >
      <PageHeader
        eyebrow="Registry overview"
        title="Records"
        subtitle="Registry totals and the newest entries across assets, stock levels and accountability documents — open any record in a read-only overlay."
        meta="Loading registry totals and recent entries…"
      />

      {/* Summary tiles — same shared 6-up auto-fit grid */}
      <div className={ui.tiles} aria-hidden="true">
        {TILE_LABELS.map((label) => (
          <div key={label} className={ui.tile}>
            <span className={ui.tileIcon}>
              <div className="h-3.5 w-3.5 animate-pulse rounded bg-navy-200" />
            </span>
            <div className={ui.tileBody}>
              <p className={ui.tileLabel}>{label}</p>
              <TextPulse className="mt-0.5 h-6 w-12" />
              <TextPulse className="mt-1 h-3 w-24" />
            </div>
          </div>
        ))}
      </div>

      <Card className={styles.panel} aria-hidden="true">
        <div className={styles.panelHead}>
          <div className={styles.tabs}>
            {TABS.map((tab, i) => (
              <span
                key={tab}
                className={styles.tab}
                data-active={i === 0}
              >
                {tab}
                <span className={styles.tabCount} data-active={i === 0}>
                  <span className="inline-block h-2.5 w-3 animate-pulse rounded bg-navy-200" />
                </span>
              </span>
            ))}
          </div>
          <div className={styles.filters}>
            <div className={styles.searchWrap}>
              <TextPulse className="h-8 w-[22rem] max-w-full" />
            </div>
          </div>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Article</th>
                <th>Code</th>
                <th>Type</th>
                <th>Status</th>
                <th>Location</th>
                <th className={styles.actionHead}>Details</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }).map((_, r) => (
                <tr key={r} style={{ opacity: 1 - r * 0.07 }}>
                  <td>
                    <TextPulse className="h-3.5 w-28" />
                    <TextPulse className="mt-1 h-2.5 w-20" />
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
                    <TextPulse className="h-3.5 w-20" />
                  </td>
                  <td className={styles.actionCell}>
                    <span className="inline-block h-6 w-24 animate-pulse rounded-[4px] bg-navy-100" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={styles.panelFoot}>
          <span className={styles.footInfo}>
            Loading the newest registry entries…
          </span>
          <span className={styles.footHint}>
            Select any row to open its read-only record
          </span>
        </div>
      </Card>
    </section>
  );
}
