/**
 * Shared query-key factory (client-safe, no server imports).
 *
 * Canonical shape: [module, resource, page, pageSize, filters, sort, role/userId]
 * No ad-hoc keys: every `useCachedAction` caller must build its key through
 * `buildQueryKey` (string form for the current hook) or `buildQueryKeyArray`
 * (array form, forward-compatible with TanStack Query / SWR).
 *
 * v2 keys look like:
 *   pgso:v2:<module>:<resource>:p<page>:s<pageSize>:<base64url(stable(filters+sort+scope))>
 * Legacy `pgso:client:*` / `pgso:assets:*` keys keep working (read + bust by
 * prefix still match) but new code must not mint them.
 */

export type Role = 'super_admin' | 'pgso_personnel' | 'employee'
export type DataType = 'static' | 'slow' | 'live' | 'sensitive'
export type Module = 'personnel' | 'super-admin' | 'employee' | 'shared' | 'public'

export interface QueryKeyParts {
  module: Module | string
  resource: string
  page?: number
  pageSize?: number
  filters?: Record<string, unknown>
  sort?: string | Record<string, unknown> | null
  /** Role segment — required whenever data is user/role-scoped. */
  role?: Role | string | null
  /** User segment — required whenever data is user-scoped. */
  userId?: string | null
}

export interface QueryDefaults {
  staleTime: number
  maxAge: number
  refetchOnFocus: boolean
  persist: boolean
}

/** Per-data-type defaults (see brief §2). */
export const QUERY_DEFAULTS: Record<DataType, QueryDefaults> = {
  /** Master data, categories, sections, templates. Long-lived, safe to persist. */
  static: { staleTime: 30 * 60_000, maxAge: 60 * 60_000, refetchOnFocus: false, persist: true },
  /** Assets, documents, records, logs. */
  slow: { staleTime: 3 * 60_000, maxAge: 10 * 60_000, refetchOnFocus: false, persist: false },
  /** Request queues, inventory quantities, notifications, dashboard counts. */
  live: { staleTime: 20_000, maxAge: 2 * 60_000, refetchOnFocus: true, persist: false },
  /** Per-user snapshots. Short, never persisted. */
  sensitive: { staleTime: 30_000, maxAge: 2 * 60_000, refetchOnFocus: true, persist: false },
}

export function defaultsFor(dataType: DataType): QueryDefaults {
  return QUERY_DEFAULTS[dataType]
}

function stableStringify(v: unknown): string {
  if (v === null || v === undefined) return 'null'
  if (typeof v !== 'object') return JSON.stringify(v) ?? 'null'
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`
  const obj = v as Record<string, unknown>
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`
}

function toBase64Url(s: string): string {
  try {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(s).toString('base64url').slice(0, 180)
    }
  } catch {
    /* fall through to btoa */
  }
  try {
    // browser fallback (ASCII-safe: stableStringify output is JSON)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const btoaFn = (globalThis as any).btoa as ((v: string) => string) | undefined
    if (btoaFn) {
      return btoaFn(unescape(encodeURIComponent(s)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
        .slice(0, 180)
    }
  } catch {
    /* ignore */
  }
  // last resort: short hash
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(0 + i)) | 0
  return `h${(h >>> 0).toString(36)}`
}

function normalizePart(v: string): string {
  return v.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-')
}

/**
 * Canonical string key for `useCachedAction` / `client-cache`.
 * Scope (role/userId) is embedded in the hash whenever provided, so two
 * users/roles can never share a cache entry.
 */
export function buildQueryKey(parts: QueryKeyParts): string {
  const mod = normalizePart(String(parts.module || 'shared'))
  const resource = normalizePart(String(parts.resource || 'list'))
  const page = Math.max(1, Math.floor(parts.page ?? 1))
  const pageSize = Math.max(1, Math.floor(parts.pageSize ?? 1))
  const hash = toBase64Url(
    stableStringify({
      f: parts.filters ?? {},
      s: parts.sort ?? null,
      // Only present when the caller passes them — user-scoped data MUST
      // pass role/userId; static lookups omit them and stay shared.
      ...(parts.role ? { r: parts.role } : {}),
      ...(parts.userId ? { u: parts.userId } : {}),
    })
  )
  return `pgso:v2:${mod}:${resource}:p${page}:s${pageSize}:${hash}`
}

/** Array form for future TanStack/SWR migration; same segment order. */
export function buildQueryKeyArray(parts: QueryKeyParts): unknown[] {
  return [
    parts.module,
    parts.resource,
    parts.page ?? 1,
    parts.pageSize ?? 1,
    parts.filters ?? {},
    parts.sort ?? null,
    parts.role ?? null,
    parts.userId ?? null,
  ]
}

/** Prefix covering every page of one resource (for targeted busts). */
export function resourcePrefix(mod: string, resource: string): string {
  return `pgso:v2:${normalizePart(mod)}:${normalizePart(resource)}:`
}

/** True for keys minted by this factory. */
export function isV2Key(key: string): boolean {
  return key.startsWith('pgso:v2:')
}

/**
 * Resources allowed to persist across reloads (non-sensitive static lookups
 * only). Everything else — especially per-user snapshots — is memory-only.
 */
const PERSISTABLE = new Set([
  'asset-custom-fields',
  'filter-options',
  'master-data',
  'master-catalog',
  'master-units',
  'master-departments',
  'templates',
  'categories',
  'units',
  'catalog',
  'departments',
])

export function shouldPersistKey(key: string, dataType?: DataType): boolean {
  if (dataType === 'static') return true
  if (dataType === 'slow' || dataType === 'live' || dataType === 'sensitive') return false
  if (isV2Key(key)) return false // v2 list/count keys are per-scope: memory only
  for (const r of PERSISTABLE) {
    if (key.includes(r)) return true
  }
  return false
}
