"use client";

import styles from "@/app/personnel/dashboard/page.module.css";

/**
 * Shared Personnel skeleton primitives.
 *
 * Pages keep their own CSS-module wrappers (same responsive grid/table
 * classes as the real UI) — these primitives only render the pulse cells
 * sized to the real rows, so loading never shifts layout.
 */

export function Pulse({ className }: { className: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded bg-navy-100 ${className}`}
    />
  );
}

export function DataTableSkeleton({
  headers,
  cols,
  rows = 10,
  label = "Loading records",
}: {
  headers: string[];
  cols: number;
  rows?: number;
  label?: string;
}) {
  return (
    <div
      className={styles.tableWrap}
      aria-busy="true"
      aria-label={label}
      role="status"
    >
      <table className={styles.table} aria-hidden="true">
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r} style={{ opacity: 1 - r * 0.05 }}>
              {Array.from({ length: cols }).map((_, c) => (
                <td key={c}>
                  <Pulse className="h-3.5 w-full max-w-28" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FilterBarSkeleton() {
  return (
    <div className={styles.filterRow} aria-hidden="true">
      <div className="h-9 w-48 animate-pulse rounded-md bg-navy-100" />
      <div className="h-9 w-64 animate-pulse rounded-md bg-navy-100" />
    </div>
  );
}

export function PagerSkeleton() {
  return (
    <div className={styles.pager} aria-hidden="true">
      <span className={styles.pagerInfo}>
        <span className="block h-3 w-36 animate-pulse rounded bg-navy-100" />
      </span>
      <div className={styles.pagerControls}>
        <span className={styles.pageBtn}>‹</span>
        <span className={styles.pageBtn} data-active="true">
          1
        </span>
        <span className={styles.pageBtn}>›</span>
      </div>
    </div>
  );
}
