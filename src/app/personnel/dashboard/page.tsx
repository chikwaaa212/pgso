import Link from "next/link";
import { Card } from "@/components/ui/card";
import {
  getDashboardStats,
  getMonthlyOverview,
  getRecentDeliveries,
} from "../inspections/actions";
import { OverviewChart } from "./overview-chart";
import styles from "./page.module.css";

const modules = [
  { title: "Deliveries",  description: "Log deliveries and track suppliers",    href: "/personnel/deliveries"  },
  { title: "Inspections", description: "Record inspection and AIR results",      href: "/personnel/inspections" },
  { title: "Inventory",   description: "Monitor stock levels and thresholds",    href: "/personnel/inventory"   },
  { title: "Assets",      description: "Encode items, validate, assign QR codes",href: "/personnel/assets"      },
  { title: "Documents",   description: "Generate and track RIS, PAR, ICS, AIR", href: "/personnel/documents"   },
  { title: "Requests",    description: "Review transfer and supply requests",    href: "/personnel/requests"    },
  { title: "Repairs",     description: "Track repairs and technicians",          href: "/personnel/repairs"     },
];

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-PH", {
    year: "numeric", month: "short", day: "numeric", timeZone: "Asia/Manila",
  });
}

export default async function PersonnelDashboard() {
  const [stats, monthly, recentDeliveries] = await Promise.all([
    getDashboardStats(),
    getMonthlyOverview(),
    getRecentDeliveries(5),
  ]);

  const statCards = [
    {
      label: "Total Deliveries",
      value: stats.totalDeliveries.toLocaleString(),
      delta: `${stats.pendingInspections} pending inspection`,
    },
    {
      label: "Pending Inspections",
      value: stats.pendingInspections.toLocaleString(),
      delta: stats.pendingInspections === 0 ? "All clear" : "Need review",
    },
    {
      label: "Completed Inspections",
      value: stats.completedInspections.toLocaleString(),
      delta: "Lifetime total",
    },
    {
      label: "Total Items Logged",
      value: stats.totalItems.toLocaleString(),
      delta: "Across all deliveries",
    },
  ];

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Personnel / Dashboard</p>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Dashboard</h1>
          <p className={styles.subtitle}>
            Property and supply operations at a glance.
          </p>
        </div>
        <div className={styles.actions}>
          <Link href="/personnel/deliveries" className={styles.actionSecondary}>
            Log delivery
          </Link>
          <Link href="/personnel/inspections" className={styles.actionPrimary}>
            New inspection
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className={styles.stats}>
        {statCards.map((stat) => (
          <Card key={stat.label} className={styles.statCard}>
            <span className={styles.statLabel}>{stat.label}</span>
            <span className={styles.statValue}>{stat.value}</span>
            <span className={styles.statDelta}>{stat.delta}</span>
          </Card>
        ))}
      </div>

      {/* Chart — passes real data down to client component */}
      <OverviewChart data={monthly} />

      {/* Recent deliveries */}
      <div className={styles.twoCol}>
        <Card className={styles.panel}>
          <h2 className={styles.panelTitle}>Recent deliveries</h2>
          {recentDeliveries.length === 0 ? (
            <p className={styles.panelSub}>No deliveries logged yet.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Supplier</th>
                    <th>PO ref</th>
                    <th>Date</th>
                    <th>Inspection</th>
                  </tr>
                </thead>
                <tbody>
                  {recentDeliveries.map((d) => (
                    <tr key={d.id}>
                      <td>{d.supplier ?? "—"}</td>
                      <td>{d.po_reference ?? "—"}</td>
                      <td>{fmt(d.date_delivered)}</td>
                        <td>
                        <span
                          className={styles.status}
                          data-tone={
                            d.inspection_status === "passed"
                              ? "ok"
                              : d.inspection_status === "failed"
                              ? "bad"
                              : d.inspection_status === "partial"
                              ? "warn"
                              : "info"
                          }
                        >
                          {d.inspection_status
                            ? d.inspection_status.charAt(0).toUpperCase() +
                              d.inspection_status.slice(1)
                            : "Pending"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className={styles.panel}>
          <h2 className={styles.panelTitle}>Quick links</h2>
          <ul className={styles.list}>
            {modules.slice(0, 4).map((m) => (
              <li key={m.href} className={styles.listItem}>
                <div>
                  <p className={styles.listMain}>{m.title}</p>
                  <p className={styles.listSub}>{m.description}</p>
                </div>
                <Link href={m.href} className={styles.inspectLinkSecondary}>
                  Open
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Module grid */}
      <div className={styles.grid}>
        {modules.map((mod) => (
          <Link key={mod.href} href={mod.href} className={styles.cardLink}>
            <Card>
              <h2 className="text-lg font-semibold">{mod.title}</h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {mod.description}
              </p>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
