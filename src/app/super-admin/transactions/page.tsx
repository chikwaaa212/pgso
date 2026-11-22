"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ClipboardCheck,
  ClipboardList,
  FileCheck2,
  Inbox,
  RefreshCw,
  Search,
  Truck,
  Wrench,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/personnel/PageHeader";
import { label } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { getRecentDeliveries } from "@/app/personnel/inspections/actions";
import {
  getOperationsStats,
  getRecentIssuances,
  getRecentRepairs,
  getRecentRequests,
} from "@/app/personnel/dashboard/actions";
import { browseDelivery, browseRepair, browseIssuance, browseRequest } from "../browse/actions";
import type { BrowseRequestRow } from "../browse/actions";
import type { DeliveryDetails } from "@/app/personnel/deliveries/actions";
import type { RepairRow } from "@/app/personnel/repairs/actions";
import type { IssuanceDetail } from "@/app/personnel/issuances/actions";
import { useCachedAction } from "@/hooks/use-cached-action";
import { buildQueryKey } from "@/lib/query-keys";
import { useReceipt } from "@/hooks/use-receipt";
import { ReceiptLoading } from "@/components/personnel/ReceiptLoading";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ReceiptOverlay } from "@/app/personnel/documents/receipt-overlay";
import { DeliveryReceipt } from "@/app/personnel/deliveries/[id]/delivery-receipt";
import { RepairReceipt } from "@/app/personnel/repairs/repair-receipt";
import { ParReportSheet } from "@/app/personnel/documents/par-report";
import { IcsReportSheet } from "@/app/personnel/documents/ics-report";
import receipt from "@/app/personnel/inspections/components/receipt.module.css";
import TransactionsLoading from "./loading";
import actionStyles from "@/app/personnel/dashboard/page.module.css";
import ui from "@/components/personnel/personnel-ui.module.css";
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

/** Yellow 24px action buttons — same treatment as Assets / Inspections / Users. */
const ACTION_BTN = cn(
  "h-6 gap-1.5 rounded-[4px] border border-yellow-500 bg-yellow-500 px-3 text-xs font-semibold",
  "text-navy-900 opacity-[0.85] transition-colors hover:bg-yellow-400 hover:text-navy-900 hover:opacity-100 disabled:opacity-40"
);

const VIEW_TABS = [
  { value: "deliveries", label: "Deliveries" },
  { value: "requests", label: "Requests" },
  { value: "repairs", label: "Repairs" },
  { value: "issuances", label: "PAR / ICS" },
] as const;

type ViewTab = (typeof VIEW_TABS)[number]["value"];

function statusTone(value: string | null) {
  if (value === "passed" || value === "completed") return "ok";
  if (value === "failed" || value === "rejected") return "bad";
  if (value === "approved" || value === "in_progress") return "info";
  return "warn";
}

/**
 * Delivery status mirrors the personnel delivery log: a passed inspection
 * marks the delivery as Delivered; otherwise the log-time state still
 * applies (arrival / legacy waiting for arrival).
 */
function deliveryStatusLabel(status: string | null, inspection: string | null) {
  if (inspection === "passed") return "Delivered";
  if (status === "awaiting") return "Waiting for arrival";
  if (status === "arrival") return "Arrival";
  return "Delivered";
}

