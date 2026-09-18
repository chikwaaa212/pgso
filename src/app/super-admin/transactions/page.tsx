"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { label } from "@/lib/labels";
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
import { useReceipt } from "@/hooks/use-receipt";
import { CLIENT_CACHE_KEYS } from "@/lib/client-cache";
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

export default function SuperAdminTransactionsPage() {
  // Cached snapshot (stats + 4 recent lists): back-navigation paints
  // instantly from memory / sessionStorage and only revalidates silently
  // when stale (60s, matching the server caches) — same SWR pattern as
  // the other admin pages.
  const { data: snapshot, loading } = useCachedAction(
    CLIENT_CACHE_KEYS.adminTransactions,
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

  if (loading) {
    return <TransactionsLoading />;
  }

  const issuanceDoc = issuanceR.doc ?? null;
  const issuanceIsIcs = issuanceDoc?.doc_type === "ICS";

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Super Admin / Transactions</p>
      <div>
        <h1 className={styles.title}>Transactions</h1>
        <p className={styles.subtitle}>
          {stats?.totalDeliveries ?? 0} deliveries · {stats?.pendingInspections ?? 0} pending
          inspection · {stats?.pendingRequests ?? 0} pending requests ·{' '}
          {(stats?.pendingRepairs ?? 0) + (stats?.inProgressRepairs ?? 0)} active repairs ·{' '}
          {stats?.totalIssuances ?? 0} PAR/ICS issued · view-only oversight
        </p>
      </div>

      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>Recent deliveries</h2>
        <p className={styles.panelSub}>
          Newest first. Open a row to see the full delivery record.
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Supplier</th>
                <th>PO ref</th>
                <th>Date</th>
                <th>Status</th>
                <th>Inspection</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((d) => (
                <tr key={d.id}>
                  <td>{d.supplier ?? "—"}</td>
                  <td>{d.po_reference ?? "—"}</td>
                  <td>{fmtDate(d.date_delivered)}</td>
                  <td>
                    <span className={styles.status} data-tone="info">
                      {label(d.delivery_status)}
                    </span>
                  </td>
                  <td>
                    <span
                      className={styles.status}
                      data-tone={
                        d.inspection_status === "passed"
                          ? "ok"
                          : d.inspection_status === "failed"
                            ? "bad"
                            : "warn"
                      }
                    >
                      {label(d.inspection_status)}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className={`${actionStyles.inspectLinkSecondary} cursor-pointer`}
                      aria-label={`View details for delivery ${d.id.slice(0, 8).toUpperCase()}`}
                      onClick={() => openDelivery(d.id)}
                    >
                      View Details
                    </button>
                  </td>
                </tr>
              ))}
              {deliveries.length === 0 && (
                <tr>
                  <td colSpan={6} className={styles.empty}>No deliveries logged yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>Recent employee requests</h2>
        <p className={styles.panelSub}>Transfer, new-assignment and repair requests.</p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Type</th>
                <th>Date</th>
                <th>Status</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id}>
                  <td>{r.employee_name}</td>
                  <td>{label(r.request_type)}</td>
                  <td>{fmtDate(r.date_requested)}</td>
                  <td>
                    <span
                      className={styles.status}
                      data-tone={
                        r.status === "completed"
                          ? "ok"
                          : r.status === "rejected"
                            ? "bad"
                            : r.status === "approved"
                              ? "info"
                              : "warn"
                      }
                    >
                      {label(r.status)}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className={`${actionStyles.inspectLinkSecondary} cursor-pointer`}
                      aria-label={`View details for request ${r.id.slice(0, 8).toUpperCase()}`}
                      onClick={() => openRequest(r.id)}
                    >
                      View Details
                    </button>
                  </td>
                </tr>
              ))}
              {requests.length === 0 && (
                <tr>
                  <td colSpan={5} className={styles.empty}>No requests yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>Recent repairs</h2>
        <p className={styles.panelSub}>Repair tickets and technicians.</p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Asset / issue</th>
                <th>Technician</th>
                <th>Date</th>
                <th>Status</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {repairs.map((r) => (
                <tr key={r.id}>
                  <td>{r.asset_label ?? r.description.slice(0, 60)}</td>
                  <td>{r.technician ?? "—"}</td>
                  <td>{fmtDate(r.repair_date)}</td>
                  <td>
                    <span
                      className={styles.status}
                      data-tone={r.status === "completed" ? "ok" : r.status === "in_progress" ? "info" : "warn"}
                    >
                      {label(r.status)}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className={`${actionStyles.inspectLinkSecondary} cursor-pointer`}
                      aria-label={`View details for repair ${r.id.slice(0, 8).toUpperCase()}`}
                      onClick={() => openRepair(r.id)}
                    >
                      View Details
                    </button>
                  </td>
                </tr>
              ))}
              {repairs.length === 0 && (
                <tr>
                  <td colSpan={5} className={styles.empty}>No repair tickets yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>Recent PAR / ICS issuances</h2>
        <p className={styles.panelSub}>Accountability documents issued to end users.</p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Doc</th>
                <th>End user</th>
                <th>Date</th>
                <th>Report</th>
              </tr>
            </thead>
            <tbody>
              {issuances.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.doc_type}
                    {r.doc_no ? ` · ${r.doc_no}` : ""}
                  </td>
                  <td>{r.employee_name}</td>
                  <td>{fmtDate(r.created_at)}</td>
                  <td>
                    <button
                      type="button"
                      className={`${actionStyles.inspectLinkSecondary} cursor-pointer`}
                      aria-label={`View ${r.doc_type} report ${r.doc_no ?? r.id.slice(0, 8).toUpperCase()}`}
                      onClick={() => openIssuance(r.id)}
                    >
                      View {r.doc_type}
                    </button>
                  </td>
                </tr>
              ))}
              {issuances.length === 0 && (
                <tr>
                  <td colSpan={4} className={styles.empty}>Nothing issued yet.</td>
                </tr>
              )}
            </tbody>
          </table>
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
            <p className={styles.panelSub}>No delivery record found.</p>
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
            <p className={styles.panelSub}>
              This record is no longer available.
            </p>
          </div>
        ) : (
          <div
            className={receipt.receiptStack}
            style={{ maxWidth: "none" }}
          >
            <RepairReceipt repair={repairR.doc} />
            <p className={styles.panelSub} style={{ textAlign: "center" }}>
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
            <p className={styles.panelSub}>
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
            <p className={styles.panelSub}>
              <Link
                href={`/super-admin/issuances/${issuanceDoc.id}`}
                className={actionStyles.inspectLinkSecondary}
              >
                Open full report
              </Link>{" "}
              ·{" "}
              <a
                href={`/api/personnel/issuances/${issuanceDoc.id}/${issuanceIsIcs ? "ics-xlsx" : "par-xlsx"}`}
                className={actionStyles.inspectLinkSecondary}
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
