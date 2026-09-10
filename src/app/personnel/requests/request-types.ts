// Shared request constants — kept outside actions.ts because
// 'use server' modules may only export async functions.

export const REQUEST_TYPES = ['transfer', 'new_assignment', 'repair'] as const
export type RequestType = (typeof REQUEST_TYPES)[number]

export const REQUEST_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'completed',
] as const
export type RequestStatus = (typeof REQUEST_STATUSES)[number]

export function requestTypeLabel(t: string | null) {
  if (t === 'transfer') return 'Transfer'
  if (t === 'new_assignment') return 'New Assignment'
  if (t === 'repair') return 'Repair'
  if (!t) return '—'
  return t.charAt(0).toUpperCase() + t.slice(1).replace(/_/g, ' ')
}
