"use client";

/**
 * Optimistic delivery rows.
 *
 * `Log a delivery` submits in the background: the dialog closes and the new
 * row is painted into the table immediately, before the server action
 * resolves. If the write fails the row is dropped and the toast reports the
 * error; if it succeeds the real row replaces it as soon as the list
 * revalidates (deduped by delivery id / PO reference in the table).
 */

export interface PendingDelivery {
  /** Local id used to remove this row again. */
  token: string;
  supplier: string;
  po: string;
  /** ISO string for the target arrival date. */
  arrival: string;
  kind: "Stocks" | "Assets";
  itemCount: number;
  /** Server id, set once the write succeeds (used to dedupe the refetched row). */
  deliveryId?: string;
  createdAt: number;
}

const EMPTY: PendingDelivery[] = [];

let pending: PendingDelivery[] = EMPTY;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribePendingDeliveries(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getPendingDeliveries(): PendingDelivery[] {
  return pending;
}

/** Stable snapshot for SSR/hydration (must not allocate a new array). */
export function getEmptyPendingDeliveries(): PendingDelivery[] {
  return EMPTY;
}

export function addPendingDelivery(
  row: Omit<PendingDelivery, "createdAt">
): void {
  // One pending row per PO — a retried submit reuses the same reference.
  pending = [
    ...pending.filter((p) => p.po !== row.po),
    { ...row, createdAt: Date.now() },
  ];
  emit();
}

/** Remember the real id so the table can hide the placeholder as soon as it lands. */
export function confirmPendingDelivery(token: string, deliveryId: string): void {
  let changed = false;
  pending = pending.map((p) => {
    if (p.token !== token) return p;
    changed = true;
    return { ...p, deliveryId };
  });
  if (changed) emit();
}

export function removePendingDelivery(token: string): void {
  const next = pending.filter((p) => p.token !== token);
  if (next.length === pending.length) return;
  pending = next;
  emit();
}

/* ─── Optimistic edits ───────────────────────────────────────────────────────
 * `Edit delivery` also closes instantly: the edited values overlay the row
 * while the server action runs. A failure drops the overlay (and the caller
 * reopens the form with the draft intact); success keeps it until the
 * revalidated list lands, so the row never flickers back to old values.
 */

export interface PendingDeliveryEdit {
  deliveryId: string;
  supplier: string;
  po: string;
  /** YYYY-MM-DD target arrival ("" when cleared). */
  arrival: string;
  kind: "Stocks" | "Assets";
  itemCount: number;
}

const EMPTY_EDITS: PendingDeliveryEdit[] = [];

let pendingEdits: PendingDeliveryEdit[] = EMPTY_EDITS;
const editListeners = new Set<() => void>();

function emitEdits() {
  for (const listener of editListeners) listener();
}

export function subscribePendingDeliveryEdits(listener: () => void): () => void {
  editListeners.add(listener);
  return () => {
    editListeners.delete(listener);
  };
}

export function getPendingDeliveryEdits(): PendingDeliveryEdit[] {
  return pendingEdits;
}

/** Stable snapshot for SSR/hydration (must not allocate a new array). */
export function getEmptyPendingDeliveryEdits(): PendingDeliveryEdit[] {
  return EMPTY_EDITS;
}

/** One overlay per delivery — retries replace the previous edit. */
export function upsertPendingDeliveryEdit(edit: PendingDeliveryEdit): void {
  pendingEdits = [
    ...pendingEdits.filter((e) => e.deliveryId !== edit.deliveryId),
    edit,
  ];
  emitEdits();
}

export function removePendingDeliveryEdit(deliveryId: string): void {
  const next = pendingEdits.filter((e) => e.deliveryId !== deliveryId);
  if (next.length === pendingEdits.length) return;
  pendingEdits = next;
  emitEdits();
}
