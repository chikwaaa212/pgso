import Link from "next/link";
import { Card } from "@/components/ui/card";
import {
  getMonthlyOverview,
  getRecentDeliveries,
} from "../inspections/actions";
import {
  getLowStockItems,
  getOperationsStats,
  getRecentIssuances,
  getRecentRepairs,
  getRecentRequests,
} from "./actions";
import { OverviewChart } from "./overview-chart";
import styles from "./page.module.css";

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  });
}

function cap(s: string | null) {
  if (!s) return "—";
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
}

function requestTone(status: string | null): string {
  if (status === "completed") return "ok";
  if (status === "approved") return "info";
  if (status === "rejected") return "bad";
  return "warn";
}

function repairTone(status: string | null): string {
  if (status === "completed") return "ok";
  if (status === "in_progress") return "info";
  return "warn";
}

function stockTone(level: string): string {
  if (level === "out" || level === "critical") return "bad";
  return "warn";
}

function stockLabel(level: string): string {
  if (level === "out") return "Out of stock";
  if (level === "critical") return "Critical";
  return "Low stock";
}

const REQUEST_TYPE_SHORT: Record<string, string> = {
  transfer: "Transfer",
  new_assignment: "New assignment",
  repair: "Repair",
};

function shortRequestType(t: string): string {
  return REQUEST_TYPE_SHORT[t] ?? t.replace(/_/g, " ");
}

