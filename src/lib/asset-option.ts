/**
 * Shared asset-option disable rule — the same reasons both the personnel
 * request dialog and the employee picker display. Pure module (no
 * server-only, no DB) so unit tests import it directly.
 */

/** Null when the item can be newly assigned; otherwise the display reason. */
export function assetOptionDisabledReason(a: {
  source: string
  status?: string | null
  quantity?: number | null
  assigned_to?: string | null
}): string | null {
  if (a.source === 'stock') {
    return typeof a.quantity === 'number' && a.quantity <= 0
      ? 'Out of stock'
      : null
  }
  // A depleted asset is never assignable, whether or not it still carries a
  // holder. An asset that still has quantity on hand can be issued again even
  // if a previous holder is recorded.
  if (
    a.assigned_to &&
    (typeof a.quantity !== 'number' || a.quantity <= 0)
  ) {
    return 'Already assigned'
  }
  if (typeof a.quantity === 'number' && a.quantity <= 0) return 'Out of stock'
  const st = (a.status ?? 'available').trim().toLowerCase()
  if (st !== 'available') {
    const s = (a.status ?? '').trim()
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Unavailable'
  }
  return null
}
