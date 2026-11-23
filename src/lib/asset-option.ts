/**
 * Shared asset-option disable rule — the same reasons both the personnel
 * request dialog and the employee picker display. Pure module (no
 * server-only, no DB) so unit tests import it directly.
 */

import { classifyCondition } from './reporting'

/** Null when the item can be newly assigned; otherwise the display reason. */
export function assetOptionDisabledReason(a: {
  source: string
  status?: string | null
  quantity?: number | null
  assigned_to?: string | null
  condition?: string | null
}): string | null {
  if (a.source === 'stock') {
    // Inspected lots share their condition with the linked asset record (same
    // id); an unserviceable lot can no more be issued than a single asset.
    if (classifyCondition(a.condition) === 'unserviceable') return 'Unserviceable'
    return typeof a.quantity === 'number' && a.quantity <= 0
      ? 'Out of stock'
      : null
  }
  // Unserviceable equipment can never take a new holder. It must be repaired
  // and marked serviceable again before it can be issued/assigned — this is
  // checked before status so an unserviceable asset marked "available" by
  // legacy data is still blocked.
  if (classifyCondition(a.condition) === 'unserviceable') return 'Unserviceable'
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
