import { Card } from "@/components/ui/card";
import styles from "./page.module.css";

/**
 * Super-admin dashboard skeleton — mirrors the real dashboard section
 * order and grid positions 1:1 so content swaps in without layout shift:
 * header + actions → 13 stat cards → Deliveries vs inspections grouped-bar
 * card → Analytics (11 cards in 3 · 2 · 1 · 3 · 2 rows).
 *
 * Static chrome (titles, labels, buttons) renders as real text with the
 * real classes; only live values are pulse placeholders sized to the
 * real rows. Same pattern as the personnel dashboard skeleton.
 */

// Exact stat labels in page order — real text, values pulse.
const STAT_LABELS = [
  "Pending approvals",
  "Personnel",
  "Employees",
  "Deliveries",
  "Pending requests",
  "Active repairs",
  "Assets tracked",
  "Recommendations",
  "Low / out of stock",
  "PAR / ICS issued",
  "Open documents",
  "Catalog entries",
  "Units",
];

// Exact analytics card titles + subs in page order.
const ANALYTICS_CARDS = [
  { title: "Inspection outcomes", sub: "Deliveries by inspection result — all time" },
  { title: "Requests by status", sub: "Employee requests — all time" },
  { title: "Stock health gauge", sub: "Share of stock lines above reorder threshold" },
  { title: "Repairs by status", sub: "Repair tickets — all time" },
  { title: "Assets by status", sub: "Registered fleet composition — all time" },
  { title: "Issuance trend", sub: "PAR / ICS documents issued per month — last 6 months" },
  { title: "Issuances by type", sub: "PAR vs ICS accountability documents" },
  { title: "Documents by type", sub: "Generated RIS, PAR, ICS, AIR and others" },
  { title: "Delayed & aging transactions", sub: "Open records past the 7-day threshold, by workflow" },
  { title: "Quarterly issuance", sub: "PAR / ICS documents issued per calendar quarter — last 8 quarters" },
  { title: "Asset conditions", sub: "Registered assets by current condition" },
];

// Analytics rows mirror the real layout: 3 · 2 · 1 · 3 · 2 cards.
const ANALYTICS_ROWS = [3, 2, 1, 3, 2];

// Paired bar heights (%) for the grouped-bar chart placeholder.
const BAR_PAIRS = [
  [42, 30],
  [68, 52],
  [55, 44],
  [82, 62],
  [60, 48],
  [74, 58],
];

function Pulse({ className }: { className: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded bg-navy-100 ${className}`} />;
}

export default function SuperAdminDashboardLoading() {
  return (
    <section className={styles.section} aria-busy="true" aria-label="Loading dashboard">
      {/* Header — same row + action buttons as the real page */}
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>
            Welcome,{" "}
            <span
              aria-hidden="true"
              className="inline-block h-7 w-56 max-w-full animate-pulse rounded bg-navy-100 align-middle"
            />
          </h1>
          <p className={styles.subtitle}>
            Signed in as{" "}
            <span
              aria-hidden="true"
              className="inline-block h-4 w-40 animate-pulse rounded bg-navy-100 align-middle"
            />{" "}
            · system-wide oversight at a glance.
          </p>
        </div>
        <div className={styles.actions} aria-hidden="true">
          <span className={styles.actionSecondary}>View reports</span>
          <span className={styles.actionPrimary}>Manage users</span>
        </div>
      </div>

      {/* Stats — 13 cards, same 2 / 3 / 5 column grid */}
      <div className={styles.stats} aria-hidden="true">
        {STAT_LABELS.map((label) => (
          <Card key={label} className={`${styles.statCard} p-4`}>
            <span className={styles.statLabel}>{label}</span>
            <Pulse className="h-8 w-16" />
            <div className={styles.statFooter}>
              <Pulse className="h-3 w-24" />
              <span className={styles.statButton}>Open</span>
            </div>
          </Card>
        ))}
      </div>

      {/* Chart — same grouped-bar card as personnel: head, bars, buttons */}
      <Card className={`${styles.panel} p-4`}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>Deliveries vs inspections</h2>
            <p className={styles.panelSub}>Last 6 months — live from records</p>
          </div>
          <div className="flex items-center gap-2" aria-hidden="true">
            <Pulse className="h-8 w-40" />
          </div>
        </div>
        <div className="flex h-[280px] items-end justify-around gap-3 px-2" aria-hidden="true">
          {BAR_PAIRS.map((pair, i) => (
            <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
              <div className="flex h-full w-full items-end justify-center gap-1">
                <div
                  className="w-4 max-w-[32%] animate-pulse rounded bg-navy-100"
                  style={{ height: `${pair[0]}%` }}
                />
                <div
                  className="w-4 max-w-[32%] animate-pulse rounded bg-navy-100"
                  style={{ height: `${pair[1]}%` }}
                />
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

      {/* Analytics — same heading + 11 cards in the 3 · 2 · 1 · 3 · 2 rows */}
      <div>
        <h2 className={styles.panelTitle}>Analytics</h2>
        <p className={styles.panelSub}>
          Live breakdowns across every transaction type — each with what it means for operations.
        </p>
        <div className={styles.analyticsRows} aria-hidden="true">
          {ANALYTICS_ROWS.map((size, rowIndex) => {
            const start = ANALYTICS_ROWS.slice(0, rowIndex).reduce((n, s) => n + s, 0);
            const rowCards = ANALYTICS_CARDS.slice(start, start + size);
            return (
              <div
                key={`analytics-row-${rowIndex}`}
                className={styles.analyticsRow}
                data-cols={size}
              >
                {rowCards.map((c) => (
                  <Card key={c.title} className={`${styles.panel} p-4`}>
                    <div>
                      <h3 className={styles.panelTitle}>{c.title}</h3>
                      <p className={styles.panelSub}>{c.sub}</p>
                    </div>
                    <Pulse className="h-44 w-full" />
                    <div className={styles.chartCaption}>
                      <Pulse className="h-3 w-full" />
                      <Pulse className="mt-1.5 h-3 w-3/4" />
                    </div>
                  </Card>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
