import Link from "next/link";
import { Card } from "@/components/ui/card";
import {
  mockStats,
  mockDeliveries,
  mockRequests,
} from "@/components/personnel/mock";
import { OverviewChart } from "./overview-chart";
import styles from "./page.module.css";

const modules = [
  { title: "Deliveries", description: "Log deliveries and track suppliers", href: "/personnel/deliveries" },
  { title: "Inspections", description: "Record inspection and AIR results", href: "/personnel/inspections" },
  { title: "Inventory", description: "Monitor stock levels and thresholds", href: "/personnel/inventory" },
  { title: "Assets", description: "Encode items, validate, assign QR codes", href: "/personnel/assets" },
  { title: "Documents", description: "Generate and track RIS, PAR, ICS, AIR", href: "/personnel/documents" },
  { title: "Requests", description: "Review transfer and supply requests", href: "/personnel/requests" },
  { title: "Repairs", description: "Track repairs and technicians", href: "/personnel/repairs" },
];

export default function PersonnelDashboard() {
  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Personnel / Dashboard</p>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Dashboard</h1>
          <p className={styles.subtitle}>
            Property and supply operations at a glance.{" "}
            <span className={styles.badge}>Mockup — no live data</span>
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

      <div className={styles.stats}>
        {mockStats.map((stat) => (
          <Card key={stat.label} className={styles.statCard}>
            <span className={styles.statLabel}>{stat.label}</span>
            <span className={styles.statValue}>{stat.value}</span>
            <span className={styles.statDelta}>{stat.delta}</span>
          </Card>
        ))}
      </div>

      <OverviewChart />

      <div className={styles.twoCol}>
        <Card className={styles.panel}>
          <h2 className={styles.panelTitle}>Recent deliveries</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th>PO ref</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {mockDeliveries.map((d) => (
                  <tr key={d.id}>
                    <td>{d.supplier}</td>
                    <td>{d.po}</td>
                    <td>
                      <span className={styles.status} data-tone={d.status === "Complete" ? "ok" : "warn"}>
                        {d.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className={styles.panel}>
          <h2 className={styles.panelTitle}>Requests needing review</h2>
          <ul className={styles.list}>
            {mockRequests.map((r) => (
              <li key={r.id} className={styles.listItem}>
                <div>
                  <p className={styles.listMain}>
                    {r.type} · {r.from}
                  </p>
                  <p className={styles.listSub}>
                    {r.id} · {r.date}
                  </p>
                </div>
                <span className={styles.status} data-tone={r.status === "Pending" ? "warn" : "ok"}>
                  {r.status}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

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
