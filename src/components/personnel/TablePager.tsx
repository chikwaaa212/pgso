"use client";

import styles from "@/app/personnel/dashboard/page.module.css";

/** Fixed rows-per-page across all Personnel tables (selector removed). */
export const FIXED_PAGE_SIZE = 20;

export function pageWindow(current: number, total: number) {
  const start = Math.max(1, Math.min(current - 2, total - 4));
  const end = Math.min(total, start + 4);
  const pages: number[] = [];
  for (let p = Math.max(1, end - 4); p <= end; p++) pages.push(p);
  return { pages: pages.filter((p) => p >= start), start };
}

interface TablePagerProps {
  /** Unique id prefix (kept for aria-labels). */
  id: string;
  /** Number of rows after filtering. */
  total: number;
  /** Rows per page — always FIXED_PAGE_SIZE (20); prop kept for compat. */
  pageSize?: number;
  /** Current page (1-indexed); clamped internally. */
  page: number;
  /** Optional back-compat; ignored (page size is fixed at 20). */
  onPageSizeChange?: (size: number) => void;
  onPageChange: (page: number) => void;
}

/** Shared "Showing X–Y of Z" (fixed 20 rows/page) + page buttons. */
export function TablePager({
  id,
  total,
  page,
  onPageChange,
}: TablePagerProps) {
  const pageSize = FIXED_PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const start = (safePage - 1) * pageSize;
  const { pages } = pageWindow(safePage, pageCount);
  void id;

  return (
    <div className={styles.pager}>
      <span className={styles.pagerInfo}>
        Showing {total === 0 ? 0 : start + 1}–{Math.min(start + pageSize, total)} of {total}
      </span>
      <div className={styles.pagerControls}>
        <button
          type="button"
          className={styles.pageBtn}
          disabled={safePage === 1}
          onClick={() => onPageChange(safePage - 1)}
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
            onClick={() => onPageChange(p)}
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
          onClick={() => onPageChange(safePage + 1)}
          aria-label="Next page"
        >
          ›
        </button>
      </div>
    </div>
  );
}
