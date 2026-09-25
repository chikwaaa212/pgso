"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useCachedAction } from "@/hooks/use-cached-action";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { CLIENT_CACHE_KEYS } from "@/lib/client-cache";
import { FIXED_PAGE_SIZE } from "@/components/personnel/TablePager";
import {
  DataTableSkeleton,
  PagerSkeleton,
} from "@/components/personnel/skeletons";
import { InspectConfirmButton } from "@/components/personnel/InspectConfirmDialog";
import { getDeliveriesPage } from "./actions";
import styles from "../dashboard/page.module.css";

const statusFilters = ["All", "Complete", "Partial", "Awaiting arrival"] as const;

export interface DeliveryRow {
  id: string;
  deliveryId: string;
  supplier: string;
  po: string;
  date: string;
  arrival: string;
  kind: string;
  status: "Complete" | "Partial" | "Awaiting arrival";
  itemCount: number;
  inspectionStatus: "pending" | "passed" | "failed" | "partial";
  inspectionRef: string;
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

function pageWindow(current: number, total: number) {
  const start = Math.max(1, Math.min(current - 2, total - 4));
  const end = Math.min(total, start + 4);
  const pages: number[] = [];
  for (let p = Math.max(1, end - 4); p <= end; p++) pages.push(p);
  return { pages: pages.filter((p) => p >= start), start };
}

const inspectionLabel = (s: DeliveryRow["inspectionStatus"]) => {
  if (s === "pending") return "Pending";
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const inspectionTone = (s: DeliveryRow["inspectionStatus"]) => {
  if (s === "passed") return "ok";
  if (s === "failed") return "bad";
  if (s === "partial") return "warn";
  return "info";
};

export function DeliveryTable({
  onTotalChange,
}: {
  onTotalChange?: (total: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof statusFilters)[number]>(
    "All"
  );
  // Fixed 20 rows/page (no selector) — the DB returns only this window.
  const pageSize = FIXED_PAGE_SIZE;
  const [page, setPage] = useState(1);
  // Debounced search — the DB query fires only after typing pauses.
  const debouncedQuery = useDebouncedValue(query, 250);

  const cacheKey = `${CLIENT_CACHE_KEYS.deliveries}:${page}:${debouncedQuery}:${statusFilter}`;
  const { data, loading, isValidating } = useCachedAction(
    cacheKey,
    () =>
      getDeliveriesPage({
        page,
        pageSize,
        q: debouncedQuery,
        status: statusFilter === "All" ? "all" : statusFilter,
      }),
    { staleTime: 30_000 }
  );
  const total = data?.total ?? 0;
  const rows: DeliveryRow[] = useMemo(() => {
    return (data?.rows ?? []).map((d) => ({
      id: d.id.slice(0, 8).toUpperCase(),
      deliveryId: d.id,
      supplier: d.supplier ?? "—",
      po: d.po_reference ?? "—",
      date: formatDateISO(d.date_delivered),
      arrival: formatDateISO(d.expected_arrival_date),
      kind:
        d.delivery_kind === "stock"
          ? "Stocks"
          : d.delivery_kind === "asset"
            ? "Assets"
            : "—",
      status:
        d.delivery_status === "partial"
          ? "Partial"
          : d.delivery_status === "awaiting"
            ? "Awaiting arrival"
            : "Complete",
      itemCount: d.item_count,
      inspectionStatus: (d.inspection_status as DeliveryRow["inspectionStatus"]) ?? "pending",
      inspectionRef: d.id.slice(0, 8).toUpperCase(),
    }));
  }, [data]);

  useEffect(() => {
    onTotalChange?.(total);
  }, [total, onTotalChange]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize;
  const { pages } = pageWindow(safePage, pageCount);
  const searching = query.trim() !== debouncedQuery.trim();

  if (loading && rows.length === 0) {
    return (
      <div aria-busy="true" aria-label="Loading deliveries">
        <div className={styles.filterRow} aria-hidden="true">
          <div
            className={styles.filterBtns}
            role="group"
            aria-label="Filter by delivery status"
          >
            {statusFilters.map((f) => (
              <span key={f} className={styles.filterBtn} data-active={f === statusFilter}>
                {f}
              </span>
            ))}
          </div>
          <div className="h-9 w-64 animate-pulse rounded-md bg-navy-100" />
        </div>
        <DataTableSkeleton
          headers={[
            "ID",
            "Supplier",
            "PO ref",
            "Date",
            "Target arrival",
            "Type",
            "Items",
            "Delivery",
            "Inspection",
            "Action",
          ]}
          cols={10}
          rows={10}
          label="Loading deliveries"
        />
        <PagerSkeleton />
      </div>
    );
  }

  return (
    <div>
      <div className={styles.filterRow}>
        <div
          className={styles.filterBtns}
          role="group"
          aria-label="Filter by delivery status"
        >
          {statusFilters.map((f) => (
            <button
              key={f}
              type="button"
              className={styles.filterBtn}
              data-active={statusFilter === f}
              onClick={() => {
                setStatusFilter(f);
                setPage(1);
              }}
            >
              {f}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          placeholder="Search supplier, PO, or ID…"
          aria-label="Search deliveries"
          className={styles.addInput}
        />
      </div>
      {(isValidating || searching) ? (
        <p className={styles.panelSub} role="status">Updating…</p>
      ) : null}

      {rows.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.panelSub}>
            {total === 0
              ? "No transactions yet — log the first delivery above."
              : "No deliveries match your search."}
          </p>
        </div>
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Supplier</th>
                  <th>PO ref</th>
                  <th>Date</th>
                  <th>Target arrival</th>
                  <th>Type</th>
                  <th>Items</th>
                  <th>Delivery</th>
                  <th>Inspection</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id}>
                    <td>{d.id}</td>
                    <td>{d.supplier}</td>
                    <td>{d.po}</td>
                    <td>{d.date}</td>
                    <td>{d.arrival}</td>
                    <td>
                      <span
                        className={styles.status}
                        data-tone={d.kind === "Assets" ? "warn" : d.kind === "Stocks" ? "info" : "info"}
                      >
                        {d.kind}
                      </span>
                    </td>
                    <td>{d.itemCount}</td>
                    <td>
                      <span
                        className={styles.status}
                        data-tone={
                          d.status === "Complete" ? "ok" : d.status === "Awaiting arrival" ? "info" : "warn"
                        }
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
                      <div className="flex items-center gap-1.5">
                        <Link
                          href={`/personnel/deliveries/${d.deliveryId}`}
                          className={styles.inspectLinkSecondary}
                          aria-label={`View details for delivery ${d.id}`}
                        >
                          View Details
                        </Link>
                        {d.inspectionStatus === "pending" ? (
                          <InspectConfirmButton
                            deliveryId={d.deliveryId}
                            deliveryRef={d.id}
                            supplier={d.supplier}
                            poReference={d.po}
                            triggerClassName={styles.inspectLink}
                          />
                        ) : (
                          <span
                            className={cn(
                              "inline-flex items-center justify-center rounded-full font-medium",
                              "h-8 px-3 text-xs",
                              "border border-navy-200 bg-transparent text-navy-400 cursor-default"
                            )}
                            aria-label={`Delivery ${d.id} already inspected`}
                          >
                            Inspected
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.pager}>
            <span className={styles.pagerInfo}>
              Showing {total === 0 ? 0 : start + 1}–{Math.min(start + pageSize, total)} of{" "}
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