export default function SuperAdminTransactionsPage() {
  const [view, setView] = useState<ViewTab>("deliveries");
  const [query, setQuery] = useState("");

  // Cached snapshot (stats + 4 recent lists): back-navigation paints
  // instantly from memory / sessionStorage and only revalidates silently
  // when stale (60s, matching the server caches) — same SWR pattern as
  // the other admin pages.
  const { data: snapshot, loading, isValidating, refresh } = useCachedAction(
    buildQueryKey({ module: 'super-admin', resource: 'transactions' }),
    () =>
      Promise.all([
        getOperationsStats(),
        getRecentDeliveries(10),
        getRecentRequests(10),
        getRecentRepairs(10),
        getRecentIssuances(10),
      ]).then(([stats, deliveries, requests, repairs, issuances]) => ({
        stats,
        deliveries,
        requests,
        repairs,
        issuances,
      })),
    { staleTime: 60_000 }
  );
  const stats = snapshot?.stats;
  const deliveries = useMemo(() => snapshot?.deliveries ?? [], [snapshot]);
  const requests = useMemo(() => snapshot?.requests ?? [], [snapshot]);
  const repairs = useMemo(() => snapshot?.repairs ?? [], [snapshot]);
  const issuances = useMemo(() => snapshot?.issuances ?? [], [snapshot]);

  // Overlay receipt viewers with per-record client caching (same shared
  // scheme as the other admin pages — admin-prefixed keys keep per-role
  // caches separate): viewing a record opens a modal, not a new page.
  const deliveryR = useReceipt<DeliveryDetails>();
  const repairR = useReceipt<RepairRow | null>();
  const issuanceR = useReceipt<IssuanceDetail | null>();
  const openDelivery = (id: string) =>
    deliveryR.open(id, `admin-delivery:${id}`, () =>
      browseDelivery(id).then((detail) => {
        if (!detail) throw new Error("Delivery not found.");
        return detail;
      })
    );
  const openRepair = (id: string) =>
    repairR.open(id, `admin-repair:${id}`, () => browseRepair(id));
  const openIssuance = (id: string) =>
    issuanceR.open(id, `admin-issuance:${id}`, () => browseIssuance(id));
  const requestR = useReceipt<BrowseRequestRow | null>();
  const openRequest = (id: string) =>
    requestR.open(id, `admin-request:${id}`, () => browseRequest(id));

  const needle = query.trim().toLowerCase();
  const matches = (...values: (string | null | undefined)[]) =>
    needle === "" ||
    values.some((v) => (v ?? "").toLowerCase().includes(needle));

  // The recent lists are capped at 10 rows, so filtering inline is cheaper
  // than memoizing — typing never refetches and results never lag a key.
  const filteredDeliveries = deliveries.filter((d) =>
    matches(
      d.supplier,
      d.po_reference,
      deliveryStatusLabel(d.delivery_status, d.inspection_status),
      label(d.inspection_status)
    )
  );
  const filteredRequests = requests.filter((r) =>
    matches(r.employee_name, label(r.request_type), label(r.status))
  );
  const filteredRepairs = repairs.filter((r) =>
    matches(r.asset_label, r.description, r.technician, label(r.status))
  );
  const filteredIssuances = issuances.filter((r) =>
    matches(r.doc_type, r.doc_no, r.employee_name)
  );

  const counts: Record<ViewTab, number> = {
    deliveries: deliveries.length,
    requests: requests.length,
    repairs: repairs.length,
    issuances: issuances.length,
  };
  const filteredCounts: Record<ViewTab, number> = {
    deliveries: filteredDeliveries.length,
    requests: filteredRequests.length,
    repairs: filteredRepairs.length,
    issuances: filteredIssuances.length,
  };

  if (loading) {
    return <TransactionsLoading />;
  }

  const issuanceDoc = issuanceR.doc ?? null;
  const issuanceIsIcs = issuanceDoc?.doc_type === "ICS";
  const activeRepairs =
    (stats?.pendingRepairs ?? 0) + (stats?.inProgressRepairs ?? 0);

  const tiles = [
    {
      label: "Deliveries",
      value: stats?.totalDeliveries ?? 0,
      meta: `${stats?.completedInspections ?? 0} inspections completed`,
      tone: "info" as const,
      icon: Truck,
      tab: "deliveries" as ViewTab,
    },
    {
      label: "Pending inspections",
      value: stats?.pendingInspections ?? 0,
      meta: "deliveries awaiting processing",
      tone: "warn" as const,
      icon: ClipboardCheck,
      tab: "deliveries" as ViewTab,
    },
    {
      label: "Pending requests",
      value: stats?.pendingRequests ?? 0,
      meta: "awaiting a decision",
      tone: "warn" as const,
      icon: Inbox,
      tab: "requests" as ViewTab,
    },
    {
      label: "Active repairs",
      value: activeRepairs,
      meta: `${stats?.pendingRepairs ?? 0} pending · ${stats?.inProgressRepairs ?? 0} in progress`,
      tone: "info" as const,
      icon: Wrench,
      tab: "repairs" as ViewTab,
    },
    {
      label: "PAR / ICS issued",
      value: stats?.totalIssuances ?? 0,
      meta: "accountability documents",
      tone: "ok" as const,
      icon: FileCheck2,
      tab: "issuances" as ViewTab,
    },
  ];

  const searchPlaceholder =
    view === "deliveries"
      ? "Search supplier, PO reference, status…"
      : view === "requests"
        ? "Search employee, request type, status…"
        : view === "repairs"
          ? "Search asset, issue, technician…"
          : "Search document no., end user, type…";

  const emptyCopy =
    view === "deliveries"
      ? "No deliveries have been logged yet."
      : view === "requests"
        ? "No employee requests have been filed yet."
        : view === "repairs"
          ? "No repair tickets have been raised yet."
          : "No PAR or ICS has been issued yet.";

  const rowAction = (labelText: string, onClick: () => void, ariaLabel: string) => (
    <button
      type="button"
      className={cn(ACTION_BTN, "cursor-pointer")}
      aria-label={ariaLabel}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {labelText}
    </button>
  );

  const currentCount = filteredCounts[view] ?? 0;
  const tabTotal = counts[view] ?? 0;

  return (
    <section className={styles.section}>
      <PageHeader
        eyebrow="Operations ledger"
        title="Transactions"
        subtitle="Every delivery, employee request, repair ticket and PAR/ICS issued across the province — inspect any record in a read-only overlay."
        meta={
          <>
            {stats?.totalDeliveries ?? 0} deliveries · {stats?.pendingRequests ?? 0}{" "}
            pending requests · {(stats?.pendingInspections ?? 0)} pending inspections ·{" "}
            {activeRepairs} active repairs · {stats?.totalIssuances ?? 0} PAR/ICS issued
            {isValidating ? <span className={styles.updating}> · Updating…</span> : null}
          </>
        }
        actions={
          <Button
            type="button"
            onClick={refresh}
            disabled={isValidating}
            title="Reload the latest transactions"
            className={ACTION_BTN}
          >
            <RefreshCw
              size={14}
              aria-hidden="true"
              className={isValidating ? "animate-spin" : undefined}
            />
            {isValidating ? "Refreshing…" : "Refresh"}
          </Button>
        }
      />

      {/* Summary tiles — each one jumps straight to the matching stream */}
      <div className={ui.tiles}>
        {tiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <button
              key={tile.label}
              type="button"
              title={`Show recent ${tile.label.toLowerCase()}`}
              className={cn(ui.tile, styles.tileButton)}
              data-tone={tile.tone}
              data-active={view === tile.tab}
              onClick={() => {
                setView(tile.tab);
                setQuery("");
              }}
            >
              <span className={ui.tileIcon}>
                <Icon size={16} aria-hidden="true" />
              </span>
              <div className={ui.tileBody}>
                <p className={ui.tileLabel}>{tile.label}</p>
                <p className={ui.tileValue}>{tile.value.toLocaleString()}</p>
                <p className={ui.tileMeta}>{tile.meta}</p>
              </div>
            </button>
          );
        })}
      </div>

      <Card className={styles.panel}>
        <div className={styles.panelHead}>
          <div className={styles.tabs} role="tablist" aria-label="Transaction type">
            {VIEW_TABS.map((tab) => {
              const active = view === tab.value;
              return (
                <button
                  key={tab.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={styles.tab}
                  data-active={active}
                  onClick={() => {
                    setView(tab.value);
                    setQuery("");
                  }}
                >
                  {tab.label}
                  <span className={styles.tabCount} data-active={active}>
                    {counts[tab.value]}
                  </span>
                </button>
              );
            })}
          </div>

          <div className={styles.filters}>
            <div className={styles.searchWrap}>
              <Search size={15} aria-hidden="true" className={styles.searchIcon} />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className={styles.search}
                aria-label={searchPlaceholder}
              />
            </div>
            {query.trim() !== "" ? (
              <button
                type="button"
                className={styles.clearBtn}
                onClick={() => setQuery("")}
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>

        {currentCount === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>
              {query.trim() !== "" ? (
                <Search size={20} aria-hidden="true" />
              ) : (
                <ClipboardList size={20} aria-hidden="true" />
              )}
            </span>
            <p className={styles.emptyTitle}>
              {query.trim() !== "" ? "No matching records" : "Nothing here yet"}
            </p>
            <p className={styles.emptyText}>
              {query.trim() !== ""
                ? "Try a different keyword, or clear the search to see every record."
                : emptyCopy}
            </p>
            {query.trim() !== "" ? (
              <button
                type="button"
                className={styles.emptyAction}
                onClick={() => setQuery("")}
              >
                Clear search
              </button>
            ) : null}
          </div>
        ) : (
          <div className={styles.tableWrap}>
            {view === "deliveries" ? (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Supplier</th>
                    <th>PO reference</th>
                    <th>Date delivered</th>
                    <th>Delivery status</th>
                    <th>Inspection</th>
                    <th className={styles.actionHead}>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDeliveries.map((d) => (
                    <tr
                      key={d.id}
                      className={styles.bodyRow}
                      tabIndex={0}
                      onClick={() => openDelivery(d.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openDelivery(d.id);
                        }
                      }}
                    >
                      <td>
                        <span className={styles.cellMain}>{d.supplier ?? "—"}</span>
                      </td>
                      <td>
                        <span className={styles.mono}>{d.po_reference ?? "—"}</span>
                      </td>
                      <td>{fmtDate(d.date_delivered ?? d.expected_arrival_date)}</td>
                      <td>
                        <span
                          className={styles.badge}
                          data-tone={
                            deliveryStatusLabel(d.delivery_status, d.inspection_status) ===
                            "Delivered"
                              ? "ok"
                              : "info"
                          }
                        >
                          {deliveryStatusLabel(d.delivery_status, d.inspection_status)}
                        </span>
                      </td>
                      <td>
                        <span
                          className={styles.badge}
                          data-tone={statusTone(d.inspection_status)}
                        >
                          {label(d.inspection_status)}
                        </span>
                      </td>
                      <td className={styles.actionCell}>
                        {rowAction(
                          "View details",
                          () => openDelivery(d.id),
                          `View details for delivery ${d.id.slice(0, 8).toUpperCase()}`
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}

            {view === "requests" ? (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Request type</th>
                    <th>Date requested</th>
                    <th>Status</th>
                    <th className={styles.actionHead}>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRequests.map((r) => (
                    <tr
                      key={r.id}
                      className={styles.bodyRow}
                      tabIndex={0}
                      onClick={() => openRequest(r.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openRequest(r.id);
                        }
                      }}
                    >
                      <td>
                        <span className={styles.cellMain}>{r.employee_name}</span>
                      </td>
                      <td>{label(r.request_type)}</td>
                      <td>{fmtDate(r.date_requested)}</td>
                      <td>
                        <span className={styles.badge} data-tone={statusTone(r.status)}>
                          {label(r.status)}
                        </span>
                      </td>
                      <td className={styles.actionCell}>
                        {rowAction(
                          "View details",
                          () => openRequest(r.id),
                          `View details for request ${r.id.slice(0, 8).toUpperCase()}`
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}

            {view === "repairs" ? (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Asset / issue</th>
                    <th>Technician</th>
                    <th>Repair date</th>
                    <th>Status</th>
                    <th className={styles.actionHead}>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRepairs.map((r) => (
                    <tr
                      key={r.id}
                      className={styles.bodyRow}
                      tabIndex={0}
                      onClick={() => openRepair(r.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openRepair(r.id);
                        }
                      }}
                    >
                      <td>
                        <span className={styles.cellMain}>
                          {r.asset_label ?? r.description.slice(0, 60)}
                        </span>
                        {r.asset_label && r.description ? (
                          <span className={styles.cellSub}>
                            {r.description.slice(0, 80)}
                          </span>
                        ) : null}
                      </td>
                      <td>{r.technician ?? "—"}</td>
                      <td>{fmtDate(r.repair_date)}</td>
                      <td>
                        <span className={styles.badge} data-tone={statusTone(r.status)}>
                          {label(r.status)}
                        </span>
                      </td>
                      <td className={styles.actionCell}>
                        {rowAction(
                          "View details",
                          () => openRepair(r.id),
                          `View details for repair ${r.id.slice(0, 8).toUpperCase()}`
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}

            {view === "issuances" ? (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>End user</th>
                    <th>Date issued</th>
                    <th className={styles.actionHead}>Report</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredIssuances.map((r) => (
                    <tr
                      key={r.id}
                      className={styles.bodyRow}
                      tabIndex={0}
                      onClick={() => openIssuance(r.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openIssuance(r.id);
                        }
                      }}
                    >
                      <td>
                        <span
                          className={styles.badge}
                          data-tone={r.doc_type === "PAR" ? "info" : "neutral"}
                        >
                          {r.doc_type}
                        </span>
                        <span className={styles.cellSub}>
                          {r.doc_no ? `No. ${r.doc_no}` : "No document number"}
                        </span>
                      </td>
                      <td>
                        <span className={styles.cellMain}>{r.employee_name}</span>
                      </td>
                      <td>{fmtDate(r.created_at)}</td>
                      <td className={styles.actionCell}>
                        {rowAction(
                          `View ${r.doc_type}`,
                          () => openIssuance(r.id),
                          `View ${r.doc_type} report ${r.doc_no ?? r.id.slice(0, 8).toUpperCase()}`
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
        )}

        <div className={styles.panelFoot}>
          <span className={styles.footInfo}>
            Showing <strong>{currentCount}</strong> of{" "}
            <strong>{tabTotal}</strong> recent{" "}
            {VIEW_TABS.find((t) => t.value === view)?.label.toLowerCase()}
            {query.trim() !== "" ? " matching your search" : " · newest first"}
          </span>
          <span className={styles.footHint}>
            Select any row to open its read-only record
          </span>
        </div>
      </Card>

      <Dialog
        open={requestR.selectedId !== null}
        onOpenChange={(v) => {
          if (!v) requestR.close();
        }}
      >
        <DialogContent className="pgso-no-scrollbar sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Request details — read only</DialogTitle>
            <DialogDescription>
              Full request record as filed. No changes can be made here.
            </DialogDescription>
          </DialogHeader>
          {requestR.docLoading ? (
            <ReceiptLoading label="Loading request…" />
          ) : !requestR.doc ? (
            <p className="text-sm text-navy-600">Record not found.</p>
          ) : (
            <dl className="grid gap-x-4 gap-y-2 rounded-md border border-navy-200 bg-navy-50/50 px-3 py-2.5 text-sm sm:grid-cols-2">
              {(
                [
                  ["Employee", requestR.doc.employee_name],
                  ["Type", label(requestR.doc.request_type)],
                  [
                    "Item",
                    requestR.doc.account_code ??
                      requestR.doc.asset_label ??
                      "—",
                  ],
                  ["Filed by", requestR.doc.logged_by ?? "—"],
                  ["Requested", fmtDate(requestR.doc.date_requested)],
                  ["Resolved", fmtDate(requestR.doc.date_resolved)],
                  ["Status", label(requestR.doc.status)],
                ] as const
              ).map(([term, value]) => (
                <div key={term} className="grid gap-0.5">
                  <dt className="text-xs font-medium text-zinc-500">{term}</dt>
                  <dd className="font-medium">{value}</dd>
                </div>
              ))}
              <div className="grid gap-0.5 sm:col-span-2">
                <dt className="text-xs font-medium text-zinc-500">
                  Details
                </dt>
                <dd className="whitespace-pre-wrap font-medium">
                  {requestR.doc.description || "—"}
                </dd>
              </div>
            </dl>
          )}
          <DialogFooter>
            <button
              type="button"
              className={actionStyles.inspectLink}
              onClick={() => requestR.close()}
            >
              Close
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReceiptOverlay
        open={deliveryR.selectedId !== null}
        title="Delivery receipt"
        onClose={deliveryR.close}
      >
        {deliveryR.docLoading ? (
          <ReceiptLoading label="Loading delivery receipt…" />
        ) : !deliveryR.doc ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyText}>No delivery record found.</p>
          </div>
        ) : (
          <div className={receipt.receiptStack} style={{ maxWidth: "none" }}>
            <DeliveryReceipt delivery={deliveryR.doc} />
          </div>
        )}
      </ReceiptOverlay>

      <ReceiptOverlay
        open={repairR.selectedId !== null}
        title="Repair receipt"
        onClose={repairR.close}
      >
        {repairR.docLoading ? (
          <ReceiptLoading label="Loading receipt…" />
        ) : !repairR.doc ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyText}>
              This record is no longer available.
            </p>
          </div>
        ) : (
          <div
            className={receipt.receiptStack}
            style={{ maxWidth: "none" }}
          >
            <RepairReceipt repair={repairR.doc} />
            <p className={styles.emptyText} style={{ textAlign: "center" }}>
              <Button
                type="button"
                variant="outline"
                onClick={() => window.print()}
                className="h-8 rounded-[4px] px-3.5 text-xs font-semibold"
              >
                Print / Save PDF
              </Button>
            </p>
          </div>
        )}
      </ReceiptOverlay>

      <ReceiptOverlay
        open={issuanceR.selectedId !== null}
        title={
          issuanceIsIcs ? "Inventory Custodian Slip" : "Property Acknowledgment Receipt"
        }
        onClose={issuanceR.close}
      >
        {issuanceR.docLoading ? (
          <ReceiptLoading label="Loading report…" />
        ) : !issuanceDoc ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyText}>
              This record is no longer available.
            </p>
          </div>
        ) : (
          <div className={receipt.receiptStack} style={{ maxWidth: "none" }}>
            {issuanceIsIcs ? (
              <IcsReportSheet issuance={issuanceDoc} />
            ) : (
              <ParReportSheet issuance={issuanceDoc} />
            )}
            <p className={styles.docLinkRow}>
              <Link
                href={`/super-admin/issuances/${issuanceDoc.id}`}
                className={styles.docLink}
              >
                Open full report
              </Link>{" "}
              ·{" "}
              <a
                href={`/api/personnel/issuances/${issuanceDoc.id}/${issuanceIsIcs ? "ics-xlsx" : "par-xlsx"}`}
                className={styles.docLink}
              >
                Download Excel
              </a>
            </p>
          </div>
        )}
      </ReceiptOverlay>
    </section>
  );
}
