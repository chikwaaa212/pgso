import 'server-only'

import { getRedis } from '@/lib/redis'
import { getPersonnelScope } from '@/lib/personnel-scope'
import type { Redis } from '@upstash/redis'

const PREFIX = 'pgso'

// Budgets: Upstash REST is one HTTPS round-trip per op. When it is slow
// (cold / far region) we degrade to direct DB reads rather than stall
// server actions — callers already treat cache as best-effort.
const CACHE_IO_TIMEOUT_MS = 2500
const BUST_TIMEOUT_MS = 5000
// Bound a single prefix bust so a huge keyspace can't loop forever.
const BUST_MAX_SCAN_PAGES = 20

/** Rejects if `promise` takes longer than `ms`. The loser side stays
 *  handled via Promise.race, so no unhandled rejections. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

// Coalesces concurrent busts: N write-path callers in the same tick share
// one SCAN/DEL pass instead of stampeding Upstash with N identical storms.
let bustInFlight: Promise<void> | null = null

async function bustOnePrefix(redis: Redis, prefix: string): Promise<void> {
  const pattern = `${PREFIX}:${prefix}*`
  let cursor = 0
  let pages = 0
  do {
    const [next, keys] = await redis.scan(cursor, {
      match: pattern,
      count: 100,
    })
    cursor = Number(next)
    if (keys.length > 0) await redis.del(...keys)
    pages++
  } while (cursor !== 0 && pages < BUST_MAX_SCAN_PAGES)
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

export function cacheKey(
  namespace: string,
  parts: Record<string, unknown> = {}
): string {
  return `${PREFIX}:${namespace}:${Buffer.from(stableStringify(parts))
    .toString('base64url')
    .slice(0, 180)}`
}

/** Per-user key: same namespace but isolated by owner (prevents data leaks). */
export async function scopedKey(
  namespace: string,
  extra: Record<string, unknown> = {}
): Promise<{ key: string; userId: string | null; isSuperAdmin: boolean }> {
  try {
    const scope = await getPersonnelScope()
    const userId = scope.userId ?? 'anon'
    const key = cacheKey(namespace, {
      u: userId,
      a: scope.isSuperAdmin ? 1 : 0,
      ...extra,
    })
    return { key, userId: scope.userId, isSuperAdmin: scope.isSuperAdmin }
  } catch {
    return {
      key: cacheKey(namespace, { u: 'anon', ...extra }),
      userId: null,
      isSuperAdmin: false,
    }
  }
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const redis = getRedis()
    if (!redis) return null
    // Bound every Redis round-trip: a slow/cold Upstash endpoint must
    // degrade to a direct DB read, never stall a server action for seconds.
    return (await withTimeout(redis.get<T>(key), CACHE_IO_TIMEOUT_MS)) ?? null
  } catch (e) {
    console.warn('[cache] get failed', key, e)
    return null
  }
}

export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds: number
): Promise<void> {
  try {
    const redis = getRedis()
    if (!redis) return
    // Skip caching empty/error fallbacks for very short TTL namespaces?
    // We cache everything — callers return []/zeros on DB error and a
    // short TTL keeps the pooler from being hammered during outages.
    // Timeout-bounded so a huge value (e.g. the issuance form-options
    // blob) can never stall the response that just fetched it.
    await withTimeout(
      redis.set(key, value as never, { ex: ttlSeconds }),
      CACHE_IO_TIMEOUT_MS
    )
  } catch (e) {
    console.warn('[cache] set failed', key, e)
  }
}

/**
 * Read-through helper: try Redis, fall back to `fetcher`, then store.
 * Never throws — on Redis failure it just runs the fetcher.
 */
export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const hit = await cacheGet<T>(key)
  if (hit !== null && hit !== undefined) return hit
  // Transient pooler blips (P1001 etc.) are common under parallel bursts —
  // retry the fetcher before giving up so one bad connection doesn't fail
  // the whole dashboard.
  const fresh = await withDbRetry(fetcher)
  await cacheSet(key, fresh, ttlSeconds)
  return fresh
}

/** Prisma codes that mean "try again" rather than "bad query". */
const TRANSIENT_DB_CODES = new Set([
  'P1001', // can't reach database server
  'P1017', // server has closed the connection
  'P2024', // timed out fetching a pooled connection
  'P2036', // external connector error
])

function isTransientDbError(e: unknown): boolean {
  const code = (e as { code?: string } | null)?.code
  if (code && TRANSIENT_DB_CODES.has(code)) return true
  const msg = String((e as Error | null)?.message ?? '').toLowerCase()
  return (
    msg.includes("can't reach database") ||
    msg.includes('timed out') ||
    msg.includes('connection closed') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('econnrefused')
  )
}

/** Re-runs read fetchers on transient connection errors (3 attempts). */
async function withDbRetry<T>(
  fn: () => Promise<T>,
  attempts = 3
): Promise<T> {
  let lastError: unknown = null
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (e) {
      lastError = e
      if (!isTransientDbError(e) || i === attempts - 1) throw e
      await new Promise((r) => setTimeout(r, 500 * (i + 1)))
    }
  }
  throw lastError
}

export async function withScopedCache<T>(
  namespace: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
  extra: Record<string, unknown> = {}
): Promise<T> {
  const { key } = await scopedKey(namespace, extra)
  return withCache(key, ttlSeconds, fetcher)
}

/**
 * Bust keys by prefix. Prefixes are busted CONCURRENTLY (sequential SCANs
 * over Upstash REST cost one HTTPS round-trip each — serializing 6 prefixes
 * was adding seconds to every write), SCAN pages are bounded, the whole
 * bust is timeout-bounded, and concurrent callers join a single in-flight
 * bust instead of stampeding (one issuance used to fan out into ~6 busts
 * × ~6-12 REST calls, which also piled Gzip drain listeners onto the
 * shared fetch agent). Never throws.
 */
export async function bustCachePrefixes(
  prefixes: string[]
): Promise<void> {
  if (bustInFlight) return bustInFlight
  bustInFlight = (async () => {
    try {
      const redis = getRedis()
      if (!redis) return
      await withTimeout(
        Promise.all(prefixes.map((prefix) => bustOnePrefix(redis, prefix))),
        BUST_TIMEOUT_MS
      )
    } catch (e) {
      console.warn('[cache] bust failed', e)
    } finally {
      bustInFlight = null
    }
  })()
  return bustInFlight
}

/** Convenience: bust everything under personnel + shared pools. */
export async function bustPersonnelCache(): Promise<void> {
  await bustCachePrefixes([
    'personnel:',
    'super-admin:',
    'master-data:',
    'catalog:',
    'inventory:',
    'assets:',
  ])
}
