/**
 * Shared query-client config (client-safe).
 *
 * The project uses the hand-rolled SWR layer (`client-cache` +
 * `useCachedAction`), not TanStack Query / SWR the library. This module is
 * the single source of truth for per-data-type freshness, prefetch, and
 * request-dedup policy so pages stop hard-coding `staleTime` values.
 */
'use client'

import { defaultsFor, type DataType } from '@/lib/query-keys'
import { getClientCache, setClientCache } from '@/lib/client-cache'

export interface QueryClientConfig {
  staleTime: number
  maxAge: number
  refetchOnFocus: boolean
  /** Delay before a hover/intent prefetch fires (ms). */
  prefetchDelayMs: number
  /** Delay before a next-page prefetch fires (ms). */
  nextPageDelayMs: number
}

const BASE: Record<DataType, QueryClientConfig> = {
  static: { ...defaultsFor('static'), prefetchDelayMs: 120, nextPageDelayMs: 400 },
  slow: { ...defaultsFor('slow'), prefetchDelayMs: 120, nextPageDelayMs: 400 },
  live: { ...defaultsFor('live'), prefetchDelayMs: 80, nextPageDelayMs: 250 },
  sensitive: { ...defaultsFor('sensitive'), prefetchDelayMs: 80, nextPageDelayMs: 250 },
}

export function queryConfigFor(dataType: DataType): QueryClientConfig {
  return BASE[dataType]
}

/** Inflight dedupe shared by prefetch helpers (per key, per tab). */
const prefetchInflight = new Map<string, Promise<unknown>>()

/**
 * Warm `key` in the background if no usable entry exists. Deduplicates
 * concurrent callers; resolves silently (never throws). Used for next-page
 * prefetch and link hover/focus intent prefetch.
 */
export function prefetchQuery<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts: { delayMs?: number; staleTime?: number } = {}
): Promise<T | null> {
  const { delayMs = 0, staleTime = 60_000 } = opts
  const cached = getClientCache<T>(key)
  if (cached && Date.now() - cached.fetchedAt <= staleTime) {
    return Promise.resolve(cached.data)
  }
  const existing = prefetchInflight.get(key) as Promise<T> | undefined
  if (existing) return existing.then((v) => v).catch(() => null)
  const run = async (): Promise<T | null> => {
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs))
    // Re-check after the delay — a mount may have filled the cache meanwhile.
    const warm = getClientCache<T>(key)
    if (warm && Date.now() - warm.fetchedAt <= staleTime) return warm.data
    try {
      const fresh = await fetcher()
      setClientCache(key, fresh)
      return fresh
    } catch {
      return null
    } finally {
      if (prefetchInflight.get(key) === runPromise) prefetchInflight.delete(key)
    }
  }
  const runPromise = run() as Promise<T | null>
  prefetchInflight.set(key, runPromise)
  return runPromise
}

/**
 * Props to spread onto a navigation link for intent prefetch:
 * `onMouseEnter` + `onFocus` warm the target's first-page key once.
 */
export function prefetchIntentProps<T>(key: string, fetcher: () => Promise<T>): {
  onMouseEnter: () => void
  onFocus: () => void
} {
  let fired = false
  const fire = () => {
    if (fired) return
    fired = true
    void prefetchQuery(key, fetcher, { delayMs: 80 })
  }
  return { onMouseEnter: fire, onFocus: fire }
}
