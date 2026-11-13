"use client";

/**
 * Optimistic inspection results.
 *
 * Recording an inspection navigates back to the list immediately while the
 * server action keeps running. This store lets the list paint the new result
 * (Passed / Partial / Returned to supplier) before the write lands, so the
 * row never flickers back to "Pending". The overlay is dropped once the
 * revalidated rows carry the same result (or after a short safety timeout).
 */

export interface PendingInspectionResult {
  deliveryId: string;
  result: "passed" | "partial" | "failed";
  inspectorName: string;
  /** YYYY-MM-DD */
  inspectionDate: string;
  at: number;
}

type PendingMap = Record<string, PendingInspectionResult>;

const EMPTY: PendingMap = {};

let pending: PendingMap = EMPTY;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribePendingInspectionResults(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Stable snapshot for useSyncExternalStore. */
export function getPendingInspectionResults(): PendingMap {
  return pending;
}

/** Stable empty snapshot for SSR/hydration. */
export function getEmptyPendingInspectionResults(): PendingMap {
  return EMPTY;
}

/** One overlay per delivery — a retry replaces the previous entry. */
export function upsertPendingInspectionResult(
  entry: PendingInspectionResult
): void {
  pending = { ...pending, [entry.deliveryId]: entry };
  emit();
}

export function removePendingInspectionResult(deliveryId: string): void {
  if (!(deliveryId in pending)) return;
  const next = { ...pending };
  delete next[deliveryId];
  pending = next;
  emit();
}

// ─── Optimistic AIR / IAR generation ──────────────────────────────────────

export interface PendingAir {
  deliveryId: string;
  /** Shown in the IAR No. cell until the real number lands. */
  iarNo: string;
  at: number;
}

type PendingAirMap = Record<string, PendingAir>;

const EMPTY_AIR: PendingAirMap = {};

let pendingAir: PendingAirMap = EMPTY_AIR;

function emitAir() {
  for (const listener of airListeners) listener();
}

const airListeners = new Set<() => void>();

export function subscribePendingAir(listener: () => void): () => void {
  airListeners.add(listener);
  return () => {
    airListeners.delete(listener);
  };
}

export function getPendingAir(): PendingAirMap {
  return pendingAir;
}

export function getEmptyPendingAir(): PendingAirMap {
  return EMPTY_AIR;
}

/** Paints an AIR-generated row before the write lands. */
export function upsertPendingAir(entry: PendingAir): void {
  pendingAir = { ...pendingAir, [entry.deliveryId]: entry };
  emitAir();
}

export function removePendingAir(deliveryId: string): void {
  if (!(deliveryId in pendingAir)) return;
  const next = { ...pendingAir };
  delete next[deliveryId];
  pendingAir = next;
  emitAir();
}
