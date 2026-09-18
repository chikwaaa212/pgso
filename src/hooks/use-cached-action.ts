"use client"

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CACHE_BUSTED_EVENT,
  bustClientCache,
  getClientCache,
  setClientCache,
} from '@/lib/client-cache'

interface UseCachedActionOptions {
  /**
   * Freshness window. A cached payload younger than this paints instantly
   * with no network at all; older payloads still paint instantly but
   * trigger a silent background refetch. Defaults to 60s.
   */
  staleTime?: number
  /**
   * Absolute ceiling — payloads older than this are ignored and the hook
   * behaves like a cold start (skeleton). Defaults to 10 minutes.
   */
  maxAge?: number
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
  const { staleTime = 60_000, maxAge = 10 * 60_000 } = options

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

  // Keep the latest fetcher without touching refs during render.
  useEffect(() => {
    fetcherRef.current = fetcher
  }, [fetcher])

  const run = useCallback(
    (force: boolean) => {
      let cached: ReturnType<typeof getClientCache<T>> = null
      try {
        cached = getClientCache<T>(key)
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
          // Fresh — skip the network entirely.
          return
        }
        // Stale — fall through to silent background revalidation below.
      } else {
        // Cold start — keep the skeleton visible while the first fetch runs.
        setLoading(true)
      }
      setIsValidating(true)
      setError('')
      let promise = inflight.get(key) as Promise<T> | undefined
      if (!promise) {
        promise = fetcherRef.current() as Promise<T>
        inflight.set(key, promise)
        const cleanup = () => {
          if (inflight.get(key) === promise) inflight.delete(key)
        }
        void (promise as Promise<T>).then(cleanup, cleanup)
      }
      void promise.then(
        (fresh) => {
          if (!mounted.current) return
          setClientCache(key, fresh)
          setData(fresh)
          setLoading(false)
          setIsValidating(false)
        },
        (e) => {
          if (!mounted.current) return
          // Keep stale data on screen; only cold starts surface the error.
          if (!hasUsableCache) {
            setError(
              e instanceof Error ? e.message : 'Failed to load. Please try again.'
            )
            setLoading(false)
          }
          setIsValidating(false)
        }
      )
    },
    [key, maxAge, staleTime]
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

  const refresh = useCallback(() => run(true), [run])

  return { data, loading, isValidating, error, refresh }
}

export { bustClientCache }
