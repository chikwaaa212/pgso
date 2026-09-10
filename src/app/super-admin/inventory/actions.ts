'use server'

import { revalidatePath } from 'next/cache'
import prisma from '@/lib/prisma'
import { requireSuperAdmin } from '@/lib/auth-guard'
import { writeAuditLog } from '@/lib/audit'

export interface ThresholdState {
  success?: boolean
  error?: string
}

/**
 * Super Admin only: sets (or clears) the reorder threshold that drives
 * low-stock / out-of-stock alerts for personnel and admin alike.
 */
export async function setReorderThreshold(
  itemId: string,
  threshold: number | null
): Promise<ThresholdState> {
  let session
  try {
    session = await requireSuperAdmin()
  } catch {
    return { error: 'Forbidden: Super Admin only.' }
  }

  if (!itemId) return { error: 'Stock item ID is required.' }
  if (
    threshold !== null &&
    (!Number.isInteger(threshold) || threshold < 0)
  ) {
    return {
      error: 'Threshold must be a whole number of zero or more, or empty to clear it.',
    }
  }

  try {
    const item = await prisma.inventoryItem.findUnique({
      where: { id: itemId },
      select: { id: true, item_name: true },
    })
    if (!item) return { error: 'Stock item not found.' }

    await prisma.inventoryItem.update({
      where: { id: itemId },
      data: { reorder_threshold: threshold },
    })

    await writeAuditLog({
      userId: session.userId,
      action: 'inventory:threshold',
      module: 'inventory',
      details: {
        purpose: `Set reorder threshold for ${item.item_name}`,
        summary: `${item.item_name} · threshold ${threshold ?? 'cleared'}`,
        reference_id: itemId,
      },
    })

    revalidatePath('/super-admin/inventory')
    revalidatePath('/personnel/inventory')
    revalidatePath('/personnel/dashboard')
    return { success: true }
  } catch (e) {
    console.error('[setReorderThreshold]', e)
    return { error: 'Failed to update the threshold. Please try again.' }
  }
}
