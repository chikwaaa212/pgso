// Shared repair constants — kept outside actions.ts because
// 'use server' modules may only export async functions.

export const REPAIR_STATUSES = ['pending', 'in_progress', 'completed'] as const
export type RepairStatus = (typeof REPAIR_STATUSES)[number]
