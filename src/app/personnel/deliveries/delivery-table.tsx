"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import styles from "../dashboard/page.module.css";

const statusFilters = ["All", "Complete", "Partial"] as const;
const pageSizes = [10, 20, 50, 100];

export interface DeliveryRow {
  id: string;
  deliveryId: string;
  supplier: string;
  po: string;
  date: string;
  status: "Complete" | "Partial";
  itemCount: number;
  inspectionStatus: "pending" | "passed" | "failed" | "partial";
  inspectionRef: string;
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

export function DeliveryTable({ rows: allRows }: { rows: DeliveryRow[] }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof statusFilters)[number]>(
    "All"
  );
  const [pageSize, setPageSize] = useState<number>(pageSizes[0]);
  const [page, setPage] = useState(1);

  const filtered = allRows.filter((d) => {
    const matchesStatus =
      statusFilter === "All" || d.status === statusFilter;
    const q = query.trim().toLowerCase();
    const matchesQuery =
      q === "" ||
      d.supplier.toLowerCase().includes(q) ||
      d.po.toLowerCase().includes(q) ||
      d.id.toLowerCase().includes(q);
    return matchesStatus && matchesQuery;
  });

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize;
  const visible = filtered.slice(start, start + pageSize);
  const { pages } = pageWindow(safePage, pageCount);

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

      {filtered.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.panelSub}>
            {allRows.length === 0
              ? "No transactions yet — log the first delivery above."
              : "No deliveries match your search."}
          </p>
        </div>
      ) : (
        <>
          <div className={`${styles.tableWrap} ${styles.tableFixed}`}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Supplier</th>
                  <th>PO ref</th>
                  <th>Date</th>
                  <th>Items</th>
                  <th>Delivery</th>
                  <th>Inspection</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((d) => (
                  <tr key={d.id}>
                    <td>{d.id}</td>
                    <td>{d.supplier}</td>
                    <td>{d.po}</td>
                    <td>{d.date}</td>
                    <td>{d.itemCount}</td>
                    <td>
                      <span
                        className={styles.status}
                        data-tone={
                          d.status === "Complete" ? "ok" : "warn"
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
                      {d.inspectionStatus === "pending" ? (
                        <Link
                          href={`/personnel/inspections/${d.deliveryId}`}
                          className={styles.inspectLink}
                          aria-label={`Inspect delivery ${d.id}`}
                        >
                          Inspect
                        </Link>
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.pager}>
            <span className={styles.pagerInfo}>
              Showing {start + 1}–{Math.min(start + pageSize, filtered.length)} of{" "}
              {filtered.length}
            </span>
            <div className={styles.pagerControls}>
              <span className={styles.pageSizeWrap}>
                <label htmlFor="delivery-page-size">Rows</label>
                <Select
                  value={String(pageSize)}
                  onValueChange={(v) => {
                    setPageSize(Number(v));
                    setPage(1);
                  }}
                >
                  <SelectTrigger
                    id="delivery-page-size"
                    size="sm"
                    className="w-[5.5rem]"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {pageSizes.map((size) => (
                      <SelectItem key={size} value={String(size)}>
                        {size}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </span>
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
