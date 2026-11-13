'use client'

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { getDashboardSnapshot } from "./actions";
import { useCachedAction } from "@/hooks/use-cached-action";
import { buildQueryKey } from "@/lib/query-keys";
import DashboardLoading from "./loading";
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

/**
 * Empty state for a dashboard card: the message is centred inside the card
 * and, when the destination is known, a compact 24px action follows it.
 */
function CardEmptyState({
  message,
  action,
}: {
  message: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className={styles.emptyCard}>
      <p className={styles.emptyCardText}>{message}</p>
      {action ? (
        <Link href={action.href} className={styles.emptyCardButton}>
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

export default function PersonnelDashboard() {
  // Cached snapshot: back-navigation paints instantly from memory /
  // sessionStorage and only revalidates silently when stale — no skeleton
  // flash over data the user already saw.
  const {
    data: snapshot,
    loading,
    error,
    refresh,
  } = useCachedAction(
    buildQueryKey({ module: 'personnel', resource: 'dashboard' }),
    getDashboardSnapshot,
    { staleTime: 60_000 }
  );

  if (loading) {
    return <DashboardLoading />;
  }

  if (!snapshot) {
    return (
      <section className={styles.section}>
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.title}>Dashboard</h1>
            <p className={styles.subtitle}>
              {error || "Could not load the dashboard."}
            </p>
          </div>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.actionPrimary}
              onClick={refresh}
            >
              Retry
            </button>
          </div>
        </div>
      </section>
    );
  }

  const {
    stats,
    monthly,
    recentDeliveries,
    recentRequests,
    recentRepairs,
    lowStock,
    recentIssuances,
    aging,
    conditions,
    recommendationCount,
  } = snapshot;

  const lowTotal = stats.lowStockCount + stats.outOfStockCount;
  const activeRepairs = stats.pendingRepairs + stats.inProgressRepairs;
  const agingHasRecords = aging.summaries.some((summary) => summary.total > 0);

  const statCards = [
    {
      label: "Total Deliveries",
      value: stats.totalDeliveries.toLocaleString("en-PH"),
      delta: `${stats.pendingInspections} pending inspection`,
      href: "/personnel/deliveries",
    },
    {
      label: "Pending Inspections",
      value: stats.pendingInspections.toLocaleString("en-PH"),
      delta: stats.pendingInspections === 0 ? "All clear" : "Need review",
      href: "/personnel/inspections",
    },
    {
      label: "Pending Requests",
      value: stats.pendingRequests.toLocaleString("en-PH"),
      delta:
        stats.pendingRequests === 0 ? "Queue clear" : "Awaiting decision",
      href: "/personnel/requests",
    },
    {
      label: "Active Repairs",
      value: activeRepairs.toLocaleString("en-PH"),
      delta:
        activeRepairs === 0
          ? "No open tickets"
          : `${stats.pendingRepairs} pending · ${stats.inProgressRepairs} in progress`,
      href: "/personnel/repairs",
    },
    {
      label: "Low / Out of Stock",
      value: lowTotal.toLocaleString("en-PH"),
      delta:
        lowTotal === 0
          ? `${stats.totalStockSkus} SKUs tracked`
          : `${stats.outOfStockCount} out · ${stats.lowStockCount} low`,
      href: "/personnel/inventory",
    },
    {
      label: "Assets Tracked",
      value: stats.totalAssets.toLocaleString("en-PH"),
      delta: `${stats.totalItems.toLocaleString("en-PH")} items logged`,
      href: "/personnel/assets",
    },
    {
      label: "Recommendations",
      value: recommendationCount.toLocaleString("en-PH"),
      delta:
        recommendationCount === 0
          ? "No action flagged"
          : "Replenishment, replacement, idle",
      href: "/personnel/recommendations",
    },
    {
      label: "PAR / ICS Issued",
      value: stats.totalIssuances.toLocaleString("en-PH"),
      delta: "Accountability docs",
      href: "/personnel/issuances",
    },
    {
      label: "Open Documents",
      value: stats.totalDocuments.toLocaleString("en-PH"),
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

  const attentionHasRecords = attention.some((item) => item.count > 0);

  return (
    <section className={styles.section}>
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
          <Card key={stat.label} className={`${styles.statCard} p-4`}>
            <span className={styles.statLabel}>{stat.label}</span>
            <span className={styles.statValue}>{stat.value}</span>
            <div className={styles.statFooter}>
              <span className={styles.statDelta}>{stat.delta}</span>
              <Link
                href={stat.href}
                className={styles.statButton}
                aria-label={`Open ${stat.label}`}
              >
                Open
              </Link>
            </div>
          </Card>
        ))}
      </div>

      {/* Attention + chart */}
      <div className={styles.twoCol}>
        <Card className={`${styles.panel} p-4`}>
          <h2 className={styles.panelTitle}>Needs attention</h2>
          <p className={styles.panelSub}>
            Queues that need a personnel action right now.
          </p>
          {attentionHasRecords ? (
            <div className={styles.bentoGrid}>
              {attention.map((a) => (
                <div key={a.title} className={styles.bentoTile}>
                  <p className={styles.listMain}>
                    {a.title}{" "}
                    {a.count > 0 && (
                      <span className={styles.status} data-tone={a.tone}>
                        {a.count}
                      </span>
                    )}
                  </p>
                  <p className={styles.listSub}>{a.detail}</p>
                  <Link
                    href={a.href}
                    className={styles.attentionAction}
                  >
                    {a.cta}
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <CardEmptyState
              message="Nothing needs attention right now."
              action={{ label: "View reports", href: "/personnel/reports" }}
            />
          )}
        </Card>

        <Card className={`${styles.panel} p-4`}>
          <h2 className={styles.panelTitle}>Recent deliveries</h2>
          {recentDeliveries.length === 0 ? (
            <CardEmptyState
              message="No deliveries logged yet."
              action={{ label: "Log delivery", href: "/personnel/deliveries" }}
            />
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
                          {d.inspection_status === "failed"
                            ? "Returned to supplier"
                            : d.inspection_status
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
          {recentDeliveries.length > 0 && (
            <div className={styles.panelFooter}>
              <Link
                href="/personnel/deliveries"
                className={styles.inspectLink}
              >
                View all deliveries
              </Link>
            </div>
          )}
        </Card>
      </div>

      {/* Chart — passes real data down to client component */}
      <OverviewChart data={monthly} />

      {/* Reports summary — Objective 4 descriptive analytics */}
      <div className={styles.twoCol}>
        <Card className={`${styles.panel} p-4`}>
          <h2 className={styles.panelTitle}>Aging &amp; delays</h2>
          <p className={styles.panelSub}>
            Open records older than {aging.thresholdDays} days are delayed.
          </p>
          {agingHasRecords ? (
            <ul className={styles.list}>
              {aging.summaries.map((summary) => (
                <li key={summary.module} className={styles.listItem}>
                  <div>
                    <p className={styles.listMain}>
                      {summary.label}{" "}
                      {summary.delayed > 0 && (
                        <span className={styles.status} data-tone="bad">
                          {summary.delayed} delayed
                        </span>
                      )}
                    </p>
                    <p className={styles.listSub}>
                      {summary.total} open · oldest {summary.oldestDays} day
                      {summary.oldestDays === 1 ? "" : "s"}
                    </p>
                  </div>
                  <Link
                    href={summary.href}
                    className={styles.attentionAction}
                  >
                    Open
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <CardEmptyState
              message="No open records to age yet."
              action={{
                label: "View reports",
                href: "/personnel/reports",
              }}
            />
          )}
          {agingHasRecords && (
            <div className={styles.panelFooter}>
              <Link href="/personnel/reports" className={styles.inspectLink}>
                View full reports
              </Link>
            </div>
          )}
        </Card>

        <Card className={`${styles.panel} p-4`}>
          <h2 className={styles.panelTitle}>Asset conditions</h2>
          <p className={styles.panelSub}>
            {conditions.serviceablePct}% serviceable across{" "}
            {conditions.total} registered assets.
          </p>
          {conditions.rows.length === 0 ? (
            <CardEmptyState
              message="No assets registered yet."
              action={{ label: "View assets", href: "/personnel/assets" }}
            />
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Condition</th>
                    <th>Assets</th>
                    <th>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {conditions.rows.slice(0, 5).map((row) => (
                    <tr key={row.condition}>
                      <td>{row.label}</td>
                      <td>{row.count.toLocaleString("en-PH")}</td>
                      <td>{row.pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {conditions.rows.length > 0 && (
            <div className={styles.panelFooter}>
              <Link href="/personnel/reports" className={styles.inspectLink}>
                Condition report
              </Link>
            </div>
          )}
        </Card>
      </div>

      {/* Requests + repairs */}
      <div className={styles.twoCol}>
        <Card className={`${styles.panel} p-4`}>
          <h2 className={styles.panelTitle}>Recent requests</h2>
          {recentRequests.length === 0 ? (
            <CardEmptyState
              message="No employee requests yet."
              action={{ label: "Review requests", href: "/personnel/requests" }}
            />
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
          {recentRequests.length > 0 && (
            <div className={styles.panelFooter}>
              <Link
                href="/personnel/requests"
                className={styles.inspectLink}
              >
                Review requests
              </Link>
            </div>
          )}
        </Card>

        <Card className={`${styles.panel} p-4`}>
          <h2 className={styles.panelTitle}>Recent repairs</h2>
          {recentRepairs.length === 0 ? (
            <CardEmptyState
              message="No repair tickets yet."
              action={{ label: "Track repairs", href: "/personnel/repairs" }}
            />
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
          {recentRepairs.length > 0 && (
            <div className={styles.panelFooter}>
              <Link
                href="/personnel/repairs"
                className={styles.inspectLink}
              >
                Track repairs
              </Link>
            </div>
          )}
        </Card>
      </div>

      {/* Stock + issuances */}
      <div className={styles.twoCol}>
        <Card className={`${styles.panel} p-4`}>
          <h2 className={styles.panelTitle}>Low-stock watchlist</h2>
          {lowStock.length === 0 ? (
            <CardEmptyState
              message="All stock levels healthy — nothing at or below threshold."
              action={{ label: "Manage stocks", href: "/personnel/inventory" }}
            />
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
          {lowStock.length > 0 && (
            <div className={styles.panelFooter}>
              <Link
                href="/personnel/inventory"
                className={styles.inspectLink}
              >
                Manage stocks
              </Link>
            </div>
          )}
        </Card>

        <Card className={`${styles.panel} p-4`}>
          <h2 className={styles.panelTitle}>Recent PAR / ICS</h2>
          {recentIssuances.length === 0 ? (
            <CardEmptyState
              message="No accountability documents issued yet."
              action={{ label: "View issuances", href: "/personnel/issuances" }}
            />
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
          {recentIssuances.length > 0 && (
            <div className={styles.panelFooter}>
              <Link
                href="/personnel/issuances"
                className={styles.inspectLink}
              >
                View issuances
              </Link>
            </div>
          )}
        </Card>
      </div>
    </section>
  );
}