export default async function PersonnelDashboard() {
  const [
    stats,
    monthly,
    recentDeliveries,
    recentRequests,
    recentRepairs,
    lowStock,
    recentIssuances,
  ] = await Promise.all([
    getOperationsStats(),
    getMonthlyOverview(),
    getRecentDeliveries(5),
    getRecentRequests(5),
    getRecentRepairs(5),
    getLowStockItems(5),
    getRecentIssuances(5),
  ]);

  const lowTotal = stats.lowStockCount + stats.outOfStockCount;
  const activeRepairs = stats.pendingRepairs + stats.inProgressRepairs;

  const statCards = [
    {
      label: "Total Deliveries",
      value: stats.totalDeliveries.toLocaleString(),
      delta: `${stats.pendingInspections} pending inspection`,
      href: "/personnel/deliveries",
    },
    {
      label: "Pending Inspections",
      value: stats.pendingInspections.toLocaleString(),
      delta: stats.pendingInspections === 0 ? "All clear" : "Need review",
      href: "/personnel/inspections",
    },
    {
      label: "Pending Requests",
      value: stats.pendingRequests.toLocaleString(),
      delta:
        stats.pendingRequests === 0 ? "Queue clear" : "Awaiting decision",
      href: "/personnel/requests",
    },
    {
      label: "Active Repairs",
      value: activeRepairs.toLocaleString(),
      delta:
        activeRepairs === 0
          ? "No open tickets"
          : `${stats.pendingRepairs} pending · ${stats.inProgressRepairs} in progress`,
      href: "/personnel/repairs",
    },
    {
      label: "Low / Out of Stock",
      value: lowTotal.toLocaleString(),
      delta:
        lowTotal === 0
          ? `${stats.totalStockSkus} SKUs tracked`
          : `${stats.outOfStockCount} out · ${stats.lowStockCount} low`,
      href: "/personnel/inventory",
    },
    {
      label: "Assets Tracked",
      value: stats.totalAssets.toLocaleString(),
      delta: `${stats.totalItems.toLocaleString()} items logged`,
      href: "/personnel/assets",
    },
    {
      label: "PAR / ICS Issued",
      value: stats.totalIssuances.toLocaleString(),
      delta: "Accountability docs",
      href: "/personnel/issuances",
    },
    {
      label: "Open Documents",
      value: stats.totalDocuments.toLocaleString(),
      delta: stats.totalDocuments === 0 ? "All viewed" : "Unviewed",
      href: "/personnel/documents",
    },
  ];

  const attention = [
    {
      title: "Inspections awaiting review",
      detail:
        stats.pendingInspections === 0
          ? "No pending deliveries."
          : `${stats.pendingInspections} deliver${stats.pendingInspections === 1 ? "y" : "ies"} waiting for inspection.`,
      href: "/personnel/inspections",
      cta: "Review",
      tone: stats.pendingInspections === 0 ? "ok" : "warn",
      count: stats.pendingInspections,
    },
    {
      title: "Employee requests",
      detail:
        stats.pendingRequests === 0
          ? "Request queue is clear."
          : `${stats.pendingRequests} pending request${stats.pendingRequests === 1 ? "" : "s"} need a decision.`,
      href: "/personnel/requests",
      cta: "Review",
      tone: stats.pendingRequests === 0 ? "ok" : "warn",
      count: stats.pendingRequests,
    },
    {
      title: "Repair tickets",
      detail:
        activeRepairs === 0
          ? "No open repair tickets."
          : `${stats.pendingRepairs} pending · ${stats.inProgressRepairs} in progress.`,
      href: "/personnel/repairs",
      cta: "Open",
      tone: activeRepairs === 0 ? "ok" : "warn",
      count: activeRepairs,
    },
    {
      title: "Stock reorders",
      detail:
        lowTotal === 0
          ? "All stock levels healthy."
          : `${stats.outOfStockCount} out of stock · ${stats.lowStockCount} low.`,
      href: "/personnel/inventory",
      cta: "Restock",
      tone: lowTotal === 0 ? "ok" : "bad",
      count: lowTotal,
    },
  ];

  const modules = [
    {
      title: "Deliveries",
      description: "Log deliveries and track suppliers",
      href: "/personnel/deliveries",
      meta: `${stats.totalDeliveries} total`,
    },
    {
      title: "Inspections",
      description: "Record inspection and AIR results",
      href: "/personnel/inspections",
      meta:
        stats.pendingInspections === 0
          ? `${stats.completedInspections} completed`
          : `${stats.pendingInspections} pending`,
    },
    {
      title: "Inventory",
      description: "Monitor stock levels and thresholds",
      href: "/personnel/inventory",
      meta:
        lowTotal === 0
          ? `${stats.totalStockSkus} SKUs`
          : `${lowTotal} need reorder`,
    },
    {
      title: "Assets",
      description: "Encode items, validate, assign QR codes",
      href: "/personnel/assets",
      meta: `${stats.totalAssets} tracked`,
    },
    {
      title: "Documents",
      description: "Generate and track RIS, PAR, ICS, AIR",
      href: "/personnel/documents",
      meta:
        stats.totalDocuments === 0
          ? "All viewed"
          : `${stats.totalDocuments} unviewed`,
    },
    {
      title: "PAR / ICS",
      description: "Issue items with signed accountability forms",
      href: "/personnel/issuances",
      meta: `${stats.totalIssuances} issued`,
    },
    {
      title: "Requests",
      description: "Review transfer and supply requests",
      href: "/personnel/requests",
      meta:
        stats.pendingRequests === 0
          ? "Queue clear"
          : `${stats.pendingRequests} pending`,
    },
    {
      title: "Repairs",
      description: "Track repairs and technicians",
      href: "/personnel/repairs",
      meta: activeRepairs === 0 ? "No open tickets" : `${activeRepairs} open`,
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

      {/* Stats — one card per operations area */}
      <div className={styles.stats}>
        {statCards.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className={styles.cardLink}
            aria-label={`${stat.label}: ${stat.value}`}
          >
            <Card className={styles.statCard}>
              <span className={styles.statLabel}>{stat.label}</span>
              <span className={styles.statValue}>{stat.value}</span>
              <span className={styles.statDelta}>{stat.delta}</span>
            </Card>
          </Link>
        ))}
      </div>

      {/* Attention + chart */}
      <div className={styles.twoCol}>
        <Card className={styles.panel}>
          <h2 className={styles.panelTitle}>Needs attention</h2>
          <p className={styles.panelSub}>
            Queues that need a personnel action right now.
          </p>
          <ul className={styles.list}>
            {attention.map((a) => (
              <li key={a.title} className={styles.listItem}>
                <div>
                  <p className={styles.listMain}>
                    {a.title}{" "}
                    {a.count > 0 && (
                      <span className={styles.status} data-tone={a.tone}>
                        {a.count}
                      </span>
                    )}
                  </p>
                  <p className={styles.listSub}>{a.detail}</p>
                </div>
                <Link
                  href={a.href}
                  className={styles.inspectLinkSecondary}
                >
                  {a.cta}
                </Link>
              </li>
            ))}
          </ul>
        </Card>

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
                      <td>{fmtDate(d.date_delivered)}</td>
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
                            ? cap(d.inspection_status)
                            : "Pending"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div>
            <Link
              href="/personnel/deliveries"
              className={styles.inspectLinkSecondary}
            >
              View all deliveries
            </Link>
          </div>
        </Card>
      </div>

      {/* Chart — passes real data down to client component */}
      <OverviewChart data={monthly} />

      {/* Requests + repairs */}
      <div className={styles.twoCol}>
        <Card className={styles.panel}>
          <h2 className={styles.panelTitle}>Recent requests</h2>
          {recentRequests.length === 0 ? (
            <p className={styles.panelSub}>No employee requests yet.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Type</th>
                    <th>Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRequests.map((r) => (
                    <tr key={r.id}>
                      <td>{r.employee_name}</td>
                      <td>{shortRequestType(r.request_type)}</td>
                      <td>{fmtDate(r.date_requested)}</td>
                      <td>
                        <span
                          className={styles.status}
                          data-tone={requestTone(r.status)}
                        >
                          {cap(r.status ?? "pending")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div>
            <Link
              href="/personnel/requests"
              className={styles.inspectLinkSecondary}
            >
              Review requests
            </Link>
          </div>
        </Card>

        <Card className={styles.panel}>
          <h2 className={styles.panelTitle}>Recent repairs</h2>
          {recentRepairs.length === 0 ? (
            <p className={styles.panelSub}>No repair tickets yet.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Asset / issue</th>
                    <th>Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRepairs.map((r) => (
                    <tr key={r.id}>
                      <td>
                        {r.asset_label ?? r.description.slice(0, 60)}
                        {r.technician ? ` · ${r.technician}` : ""}
                      </td>
                      <td>{fmtDate(r.repair_date)}</td>
                      <td>
                        <span
                          className={styles.status}
                          data-tone={repairTone(r.status)}
                        >
                          {cap(r.status ?? "pending")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div>
            <Link
              href="/personnel/repairs"
              className={styles.inspectLinkSecondary}
            >
              Track repairs
            </Link>
          </div>
        </Card>
      </div>

      {/* Stock + issuances */}
      <div className={styles.twoCol}>
        <Card className={styles.panel}>
          <h2 className={styles.panelTitle}>Low-stock watchlist</h2>
          {lowStock.length === 0 ? (
            <p className={styles.panelSub}>
              All stock levels healthy — nothing at or below threshold.
            </p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>On hand</th>
                    <th>Level</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStock.map((s) => (
                    <tr key={s.id}>
                      <td>{s.item_name}</td>
                      <td>
                        {s.quantity}
                        {s.unit ? ` ${s.unit}` : ""}
                      </td>
                      <td>
                        <span
                          className={styles.status}
                          data-tone={stockTone(s.level)}
                        >
                          {stockLabel(s.level)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div>
            <Link
              href="/personnel/inventory"
              className={styles.inspectLinkSecondary}
            >
              Manage stocks
            </Link>
          </div>
        </Card>

        <Card className={styles.panel}>
          <h2 className={styles.panelTitle}>Recent PAR / ICS</h2>
          {recentIssuances.length === 0 ? (
            <p className={styles.panelSub}>
              No accountability documents issued yet.
            </p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Doc</th>
                    <th>End user</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recentIssuances.map((r) => (
                    <tr key={r.id}>
                      <td>
                        {r.doc_type}
                        {r.doc_no ? ` · ${r.doc_no}` : ""}
                      </td>
                      <td>{r.employee_name}</td>
                      <td>{fmtDate(r.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div>
            <Link
              href="/personnel/issuances"
              className={styles.inspectLinkSecondary}
            >
              View issuances
            </Link>
          </div>
        </Card>
      </div>

      {/* Module grid — every area with a live status line */}
      <div className={styles.grid}>
        {modules.map((mod) => (
          <Link key={mod.href} href={mod.href} className={styles.cardLink}>
            <Card>
              <h2 className="text-lg font-semibold">{mod.title}</h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {mod.description}
              </p>
              <p className={styles.statDelta}>{mod.meta}</p>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
