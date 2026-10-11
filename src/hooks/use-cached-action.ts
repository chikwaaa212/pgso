"use client"

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CACHE_BUSTED_EVENT,
  bustClientCache,
  getClientCache,
  setClientCache,
} from '@/lib/client-cache'

import { defaultsFor, type DataType } from '@/lib/query-keys'

interface UseCachedActionOptions {
  /**
   * Freshness window. A cached payload younger than this paints instantly
   * with no network at all; older payloads still paint instantly but
   * trigger a silent background refetch. Defaults to 60s (or the
   * per-`dataType` default when `dataType` is given without `staleTime`).
   */
  staleTime?: number
  /**
   * Absolute ceiling — payloads older than this are ignored and the hook
   * behaves like a cold start (skeleton). Defaults to 10 minutes (or the
   * per-`dataType` default when `dataType` is given without `maxAge`).
   */
  maxAge?: number
  /**
   * Per-data-type preset (`static` 30min / `slow` 3min / `live` 20s +
   * focus refetch / `sensitive` 30s, never persisted). Explicit
   * `staleTime`/`maxAge`/`refetchOnFocus` override the preset.
   */
  dataType?: DataType
  /**
   * Refetch stale data when the tab regains focus. Defaults to the
   * `dataType` preset (`live`/`sensitive` true, else false).
   */
  refetchOnFocus?: boolean
  /**
   * Keep the previous key's data visible while a new key (e.g. next page)
   * loads — no skeleton flicker on pagination/filter changes. Defaults true.
   */
  keepPreviousData?: boolean
}

interface UseCachedActionResult<T> {
  data: T | undefined
  /** True only on cold start (no usable cache) while the first fetch runs. */
  loading: boolean
  /** True while a background revalidation is in flight (cached data visible). */
  isValidating: boolean
  error: string
  /** Force a fresh fetch now (used after writes); keeps old data visible. */
  refresh: () => void
  /**
   * SWR-style local mutation: replace the current payload (and the stored
   * cache entry) WITHOUT fetching. Used for optimistic updates — patch on
   * submit, roll back on failure, reconcile with the mutation response's
   * `record` on success. Never throws.
   */
  mutate: (next: T | ((prev: T | undefined) => T | undefined)) => void
}

// Dedupes concurrent fetches for the same key (StrictMode double-mount,
// two components requesting the same list in one commit).
const inflight = new Map<string, Promise<unknown>>()

/**
 * SWR-style wrapper around a server action for personnel list pages.
 *
 * - Back/forward navigation paints instantly from memory/sessionStorage.
 * - Stale payloads revalidate silently; `loading` stays false so no
 *   skeleton flashes over data the user already saw.
 * - `refresh()` forces a refetch and also clears sibling keys via
 *   `bustClientCache` when the caller passes them (see inventory page).
 */
