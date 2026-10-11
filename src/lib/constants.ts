export const SITE_NAME = "PGSO";
export const SITE_DESCRIPTION = "A Next.js 15+ project scaffold";
export const APP_ROUTES = {
  HOME: "/",
  HEALTH: "/api/health",
} as const;

/** Single source of truth for list page size (Record Keeper + Registrar). */
export const PAGE_SIZE = 15;

/** Search debounce budget (ms) — matches latency spec. */
export const SEARCH_DEBOUNCE_MS = 300;

/** Client cache freshness per data type. */
export const CACHE_TTL = {
  /** Frequently changing queues (requests, deliveries, inspections). */
  listsMs: 30_000,
  /** Registry totals / counts / master data (rarely changes). */
  countsMs: 60_000,
  /** Static lookups (units, catalog, filter options). */
  lookupsMs: 300_000,
  /** Absolute ceiling before cold-start skeleton. */
  maxAgeMs: 600_000,
} as const;
