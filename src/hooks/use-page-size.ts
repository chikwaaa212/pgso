import { useState } from "react";

export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

function readStoredPageSize(key: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    const n = raw !== null ? Number(raw) : NaN;
    return (PAGE_SIZE_OPTIONS as readonly number[]).includes(n)
      ? n
      : fallback;
  } catch {
    // Storage unavailable (e.g. private mode) — fall back to default.
    return fallback;
  }
}

/**
 * Rows-per-page state persisted in localStorage, so the pagination select
 * keeps the user's choice across reloads and navigation. Each table passes
 * its own storage key (e.g. "pgso:page-size:assets").
 */
export function usePageSize(
  storageKey: string,
  defaultSize: number = PAGE_SIZE_OPTIONS[0]
): readonly [number, (size: number) => void] {
  const [pageSize, setPageSizeState] = useState<number>(() =>
    readStoredPageSize(storageKey, defaultSize)
  );

  const setPageSize = (size: number) => {
    setPageSizeState(size);
    try {
      window.localStorage.setItem(storageKey, String(size));
    } catch {
      // Storage unavailable — keep the in-memory value.
    }
  };

  return [pageSize, setPageSize] as const;
}
