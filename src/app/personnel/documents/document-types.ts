// Shared document constants — kept outside actions.ts because
// 'use server' modules may only export async functions.

export const VIEWED_DOC_TYPES = [
  'delivery',
  'inspection',
  'stock',
  'asset',
  'repair',
  'iar',
  'par',
  'ics',
] as const
export type ViewedDocType = (typeof VIEWED_DOC_TYPES)[number]