export function useCachedAction<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: UseCachedActionOptions = {}
): UseCachedActionResult<T> {
  const preset = options.dataType ? defaultsFor(options.dataType) : null
  const staleTime = options.staleTime ?? preset?.staleTime ?? 60_000
  const maxAge = options.maxAge ?? preset?.maxAge ?? 10 * 60_000
  const refetchOnFocus = options.refetchOnFocus ?? preset?.refetchOnFocus ?? false
  const keepPreviousData = options.keepPreviousData ?? true

  // NOTE: initial state is intentionally SSR-safe (loading=true, data=undefined).
  // Reading sessionStorage/memory during useState would make the first client
  // render differ from the server HTML whenever a warm cache exists, causing
  // a React hydration mismatch (server renders the skeleton, client renders
  // cached data). Instead we always hydrate from cache inside useEffect, so
  // the first client render matches the server and the cached payload paints
  // on the very next commit.
  const [data, setData] = useState<T | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [isValidating, setIsValidating] = useState(false)
  const [error, setError] = useState('')
  const mounted = useRef(true)
  const fetcherRef = useRef(fetcher)
  const keyRef = useRef(key)
  const prevDataRef = useRef<T | undefined>(undefined)

  // Keep the latest fetcher without touching refs during render.
  useEffect(() => {
    fetcherRef.current = fetcher
  }, [fetcher])

  // Latest key for the stale-run guard below (effects may touch refs).
  useEffect(() => {
    keyRef.current = key
  }, [key])

  const run = useCallback(
    (force: boolean) => {
      // Capture the key for this run — if the query changes while the fetch
      // is in flight, the stale response is ignored (cancels logically:
      // superseded runs never paint, so fast paging cannot show stale pages).
      const runKey = key
      let cached: ReturnType<typeof getClientCache<T>> = null
      try {
        cached = getClientCache<T>(runKey)
      } catch {
        cached = null
      }
      const age = cached ? Date.now() - cached.fetchedAt : Infinity
      const hasUsableCache = !!cached && age < maxAge
      if (hasUsableCache && cached) {
        // Paint the cached payload immediately (post-hydration commit), so
        // back-navigation / reloads with a warm cache don't flash a skeleton.
        // This is safe because it runs inside an effect, after hydration.
        setData(cached.data)
        setLoading(false)
        if (!force && age <= staleTime) {
          // Fresh — skip the network entirely (dedupes in-flight + warm hits).
          return
        }
        // Stale — fall through to silent background revalidation below.
      } else if (keepPreviousData && prevDataRef.current !== undefined) {
        // Pagination / filter change with no cache for the new key: keep the
        // previous page's data on screen (placeholderData equivalent) and
        // mark validating instead of flashing a skeleton. Cold starts with
        // truly no data still show the skeleton via initial `loading=true`.
        setLoading(false)
      } else {
        // Cold start — keep the skeleton visible while the first fetch runs.
        // Only clear to skeleton if this run is still current (prevents
        // flicker when a stale run finishes after a newer key mounted).
        setLoading(true)
      }
      setIsValidating(true)
      setError('')
      let promise = inflight.get(runKey) as Promise<T> | undefined
      if (!promise) {
        promise = fetcherRef.current() as Promise<T>
        inflight.set(runKey, promise)
        const cleanup = () => {
          if (inflight.get(runKey) === promise) inflight.delete(runKey)
        }
        void (promise as Promise<T>).then(cleanup, cleanup)
      }
      void promise.then(
        (fresh) => {
          if (!mounted.current) return
          // Ignore stale runs: query changed while fetching (superseded
          // requests are cancelled logically — they never paint).
          if (keyRef.current !== runKey) return
          setClientCache(runKey, fresh)
          prevDataRef.current = fresh
          setData(fresh)
          setLoading(false)
          setIsValidating(false)
        },
        (e) => {
          if (!mounted.current) return
          if (keyRef.current !== runKey) return
          // Keep stale data on screen; only cold starts surface the error.
          if (!hasUsableCache && prevDataRef.current === undefined) {
            setError(
              e instanceof Error ? e.message : 'Failed to load. Please try again.'
            )
            setLoading(false)
          }
          setIsValidating(false)
        }
      )
    },
    [key, maxAge, staleTime, keepPreviousData]
  )

  useEffect(() => {
    mounted.current = true
    // Runs after hydration, so painting cached data here can't mismatch the
    // server HTML (first client render was the skeleton, matching SSR).
    run(false)
    return () => {
      mounted.current = false
    }
  }, [run])

  // A write elsewhere (modal on this page, another tab section) busted our
  // key — revalidate silently so the visible list updates without a
  // skeleton flash.
  useEffect(() => {
    const onBusted = (e: Event) => {
      const prefixes = (e as CustomEvent<string[]>).detail ?? []
      if (prefixes.some((p) => key === p || key.startsWith(p))) {
        run(true)
      }
    }
    window.addEventListener(CACHE_BUSTED_EVENT, onBusted)
    return () => window.removeEventListener(CACHE_BUSTED_EVENT, onBusted)
  }, [key, run])

  // Live data: refetch stale payloads when the tab regains focus.
  useEffect(() => {
    if (!refetchOnFocus) return
    let lastFocus = 0
    const onFocus = () => {
      const now = Date.now()
      if (now - lastFocus < 5_000) return // throttle focus storms
      lastFocus = now
      try {
        const cached = getClientCache<T>(keyRef.current)
        const age = cached ? now - cached.fetchedAt : Infinity
        if (age > staleTime) run(false)
      } catch {
        /* ignore */
      }
    }
    window.addEventListener('focus', onFocus)
    const onVis = () => {
      if (document.visibilityState === 'visible') onFocus()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [refetchOnFocus, staleTime, run])

  const refresh = useCallback(() => run(true), [run])

  const mutate = useCallback(
    (next: T | ((prev: T | undefined) => T | undefined)) => {
      try {
        setData((prev) => {
          const fresh =
            typeof next === 'function'
              ? (next as (p: T | undefined) => T | undefined)(prev)
              : next
          if (fresh === undefined) return prev
          prevDataRef.current = fresh
          if (mounted.current) {
            try {
              setClientCache(key, fresh)
            } catch {
              // memory write failure must not break the paint
            }
          }
          return fresh
        })
      } catch {
        // Local patch must never crash the page.
      }
    },
    [key]
  )

  return { data, loading, isValidating, error, refresh, mutate }
}

export { bustClientCache }
