import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/personnel/PageHeader";
import ui from "@/components/personnel/personnel-ui.module.css";
import styles from "./page.module.css";

/**
 * Super-admin logs skeleton — mirrors SuperAdminLogsPage 1:1 (header,
 * five summary tiles, filter toolbar, 7-column audit table with pager) so
 * content swaps in without layout shift.
 */

const TILE_LABELS = [
  "Total entries",
  "Active users",
  "Modules touched",
  "Last 7 days",
  "Last activity",
];

const HEADERS = [
  "When",
  "User",
  "Action",
  "Module",
  "Purpose / summary",
  "Reference",
] as const;

function TextPulse({ className }: { className: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded bg-navy-100 ${className}`}
    />
  );
}

export default function LogsLoading() {
  return (
    <section
      className={styles.section}
      aria-busy="true"
      aria-label="Loading logs"
    >
      <PageHeader
        eyebrow="Accountability"
        title="System logs"
        subtitle="Every recorded action across the province — who did what, in which module, and when. Expand any row for the full audit payload."
        meta="Loading the audit overview…"
      />

      <div className={ui.tiles} aria-hidden="true">
        {TILE_LABELS.map((label) => (
          <div key={label} className={ui.tile}>
            <span className={ui.tileIcon}>
              <div className="h-4 w-4 animate-pulse rounded bg-navy-200" />
            </span>
            <div className={ui.tileBody}>
              <p className={ui.tileLabel}>{label}</p>
              <TextPulse className="mt-0.5 h-6 w-12" />
              <TextPulse className="mt-1 h-3 w-24" />
            </div>
          </div>
        ))}
      </div>

      <Card className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>Audit trail</h2>
            <p className={styles.panelSub}>
              Newest first by default. Filter by user, module or date range, then
              expand a row for the full record.
            </p>
          </div>
        </div>

        <div className={styles.toolbar} aria-hidden="true">
          <div className={styles.toolbarLeft}>
            <TextPulse className="h-8 w-[21rem] max-w-full" />
            <TextPulse className="h-8 w-44" />
          </div>
          <div className={styles.toolbarRight}>
            <TextPulse className="h-8 w-64" />
            <TextPulse className="h-8 w-24" />
          </div>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table} aria-hidden="true">
            <thead>
              <tr>
                {HEADERS.map((h) => (
                  <th key={h}>{h}</th>
                ))}
                <th aria-label="Expand" />
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 10 }).map((_, r) => (
                <tr key={r} style={{ opacity: 1 - r * 0.05 }}>
                  <td>
                    <TextPulse className="h-3.5 w-28" />
                    <TextPulse className="mt-1.5 h-3 w-20" />
                  </td>
                  <td>
                    <TextPulse className="h-3.5 w-24" />
                  </td>
                  <td>
                    <TextPulse className="h-[22px] w-24 rounded-full" />
                  </td>
                  <td>
                    <TextPulse className="h-3.5 w-20" />
                  </td>
                  <td>
                    <TextPulse className="h-3.5 w-full" />
                    <TextPulse className="mt-1.5 h-3 w-2/3" />
                  </td>
                  <td>
                    <TextPulse className="h-5 w-16" />
                  </td>
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}
