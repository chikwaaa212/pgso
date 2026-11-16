import { Card } from "@/components/ui/card";
import styles from "./page.module.css";
import ui from "@/components/personnel/personnel-ui.module.css";

/**
 * Logs skeleton — mirrors the real page: header, four summary tiles, toolbar,
 * chip row and the audit table, so content swaps in without layout shift.
 */

const HEADERS = [
  "When",
  "Action",
  "Module",
  "Purpose",
  "Details",
  "Reference",
] as const;

function Pulse({ className }: { className: string }) {
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
      className={ui.page}
      aria-busy="true"
      aria-label="Loading activity logs"
    >
      <header className={ui.header}>
        <div className={ui.headerText}>
          <span className={ui.eyebrow}>
            <span className={ui.eyebrowDot} aria-hidden="true" />
            Accountability
          </span>
          <h1 className={ui.title}>Activity logs</h1>
          <p className={ui.subtitle} aria-hidden="true">
            <Pulse className="mt-1 h-4 w-72 max-w-full" />
          </p>
        </div>
      </header>

      <div className={ui.tiles} aria-hidden="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={ui.tile}>
            <Pulse className="h-[2.125rem] w-[2.125rem] rounded-lg" />
            <div className={`${ui.tileBody} flex-1`}>
              <Pulse className="h-3 w-20" />
              <Pulse className="mt-1 h-6 w-14" />
              <Pulse className="mt-1 h-3 w-24" />
            </div>
          </div>
        ))}
      </div>

      <Card className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>Audit trail</h2>
            <p className={styles.panelSub}>
              Expand a row for the full record.
            </p>
          </div>
        </div>

        <div className={styles.toolbar} aria-hidden="true">
          <Pulse className="h-3 w-40" />
        </div>

        <div className={styles.tableWrap} aria-hidden="true">
          <table className={styles.table}>
            <thead>
              <tr>
                {HEADERS.map((h) => (
                  <th key={h}>{h}</th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 10 }).map((_, r) => (
                <tr key={r} style={{ opacity: 1 - r * 0.04 }}>
                  <td>
                    <Pulse className="h-3.5 w-24" />
                    <Pulse className="mt-1.5 h-3 w-16" />
                  </td>
                  <td>
                    <Pulse className="h-[22px] w-24 rounded-full" />
                  </td>
                  <td>
                    <Pulse className="h-3.5 w-20" />
                  </td>
                  <td>
                    <Pulse className="h-3.5 w-32" />
                  </td>
                  <td>
                    <Pulse className="h-3.5 w-36" />
                  </td>
                  <td>
                    <Pulse className="h-5 w-20 rounded" />
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
