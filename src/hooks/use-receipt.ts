"use client";

import { useCallback, useRef, useState } from "react";
import { getClientCache, setClientCache } from "@/lib/client-cache";

// ─── Receipt detail cache ────────────────────────────────────────────────
// Opened receipts are cached client-side (memory + sessionStorage) so a
// receipt viewed earlier paints instantly instead of refetching:
// fresh (<5min) skips the network, stale paints instantly then refreshes
// silently, cold shows the spinner. Same scheme as the documents page —
// the cache key space is shared, so a receipt opened there is instant
// here and vice versa.
const RECEIPT_CACHE_PREFIX = "pgso:client:receipt";
const RECEIPT_FRESH_MS = 5 * 60_000;
const RECEIPT_MAX_MS = 30 * 60_000;

function readReceipt<T>(key: string): { data: T; age: number } | null {
  try {
    const hit = getClientCache<T>(`${RECEIPT_CACHE_PREFIX}:${key}`);
    if (!hit) return null;
    const age = Date.now() - hit.fetchedAt;
    if (age >= RECEIPT_MAX_MS) return null;
    return { data: hit.data, age };
  } catch {
    return null;
  }
}

function writeReceipt<T>(key: string, data: T) {
  try {
    setClientCache(`${RECEIPT_CACHE_PREFIX}:${key}`, data);
  } catch {
    // Quota / storage blocked — memory copy (if stored) still applies.
  }
}

/** Overlay-viewer state for one receipt at a time with cached reads. */
export function useReceipt<T>() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [doc, setDoc] = useState<T | null>(null);
  const [docLoading, setDocLoading] = useState(false);
  const liveId = useRef<string | null>(null);

  const open = useCallback(
    (id: string, key: string, fetcher: () => Promise<T>) => {
      liveId.current = id;
      setSelectedId(id);
      const cached = readReceipt<T>(key);
      if (cached && cached.age < RECEIPT_FRESH_MS) {
        // Fresh — paint instantly, skip the network entirely.
        setDoc(cached.data);
        setDocLoading(false);
        return;
      }
      if (cached) {
        // Stale — paint instantly, refresh silently in the background.
        setDoc(cached.data);
        setDocLoading(false);
      } else {
        setDoc(null);
        setDocLoading(true);
      }
      void fetcher().then(
        (fresh) => {
          if (liveId.current !== id) return;
          writeReceipt(key, fresh);
          setDoc(fresh);
          setDocLoading(false);
        },
        () => {
          if (liveId.current === id) setDocLoading(false);
        }
      );
    },
    []
  );

  const close = useCallback(() => {
    liveId.current = null;
    setSelectedId(null);
    setDoc(null);
  }, []);

  return { selectedId, doc, docLoading, open, close };
}
