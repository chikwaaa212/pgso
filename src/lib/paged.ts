import 'server-only'

import { PAGE_SIZE } from '@/lib/constants'

/** Dual paged envelope: `data` is canonical, `rows` is the compat alias. */
export interface PagedResult<T> {
  rows: T[]
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/** Clamp page to 1..1000, default 1. */
export function parsePage(value: unknown): number {
  const n = Math.floor(Number(value))
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.min(n, 1000)
}

/** Trim + cap search strings to prevent over-fetch / ReDoS-ish haystacks. */
export function parseQuery(value: unknown, maxLen = 120): string {
  return String(value ?? '').trim().slice(0, maxLen)
}

/**
 * Escape LIKE/ILIKE wildcards so user search text matches literally.
 * Without this, a search for "100%" would match "1000", "100X", ….
 */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`)
}

export function totalPagesFor(total: number, pageSize: number = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, pageSize)))
}

/** Clamp an out-of-range page into 1..totalPages. */
export function clampPage(page: number, total: number, pageSize: number = PAGE_SIZE): number {
  return Math.min(Math.max(1, page), totalPagesFor(total, pageSize))
}

/** Paged envelope with clamped page (rows + data carry the same window). */
export function pageResponse<T>(
  rows: T[],
  total: number,
  page: number,
  pageSize: number = PAGE_SIZE
): PagedResult<T> {
  const safePage = clampPage(page, total, pageSize)
  return { rows, data: rows, total, page: safePage, pageSize, totalPages: totalPagesFor(total, pageSize) }
}
