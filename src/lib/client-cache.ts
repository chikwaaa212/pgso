/**
 * Tiny client-side cache for personnel list pages (dashboard, deliveries,
 * inspections, stocks, assets, documents, issues, requests, repairs, logs, issuances),
 * per-record detail snapshots (issuance detail, IAR sheet), and the QR
 * scanner's last decoded result.
 *
 * Why this exists: the server already caches reads in Upstash Redis, but
 * every client-side navigation still remounts the page, refires the server
 * action, and flashes a skeleton while the RSC round-trip resolves. This
 * module keeps the last payload in memory (SPA back/forward = instant) and
 * mirrors it to sessionStorage (reload in the same tab = instant), with a
 * stale-while-revalidate policy so the UI paints immediately and refreshes
 * silently in the background.
 *
 * Writes must call {@link bustClientCache} (or the page's `refresh()`) so
 * the next paint refetches instead of serving the pre-write payload. The
 * server still busts Redis + revalidates paths, so this is only about the
 * browser copy.
 */

export const CLIENT_CACHE_KEYS = {
  dashboard: 'pgso:client:dashboard-snapshot',
  deliveries: 'pgso:client:deliveries-list',
  inspections: 'pgso:client:inspections-list',
  inventory: 'pgso:client:inventory-items',
  assets: 'pgso:client:assets-snapshot',
  documents: 'pgso:client:documents-snapshot',
  issues: 'pgso:client:issues-snapshot',
  requests: 'pgso:client:requests-list',
  repairs: 'pgso:client:repairs-list',
  logs: 'pgso:client:logs-list',
  issuances: 'pgso:client:issuances-list',
  /** Prefix — detail pages append `:${id}` (busting matches by prefix). */
  iar: 'pgso:client:iar-snapshot',
  scan: 'pgso:client:scan-result',
  /** Employee portal snapshot (my assets + docs + asset requests). Same SWR policy as personnel. */
  employeeAssets: 'pgso:client:employee-assets-snapshot',
  /** Employee portal snapshot (my requests + request form options). Same SWR policy as personnel. */
  employeeRequests: 'pgso:client:employee-requests-snapshot',
  /** Super-admin read-only browse lists (same SWR policy as personnel). */
  adminDeliveries: 'pgso:client:admin-deliveries-list',
  adminInspections: 'pgso:client:admin-inspections-list',
    adminInventory: 'pgso:client:admin-inventory-list',
  adminAssets: 'pgso:client:admin-assets-snapshot',
  adminDocuments: 'pgso:client:admin-documents-snapshot',
  adminIssues: 'pgso:client:admin-issues-snapshot',
  adminRequests: 'pgso:client:admin-requests-list',
  adminLogs: 'pgso:client:admin-logs-list',
  adminIssuances: 'pgso:client:admin-issuances-list',
  adminRepairs: 'pgso:client:admin-repairs-list',
  adminTransactions: 'pgso:client:admin-transactions-snapshot',
  adminUsers: 'pgso:client:admin-users-snapshot',
  adminMasterData: 'pgso:client:admin-master-data-snapshot',
  adminRecords: 'pgso:client:admin-records-snapshot',
  /** User-defined asset columns (shared by personnel + admin registries). */
  assetCustomFields: 'pgso:client:asset-custom-fields',  /** Prefix — record modals append `:${id}` (busting matches by prefix). */
  adminDeliveryDetail: 'pgso:client:admin-delivery-detail',
  adminInspectionDetail: 'pgso:client:admin-inspection-detail',
} as const

export type ClientCacheKey =
  (typeof CLIENT_CACHE_KEYS)[keyof typeof CLIENT_CACHE_KEYS] | (string & {})

interface Entry<T> {
  data: T
  fetchedAt: number
}

const memory = new Map<string, Entry<unknown>>()

function readSession<T>(key: string): Entry<T> | null {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return null
    const raw = window.sessionStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Entry<T>
    if (!parsed || typeof parsed.fetchedAt !== 'number' || !('data' in parsed)) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function writeSession(key: string, entry: Entry<unknown>): void {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return
    window.sessionStorage.setItem(key, JSON.stringify(entry))
  } catch {
    // Quota exceeded or storage blocked (private mode) — memory still works.
  }
}

function removeSession(key: string): void {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return
    window.sessionStorage.removeItem(key)
  } catch {
    // ignore
  }
}

/** Last payload for `key`, or null on cold start. Checks memory, then sessionStorage. */
export function getClientCache<T>(key: string): Entry<T> | null {
  const mem = memory.get(key) as Entry<T> | undefined
  if (mem) return mem
  const stored = readSession<T>(key)
  if (stored) {
    memory.set(key, stored)
    return stored
  }
  return null
}

/** Store `data` for `key` in memory + sessionStorage. */
export function setClientCache<T>(key: string, data: T): Entry<T> {
  const entry: Entry<T> = { data, fetchedAt: Date.now() }
  memory.set(key, entry)
  writeSession(key, entry)
  return entry
}

/**
 * Drop cached payloads whose key equals (or starts with) any of `prefixes`.
 * Call after a write so the next visit refetches fresh data. Also notifies
 * mounted {@link useCachedAction} hooks via a window event so a page that
 * is already visible (e.g. the list behind a modal) revalidates silently.
 */
export function bustClientCache(prefixes: string | string[]): void {
  const list = Array.isArray(prefixes) ? prefixes : [prefixes]
  for (const key of [...memory.keys()]) {
    if (list.some((p) => key === p || key.startsWith(p))) {
      memory.delete(key)
      removeSession(key)
    }
  }
  // sessionStorage may hold keys from a previous mount that memory forgot
  // (e.g. after HMR) — sweep those too.
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const doomed: string[] = []
      for (let i = 0; i < window.sessionStorage.length; i++) {
        const k = window.sessionStorage.key(i)
        if (k && list.some((p) => k === p || k.startsWith(p))) doomed.push(k)
      }
      for (const k of doomed) window.sessionStorage.removeItem(k)
    }
  } catch {
    // ignore
  }
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent<string[]>(CACHE_BUSTED_EVENT, { detail: list })
      )
    }
  } catch {
    // ignore
  }
}

/** Window event fired by {@link bustClientCache} with the busted prefixes. */
export const CACHE_BUSTED_EVENT = 'pgso:client-cache-busted'
