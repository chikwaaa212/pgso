import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import styles from "./page.module.css";

/**
 * Super-admin dashboard skeleton — mirrors the real dashboard section
 * order and grid positions 1:1 so content swaps in without layout shift:
 * crumb → title → subtitle → 12 stat cards → Deliveries vs inspections
 * combo card (bars + line + insight + buttons) → Analytics (8 cards) →
 * Recent activity + Add Personnel form.
 *
 * Static chrome (crumb, titles, labels, buttons) renders as real text
 * with the real classes; only live values are pulse placeholders sized
 * to the real rows. Same pattern as the personnel dashboard skeleton.
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
  { title: "Repairs by status", sub: "Repair tickets — all time" },
  { title: "Assets by status", sub: "Registered fleet composition — all time" },
  { title: "Stock health gauge", sub: "Share of stock lines above reorder threshold" },
  { title: "Issuances by type", sub: "PAR vs ICS accountability documents" },
  { title: "Issuance trend", sub: "PAR / ICS documents issued per month — last 6 months" },
  { title: "Documents by type", sub: "Generated RIS, PAR, ICS, AIR and others" },
];

// Bar heights (%) + trend-line points for the combo chart placeholder.
const BARS = [42, 68, 55, 82, 60, 74];
const LINE_POINTS = "50,190 150,150 250,165 350,110 450,130 550,85";

function Pulse({ className }: { className: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded bg-navy-100 ${className}`} />;
}

function cardStyle(): React.CSSProperties {
  return { padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" };
}

export default function SuperAdminDashboardLoading() {
  return (
    <section className={styles.section} aria-busy="true" aria-label="Loading dashboard">
      <p className={styles.crumb}>Super Admin / Dashboard</p>
      <h1 className={styles.title}>Welcome, Super Admin</h1>
      <p className={styles.subtitle}>
        Signed in as{" "}
        <span
          aria-hidden="true"
          className="inline-block h-4 w-40 animate-pulse rounded bg-navy-100 align-middle"
        />{" "}
        · system-wide oversight at a glance.
      </p>

      {/* Stats — 12 cards, same grid (2 cols mobile / 4 cols desktop) */}
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

      {/* Chart — same combo card: head, bars + line, insight, buttons */}
      <div className={styles.chartWrap}>
        <Card className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Deliveries vs inspections</h2>
              <p className={styles.panelSub}>Last 6 months — live from records</p>
            </div>
          </div>
          <div className="relative max-h-[280px] w-full" aria-hidden="true">
            <svg
              viewBox="0 0 600 280"
              preserveAspectRatio="none"
              className="pointer-events-none absolute inset-0 h-full w-full animate-pulse"
            >
              <polyline
                points={LINE_POINTS}
                fill="none"
                stroke="#f5c518"
                strokeWidth="3"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {LINE_POINTS.split(" ").map((pt) => {
                const [cx, cy] = pt.split(",");
                return <circle key={pt} cx={cx} cy={cy} r="6" fill="#f5c518" />;
              })}
            </svg>
            <div className="flex h-[280px] items-end justify-around gap-2 px-2">
              {BARS.map((h, i) => (
                <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                  <div
                    className="w-full max-w-10 animate-pulse rounded bg-navy-100"
                    style={{ height: `${h}%` }}
                  />
                  <div className="h-3 w-8 animate-pulse rounded bg-navy-100" />
                </div>
              ))}
            </div>
          </div>
          <div className={styles.chartCaption} aria-hidden="true">
            <Pulse className="h-3 w-full" />
            <Pulse className="mt-1.5 h-3 w-2/3" />
          </div>
          <div className={styles.panelFooter} aria-hidden="true">
            <span className={styles.inspectLink}>View deliveries</span>
            <span className={styles.inspectLink}>View inspections</span>
          </div>
        </Card>
      </div>

      {/* Analytics — same heading + 8 cards in the same grid */}
      <div>
        <h2 style={{ fontSize: "1.125rem", fontWeight: 700, margin: "1.5rem 0 0.25rem" }}>
          Analytics
        </h2>
        <p style={{ fontSize: "0.8125rem", color: "var(--color-navy-500)", margin: "0 0 1rem" }}>
          Live breakdowns across every transaction type — each with what it means for operations.
        </p>
        <div className={styles.analyticsGrid} aria-hidden="true">
          {ANALYTICS_CARDS.map((c) => (
            <Card key={c.title} style={cardStyle()}>
              <div>
                <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: 0 }}>{c.title}</h3>
                <p
                  style={{
                    fontSize: "0.8125rem",
                    color: "var(--color-navy-500)",
                    margin: "0.25rem 0 0",
                  }}
                >
                  {c.sub}
                </p>
              </div>
              <Pulse className="h-44 w-full" />
              <div className={styles.chartCaption}>
                <Pulse className="h-3 w-full" />
                <Pulse className="mt-1.5 h-3 w-3/4" />
              </div>
            </Card>
          ))}
        </div>
      </div>

      <div className={styles.twoCol}>
        {/* Recent activity — same panel, 5 audit rows */}
        <Card className={styles.panel}>
          <h2 className={styles.panelTitle}>Recent activity</h2>
          <p className={styles.panelSub}>Latest audit entries across all users and modules.</p>
          <ul className={styles.auditList} aria-hidden="true">
            {Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className={styles.auditItem} style={{ opacity: 1 - i * 0.1 }}>
                <Pulse className="h-3.5 w-3/4" />
                <Pulse className="mt-1.5 h-3 w-1/2" />
              </li>
            ))}
          </ul>
        </Card>

        {/* Add Personnel — same section, labels + disabled inputs + button */}
        <div className={styles.addSection}>
          <h2 className={styles.addTitle}>Add Personnel Employee</h2>
          <p className={styles.addSubtitle}>
            Create login credentials for a PGSO personnel member. Employee accounts are
            self-registered — approve them under{" "}
            <span style={{ textDecoration: "underline" }}>Users</span>.
          </p>
          <div className={styles.addForm} aria-hidden="true">
            <div>
              <span className={styles.addLabel}>Full Name</span>
              <input
                type="text"
                disabled
                placeholder="Jane Doe"
                tabIndex={-1}
                className={styles.addInput}
              />
            </div>
            <div>
              <span className={styles.addLabel}>Email</span>
              <input
                type="email"
                disabled
                placeholder="you@example.com"
                tabIndex={-1}
                className={styles.addInput}
              />
            </div>
            <div>
              <span className={styles.addLabel}>Password</span>
              <input
                type="password"
                disabled
                placeholder="At least 6 characters"
                tabIndex={-1}
                className={styles.addInput}
              />
            </div>
            <Button variant="primary" disabled>
              Add Personnel Employee
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
