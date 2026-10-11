"use client";

import { PAGE_SIZE } from "@/lib/constants";
import { Pagination, pageWindow as baseWindow } from "@/components/ui/pagination";

/** Fixed rows-per-page across all Personnel tables (single source: PAGE_SIZE). */
export const FIXED_PAGE_SIZE = PAGE_SIZE;

/** Back-compat: old callers used `const { pages } = pageWindow(...)`. */
export function pageWindow(current: number, total: number) {
  const pages = baseWindow(current, total);
  const start = Math.max(1, Math.min(current - 2, total - 4));
  return { pages, start };
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

/** Shared pager — delegates to single <Pagination /> (PAGE_SIZE = 15). */
export function TablePager({
  id,
  total,
  page,
  onPageChange,
}: TablePagerProps) {
  return (
    <Pagination total={total} page={page} onPageChange={onPageChange} id={id} />
  );
}
