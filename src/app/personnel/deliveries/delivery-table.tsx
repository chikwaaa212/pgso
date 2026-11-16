"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { useCachedAction } from "@/hooks/use-cached-action";
import { buildQueryKey } from "@/lib/query-keys";
import {
  DataTableSkeleton,
  PagerSkeleton,
} from "@/components/personnel/skeletons";
import { getDeliveriesPage } from "./actions";
import { EmptySearchState } from "@/components/personnel/EmptySearchState";
import { EditDeliveryModal } from "./edit-delivery-modal";
import { LogDeliveryModal } from "./log-delivery-modal";
import { ViewDeliveryDialog } from "./view-delivery-dialog";
import {
  getEmptyPendingDeliveries,
  getEmptyPendingDeliveryEdits,
  getPendingDeliveries,
  getPendingDeliveryEdits,
  subscribePendingDeliveries,
  subscribePendingDeliveryEdits,
} from "./optimistic-deliveries";
import styles from "../dashboard/page.module.css";

/** Deliveries use their own page size of 10 rows per page. */
const TABLE_PAGE_SIZE = 10;

/**
 * One fetch loads the newest rows; search + pagination then run entirely in
 * memory so typing filters instantly (no "Updating…", no stale page stack).
 */
const FETCH_LIMIT = 100;

export interface DeliveryRow {
  id: string;
  deliveryId: string;
  supplier: string;
  po: string;
  date: string;
  arrival: string;
  /** YYYY-MM-DD in Manila — used to gate inspection until arrival day. */
  arrivalKey: string | null;
  kind: string;
  status: "Arrival" | "Waiting for arrival" | "Delivered";
  itemCount: number;
  inspectionStatus: "pending" | "passed" | "failed" | "partial";
  inspectionRef: string;
  /** Optimistic row painted while the background save is still running. */
  pending?: boolean;
  /** Local token used as the React key for optimistic rows. */
  pendingToken?: string;
}

function formatDateISO(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  });
}

/** Calendar day (YYYY-MM-DD) in Manila — date-only comparisons. */
function manilaDateKey(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
  }).format(d);
}

function pageWindow(current: number, total: number) {  const start = Math.max(1, Math.min(current - 2, total - 4));
  const end = Math.min(total, start + 4);
  const pages: number[] = [];
  for (let p = Math.max(1, end - 4); p <= end; p++) pages.push(p);
  return { pages: pages.filter((p) => p >= start), start };
}

