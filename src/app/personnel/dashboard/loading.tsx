import { Card } from "@/components/ui/card";
import styles from "./page.module.css";

/**
 * Dashboard-specific skeleton — mirrors the real dashboard section order
 * and grid positions 1:1 so content swaps in without layout shift.
 *
 * Static chrome (crumb, titles, table headers, links) renders as real text;
 * only live values are pulse placeholders sized to the real rows.
 */
const STAT_LABELS = [
  "Total Deliveries",
  "Pending Inspections",
  "Pending Requests",
  "Active Repairs",
  "Low / Out of Stock",
  "Assets Tracked",
  "PAR / ICS Issued",
  "Open Documents",
];

const ATTENTION = [
  { title: "Inspections awaiting review", cta: "Review", href: "/personnel/inspections" },
  { title: "Employee requests", cta: "Review", href: "/personnel/requests" },
  { title: "Repair tickets", cta: "Open", href: "/personnel/repairs" },
  { title: "Stock reorders", cta: "Restock", href: "/personnel/inventory" },
];

const MODULES = [
  { title: "Deliveries", description: "Log deliveries and track suppliers" },
  { title: "Inspections", description: "Record inspection and AIR results" },
  { title: "Inventory", description: "Monitor stock levels and thresholds" },
  { title: "Assets", description: "Encode items, validate, assign QR codes" },
  { title: "Documents", description: "Generate and track RIS, PAR, ICS, AIR" },
  { title: "PAR / ICS", description: "Issue items with signed accountability forms" },
  { title: "Requests", description: "Review transfer and supply requests" },
  { title: "Repairs", description: "Track repairs and technicians" },
];

const CHART_HEIGHTS = [42, 68, 55, 82, 60, 74];

function Pulse({ className }: { className: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded bg-navy-100 ${className}`} />;
}

function TableSkeleton({ headers, cols, rows = 5 }: { headers: string[]; cols: number; rows?: number }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table} aria-hidden="true">
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r}>
              {Array.from({ length: cols }).map((_, c) => (
                <td key={c}>
                  <div className="h-3.5 animate-pulse rounded bg-navy-100" style={{ opacity: 1 - r * 0.1 }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DashboardLoading() {
  return (
    <section className={styles.section} aria-busy="true" aria-label="Loading dashboard">
      <p className={styles.crumb}>Personnel / Dashboard</p>

      {/* Header — fully static, same as the real page */}
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Dashboard</h1>
          <p className={styles.subtitle}>Property and supply operations at a glance.</p>
        </div>
        <div className={styles.actions}>
          <span className={styles.actionSecondary} aria-hidden="true">Log delivery</span>
          <span className={styles.actionPrimary} aria-hidden="true">New inspection</span>
        </div>
      </div>

      {/* Stats — 8 cards, same grid (2 cols mobile / 4 cols desktop) */}
      <div className={styles.stats} aria-hidden="true">
        {STAT_LABELS.map((label) => (
          <div key={label} className={styles.cardLink}>
            <Card className={styles.statCard}>
              <span className={styles.statLabel}>{label}</span>
              <Pulse className="h-8 w-16" />
              <Pulse className="h-3 w-24" />
            </Card>
          </div>
        ))}
      </div>

      {/* Needs attention + Recent deliveries */}
      <div className={styles.twoCol}>
        <Card className={styles.panel}>
          <h2 className={styles.panelTitle}>Needs attention</h2>
          <p className={styles.panelSub}>Queues that need a personnel action right now.</p>
          <ul className={styles.list} aria-hidden="true">
            {ATTENTION.map((a) => (
              <li key={a.title} className={styles.listItem}>
                <div className="flex-1">
                  <p className={styles.listMain}>{a.title}</p>
                  <Pulse className="mt-1 h-3 w-3/4" />
                </div>
                <span className={styles.inspectLinkSecondary}>{a.cta}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className={styles.panel}>
          <h2 className={styles.panelTitle}>Recent deliveries</h2>
          <TableSkeleton headers={["Supplier", "PO ref", "Date", "Inspection"]} cols={4} />
          <div className={styles.panelFooter}>
            <span className={styles.inspectLink} aria-hidden="true">View all deliveries</span>
          </div>
        </Card>
      </div>

      {/* Chart — same panel + bar layout */}
      <Card className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>Deliveries vs inspections</h2>
            <p className={styles.panelSub}>Last 6 months — live from records</p>
          </div>
        </div>
        <div className={styles.chart} aria-hidden="true">
          {CHART_HEIGHTS.map((h, i) => (
            <div key={i} className={styles.barGroup}>
              <div className={styles.bars}>
                <div className={`${styles.bar} animate-pulse bg-navy-100`} data-kind="a" style={{ height: `${h}%` }} />
                <div className={`${styles.bar} animate-pulse bg-navy-100`} data-kind="b" style={{ height: `${Math.max(12, h - 18)}%` }} />
              </div>
              <div className="h-3 w-8 animate-pulse rounded bg-navy-100" />
            </div>
          ))}
        </div>
        <div className={styles.panelFooter} aria-hidden="true">
          <span className={styles.inspectLink}>View deliveries</span>
          <span className={styles.inspectLink}>View inspections</span>
        </div>
      </Card>

      {/* Recent requests + Recent repairs */}
      <div className={styles.twoCol}>
        <Card className={styles.panel}>
          <h2 className={styles.panelTitle}>Recent requests</h2>
          <TableSkeleton headers={["Employee", "Type", "Date", "Status"]} cols={4} rows={7} />
          <div className={styles.panelFooter}>
            <span className={styles.inspectLink} aria-hidden="true">Review requests</span>
          </div>
        </Card>

        <Card className={styles.panel}>
          <h2 className={styles.panelTitle}>Recent repairs</h2>
          <TableSkeleton headers={["Asset / issue", "Date", "Status"]} cols={3} />
          <div className={styles.panelFooter}>
            <span className={styles.inspectLink} aria-hidden="true">Track repairs</span>
          </div>
        </Card>
      </div>

      {/* Low-stock watchlist + Recent PAR / ICS */}
      <div className={styles.twoCol}>
        <Card className={styles.panel}>
          <h2 className={styles.panelTitle}>Low-stock watchlist</h2>
          <TableSkeleton headers={["Item", "On hand", "Level"]} cols={3} />
          <div className={styles.panelFooter}>
            <span className={styles.inspectLink} aria-hidden="true">Manage stocks</span>
          </div>
        </Card>

        <Card className={styles.panel}>
          <h2 className={styles.panelTitle}>Recent PAR / ICS</h2>
          <TableSkeleton headers={["Doc", "End user", "Date"]} cols={3} />
          <div className={styles.panelFooter}>
            <span className={styles.inspectLink} aria-hidden="true">View issuances</span>
          </div>
        </Card>
      </div>

      {/* Module grid — 8 cards, same 3-col layout */}
      <div className={styles.grid} aria-hidden="true">
        {MODULES.map((mod) => (
          <div key={mod.title} className={styles.cardLink}>
            <Card>
              <h2 className="text-lg font-semibold">{mod.title}</h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">{mod.description}</p>
              <Pulse className="mt-2 h-3 w-24" />
            </Card>
          </div>
        ))}
      </div>
    </section>
  );
}
