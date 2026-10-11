"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { PAGE_SIZE } from "@/lib/constants";
import styles from "./pagination.module.css";

/** Window of up to 5 page numbers around the current page. */
export function pageWindow(current: number, total: number): number[] {
  const start = Math.max(1, Math.min(current - 2, total - 4));
  const end = Math.min(total, start + 4);
  const pages: number[] = [];
  for (let p = Math.max(1, end - 4); p <= end; p++) pages.push(p);
  return pages.filter((p) => p >= start);
}

interface PaginationProps {
  /** Total rows after filtering (server total). */
  total: number;
  /** Current page, 1-indexed. Clamped internally. */
  page: number;
  /** Rows per page — always PAGE_SIZE (15). Kept for compat, ignored if different. */
  pageSize?: number;
  onPageChange: (page: number) => void;
  /** Optional prefix for aria-labels / testing. */
  id?: string;
}

/**
 * Single shared pagination for Record Keeper + Registrar (and all lists).
 * Renders NOTHING when total <= PAGE_SIZE (15).
 */
export function Pagination({ total, page, onPageChange, id }: PaginationProps) {
  const pageSize = PAGE_SIZE;
  if (total <= pageSize) return null;

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const start = (safePage - 1) * pageSize;
  const pages = pageWindow(safePage, pageCount);
  const from = total === 0 ? 0 : start + 1;
  const to = Math.min(start + pageSize, total);

  return (
    <nav
      className={styles.pager}
      aria-label={id ? `Pagination ${id}` : "Pagination"}
    >
      <span className={styles.pagerInfo}>
        <span>
          Showing {from}–{to} of {total}
        </span>
        <span aria-live="polite">
          Page {safePage} of {pageCount}
        </span>
      </span>
      <div className={styles.pagerControls}>
        <button
          type="button"
          className={styles.pageBtn}
          disabled={safePage === 1}
          onClick={() => onPageChange(safePage - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className={styles.icon} aria-hidden="true" />
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
          <ChevronRight className={styles.icon} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
