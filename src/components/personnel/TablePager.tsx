"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PAGE_SIZE_OPTIONS } from "@/hooks/use-page-size";
import styles from "@/app/personnel/dashboard/page.module.css";

export function pageWindow(current: number, total: number) {
  const start = Math.max(1, Math.min(current - 2, total - 4));
  const end = Math.min(total, start + 4);
  const pages: number[] = [];
  for (let p = Math.max(1, end - 4); p <= end; p++) pages.push(p);
  return { pages: pages.filter((p) => p >= start), start };
}

interface TablePagerProps {
  /** Unique id prefix for the rows-per-page label (e.g. "inspections"). */
  id: string;
  /** Number of rows after filtering. */
  total: number;
  pageSize: number;
  /** Current page (1-indexed); clamped internally. */
  page: number;
  onPageSizeChange: (size: number) => void;
  onPageChange: (page: number) => void;
}

/** Shared "Showing X–Y of Z" + Rows select + page buttons, matching Assets/Deliveries. */
export function TablePager({
  id,
  total,
  pageSize,
  page,
  onPageSizeChange,
  onPageChange,
}: TablePagerProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const start = (safePage - 1) * pageSize;
  const { pages } = pageWindow(safePage, pageCount);

  return (
    <div className={styles.pager}>
      <span className={styles.pagerInfo}>
        Showing {start + 1}–{Math.min(start + pageSize, total)} of {total}
      </span>
      <div className={styles.pagerControls}>
        <span className={styles.pageSizeWrap}>
          <label htmlFor={`${id}-page-size`}>Rows</label>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              onPageSizeChange(Number(v));
              onPageChange(1);
            }}
          >
            <SelectTrigger
              id={`${id}-page-size`}
              size="sm"
              className="w-[5.5rem]"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((size) => (
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
