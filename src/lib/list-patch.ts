/**
 * Shared list-patch helpers for optimistic mutations (Step 5).
 *
 * Pages keep the server window in `useCachedAction` state. On submit we
 * patch that state immediately (optimistic, <100ms feel), roll back on
 * failure, and reconcile with the mutation response's `record` on success —
 * all without a refetch. Shapes handled:
 * - legacy `{ rows, total }` and envelope `{ rows, data, total, ... }`
 *   (every row array is patched; totals stay exact: +1 prepend, -1 remove,
 *   unchanged on in-place update)
 * - bare row arrays (admin inventory full list)
 * Anything else passes through untouched (never throws).
 */

function isIdRow(v: unknown): v is { id: string; [k: string]: unknown } {
  return typeof v === 'object' && v !== null && 'id' in v;
}

/** In-place update of one row (by id) in every row array of the page. */
export function patchRowInPage<T>(page: T, id: string, patch: Record<string, unknown>): T {
  if (Array.isArray(page)) {
    return page.map((r) => (isIdRow(r) && r.id === id ? { ...r, ...patch } : r)) as T;
  }
  if (!page || typeof page !== 'object') return page;
  const next: Record<string, unknown> = { ...(page as Record<string, unknown>) };
  for (const k of ['rows', 'data']) {
    const arr = next[k];
    if (Array.isArray(arr)) {
      next[k] = arr.map((r) => (isIdRow(r) && r.id === id ? { ...r, ...patch } : r));
    }
  }
  return next as T;
}

/** Prepend a row (optimistic create); total + 1 when present. */
export function prependRowToPage<T, R extends { id: string }>(page: T, row: R): T {
  if (Array.isArray(page)) return [row, ...page] as T;
  if (!page || typeof page !== 'object') return page;
  const next: Record<string, unknown> = { ...(page as Record<string, unknown>) };
  for (const k of ['rows', 'data']) {
    const arr = next[k];
    if (Array.isArray(arr)) next[k] = [row, ...arr];
  }
  if (typeof next['total'] === 'number') next['total'] = (next['total'] as number) + 1;
  return next as T;
}

/** Remove a row (optimistic delete); total - 1, floored at 0. */
export function removeRowFromPage<T>(page: T, id: string): T {
  const drop = (arr: unknown[]) => arr.filter((r) => !(isIdRow(r) && r.id === id));
  if (Array.isArray(page)) return drop(page) as T;
  if (!page || typeof page !== 'object') return page;
  const next: Record<string, unknown> = { ...(page as Record<string, unknown>) };
  for (const k of ['rows', 'data']) {
    const arr = next[k];
    if (Array.isArray(arr)) next[k] = drop(arr);
  }
  if (typeof next['total'] === 'number') next['total'] = Math.max(0, (next['total'] as number) - 1);
  return next as T;
}
