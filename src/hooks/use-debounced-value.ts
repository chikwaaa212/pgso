"use client"

import { useEffect, useState } from 'react'

/**
 * Debounces a fast-changing value (search input) so expensive server
 * fetches only fire after the user pauses typing.
 */
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])
  return debounced
}
