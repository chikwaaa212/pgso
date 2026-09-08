"use client";

import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import styles from "../dashboard/page.module.css";

const filters = ["All", "Complete", "Partial"] as const;
const pageSizes = [10, 20, 50, 100];

export interface DeliveryRow {
  id: string;
  supplier: string;
  po: string;
  date: string;
  status: "Complete" | "Partial";
  itemCount: number;
}

function pageWindow(current: number, total: number) {
  const start = Math.max(1, Math.min(current - 2, total - 4));
  const end = Math.min(total, start + 4);
  const pages: number[] = [];
  for (let p = Math.max(1, end - 4); p <= end; p++) pages.push(p);
  return { pages: pages.filter((p) => p >= start), start };
}

export function DeliveryTable({ rows: allRows }: { rows: DeliveryRow[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof filters)[number]>("All");
  const [pageSize, setPageSize] = useState<number>(pageSizes[0]);
  const [page, setPage] = useState(1);

  const filtered = allRows.filter((d) => {
    const matchesFilter = filter === "All" || d.status === filter;
    const q = query.trim().toLowerCase();
    const matchesQuery =
      q === "" ||
      d.supplier.toLowerCase().includes(q) ||
      d.po.toLowerCase().includes(q) ||
      d.id.toLowerCase().includes(q);
    return matchesFilter && matchesQuery;
  });

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize;
  const visible = filtered.slice(start, start + pageSize);
  const { pages } = pageWindow(safePage, pageCount);

  return (
    <div>
      <div className={styles.filterRow}>
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
        <div className={styles.filterBtns} role="group" aria-label="Filter by status">
          {filters.map((f) => (
            <button
              key={f}
              type="button"
              className={styles.filterBtn}
              data-active={filter === f}
              onClick={() => {
                setFilter(f);
                setPage(1);
              }}
            >
              {f}
            </button>
          ))}
        </div>
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
                  <th>Status</th>
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
                        data-tone={d.status === "Complete" ? "ok" : "warn"}
                      >
                        {d.status}
                      </span>
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
                  <SelectTrigger id="delivery-page-size" size="sm" className="w-[5.5rem]">
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