const inspectionLabel = (s: DeliveryRow["inspectionStatus"]) => {
  if (s === "pending") return "Pending";
  if (s === "failed") return "Returned to supplier";
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const inspectionTone = (s: DeliveryRow["inspectionStatus"]) => {
  if (s === "passed") return "ok";
  if (s === "failed") return "bad";
  if (s === "partial") return "warn";
  // Pending inspections read as amber (queued, waiting on someone).
  return "warn";
};

export interface DeliveryStats {
  total: number;
  pending: number;
  passed: number;
  returned: number;
}

export function DeliveryTable({
  readOnly = false,
  onStatsChange,
}: {
  readOnly?: boolean;
  onStatsChange?: (stats: DeliveryStats) => void;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const q = query.trim().toLowerCase();
  // Inspections open on the target arrival day (or later), Manila time.
  const todayKey = manilaDateKey(new Date());

  const cacheKey = buildQueryKey({
    module: 'personnel',
    resource: 'deliveries',
    page: 1,
    pageSize: FETCH_LIMIT,
    filters: { scope: 'delivery-log' },
  });
  const { data, loading } = useCachedAction(
    cacheKey,
    () => getDeliveriesPage({ page: 1, pageSize: FETCH_LIMIT }),
    { staleTime: 30_000 }
  );

  // Edits submitted from the stepper but not yet acknowledged by the server.
  // They overlay the matching row instantly; the cache bust keeps them on
  // screen until the revalidated list lands.
  const pendingEdits = useSyncExternalStore(
    subscribePendingDeliveryEdits,
    getPendingDeliveryEdits,
    getEmptyPendingDeliveryEdits
  );
  const editsById = useMemo(
    () => new Map(pendingEdits.map((e) => [e.deliveryId, e])),
    [pendingEdits]
  );

  const rows: DeliveryRow[] = useMemo(() => {
    return (data?.rows ?? []).map((d) => {
      const edit = editsById.get(d.id);
      const arrivalSource = edit
        ? edit.arrival || null
        : d.expected_arrival_date;
      return {
        id: d.id.slice(0, 8).toUpperCase(),
        deliveryId: d.id,
        supplier: edit ? edit.supplier || "—" : d.supplier ?? "—",
        po: edit ? edit.po || "—" : d.po_reference ?? "—",
        date: formatDateISO(d.logged_at),
        arrival: formatDateISO(arrivalSource),
        arrivalKey: arrivalSource ? manilaDateKey(arrivalSource) : null,
        kind: edit
          ? edit.kind
          : d.delivery_kind === "stock"
            ? "Stocks"
            : d.delivery_kind === "asset"
              ? "Assets"
              : "—",
        // A passed inspection marks the delivery as delivered; otherwise the
        // log-time state (arrival / legacy waiting for arrival) still applies.
        status:
          d.inspection_status === "passed"
            ? "Delivered"
            : d.delivery_status === "awaiting"
              ? "Waiting for arrival"
              : d.delivery_status === "arrival"
                ? "Arrival"
                : "Delivered",
        itemCount: edit ? edit.itemCount : d.item_count,
        inspectionStatus: (d.inspection_status as DeliveryRow["inspectionStatus"]) ?? "pending",
        inspectionRef: d.id.slice(0, 8).toUpperCase(),
      };
    });
  }, [data, editsById]);

  // Summary tiles are driven by the loaded window (newest rows).
  useEffect(() => {
    if (!onStatsChange) return;
    onStatsChange({
      total: rows.length,
      pending: rows.filter((r) => r.inspectionStatus === "pending").length,
      passed: rows.filter((r) => r.inspectionStatus === "passed").length,
      returned: rows.filter((r) => r.inspectionStatus === "failed").length,
    });
  }, [rows, onStatsChange]);

  // Rows submitted from the Log-delivery dialog but not yet acknowledged by
  // the server. They paint instantly; a row disappears as soon as the
  // revalidated list contains it (same delivery id or PO reference) or when
  // the write fails and the pending entry is dropped.
  const pendingRows = useSyncExternalStore(
    subscribePendingDeliveries,
    getPendingDeliveries,
    getEmptyPendingDeliveries
  );
  const optimisticRows = useMemo<DeliveryRow[]>(() => {
    const knownIds = new Set(rows.map((r) => r.deliveryId));
    const knownPos = new Set(rows.map((r) => r.po));
    return pendingRows
      .filter((p) => !p.deliveryId || !knownIds.has(p.deliveryId))
      .filter((p) => !knownPos.has(p.po))
      .map((p) => ({
        id: "—",
        deliveryId: "",
        supplier: p.supplier || "—",
        po: p.po || "—",
        date: formatDateISO(new Date(p.createdAt).toISOString()),
        arrival: formatDateISO(p.arrival || null),
        arrivalKey: p.arrival || null,
        kind: p.kind,
        status: "Arrival" as const,
        itemCount: p.itemCount,
        inspectionStatus: "pending" as const,
        inspectionRef: "",
        pending: true,
        pendingToken: p.token,
      }));
  }, [pendingRows, rows]);

  const matches = (d: DeliveryRow) =>
    q === "" ||
    d.supplier.toLowerCase().includes(q) ||
    d.po.toLowerCase().includes(q) ||
    d.id.toLowerCase().includes(q) ||
    d.status.toLowerCase().includes(q);

  // Search is local: the loaded rows are filtered as you type, so results are
  // instant and the previous page is never shown while a request is pending.
  const allRows = useMemo(
    () => [
      ...optimisticRows.filter(matches),
      ...rows.filter(matches),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [optimisticRows, rows, q]
  );

  const total = allRows.length;
  const pageCount = Math.max(1, Math.ceil(total / TABLE_PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * TABLE_PAGE_SIZE;
  const visibleRows = allRows.slice(start, start + TABLE_PAGE_SIZE);
  const { pages } = pageWindow(safePage, pageCount);

  if (loading && rows.length === 0 && pendingRows.length === 0) {
    return (
      <div aria-busy="true" aria-label="Loading deliveries">
        <DataTableSkeleton
          headers={[
            "PO ref",
            "Type",
            "Delivery",
            "Inspection",
            "Arrival date",
            "Logged by",
            "Action",
          ]}
          cols={7}
          rows={10}
          label="Loading deliveries"
        />
        <PagerSkeleton />
      </div>
    );
  }

  return (
    <div className="flex min-h-[260px] flex-col">
      <div className="mb-3 flex justify-end">
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          placeholder="Search supplier, PO, or ID…"
          aria-label="Search deliveries"
          className="h-8 w-80 max-w-full rounded-md border border-navy-300 bg-white px-3 text-sm text-navy-900 placeholder:text-navy-400 focus-visible:outline-2 focus-visible:outline-offset-2"
        />
      </div>

      {visibleRows.length === 0 ? (
        rows.length === 0 && pendingRows.length === 0 && !q ? (
          <div className={cn(styles.emptyState, "flex-1")}>
            <div className={styles.emptyCard}>
              <p className={styles.emptyCardText}>No deliveries logged yet.</p>
              {!readOnly ? <LogDeliveryModal /> : null}
            </div>
          </div>
        ) : (
          <EmptySearchState
            description="Try a different supplier, PO reference, or delivery ID."
            onClear={() => {
              setQuery("");
              setPage(1);
            }}
          />
        )
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>PO Ref</th>
                  <th>Type</th>
                  <th>Delivery</th>
                  <th>Inspection</th>
                  <th>Arrival Date</th>
                  <th>Logged By</th>
                  <th style={{ textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((d) => (
                  <tr
                    key={d.pendingToken ?? d.id}
                    className={d.pending ? "opacity-60" : undefined}
                    aria-busy={d.pending || undefined}
                  >
                    <td>{d.po}</td>
                    <td>
                      <span
                        className={styles.status}
                        data-tone={d.kind === "Assets" ? "warn" : "info"}
                      >
                        {d.kind}
                      </span>
                    </td>
                    <td>
                      <span
                        className={styles.status}
                        data-tone={d.status === "Delivered" ? "ok" : "info"}
                      >
                        {d.status}
                      </span>
                    </td>
                    <td>
                      <span
                        className={styles.status}
                        data-tone={inspectionTone(d.inspectionStatus)}
                      >
                        {inspectionLabel(d.inspectionStatus)}
                      </span>
                    </td>
                    <td>
                      {d.arrival && d.arrival !== "—" ? (
                        <span
                          className={styles.status}
                          data-tone={
                            d.arrivalKey && d.arrivalKey > todayKey ? "warn" : "ok"
                          }
                        >
                          {d.arrival}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{d.date}</td>
                    <td>
                      {d.pending ? (
                        <div className="flex items-center justify-end">
                          <span
                            className={cn(
                              "inline-flex h-6 items-center justify-center rounded-[4px]",
                              "border border-navy-200 bg-navy-50 px-3 text-xs font-medium text-navy-500",
                              "cursor-default"
                            )}
                          >
                            Saving…
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1.5">
                          <ViewDeliveryDialog
                            deliveryId={d.deliveryId}
                            deliveryRef={d.id}
                            triggerClassName={cn(
                              "inline-flex h-6 items-center justify-center rounded-[4px] px-3",
                              "border border-yellow-500/40 bg-yellow-500/20 text-xs font-semibold",
                              "text-navy-900 transition-colors hover:bg-yellow-500/30"
                            )}
                          />
                          {!readOnly && d.inspectionStatus === "pending" ? (
                            <EditDeliveryModal
                              deliveryId={d.deliveryId}
                              deliveryRef={d.id}
                              triggerClassName={cn(
                                "inline-flex h-6 items-center justify-center rounded-[4px] px-3",
                                "border border-yellow-500/40 bg-yellow-500/20 text-xs font-semibold",
                                "text-navy-900 transition-colors hover:bg-yellow-500/30"
                              )}
                            />
                          ) : null}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={cn(styles.pager, "pt-3")} style={{ marginTop: "auto" }}>
            <span className={styles.pagerInfo}>
              Showing {total === 0 ? 0 : start + 1}–{Math.min(start + TABLE_PAGE_SIZE, total)} of{" "}
              {total}
            </span>
            <div className={styles.pagerControls}>
              <button
                type="button"
                className={styles.pageBtn}
                disabled={safePage === 1}
                onClick={() => setPage(safePage - 1)}
                aria-label="Previous page"
              >
                ‹
              </button>
              {pages.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={styles.pageBtn}
                  data-active={p === safePage}
                  onClick={() => setPage(p)}
                  aria-label={`Page ${p}`}
                  aria-current={p === safePage ? "page" : undefined}
                >
                  {p}
                </button>
              ))}
              <button
                type="button"
                className={styles.pageBtn}
                disabled={safePage === pageCount}
                onClick={() => setPage(safePage + 1)}
                aria-label="Next page"
              >
                ›
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
