'use server'

import { revalidatePath } from 'next/cache'
import prisma from '@/lib/prisma'
import { requireSuperAdmin } from '@/lib/auth-guard'
import { writeAuditLog } from '@/lib/audit'

export type ReplenishmentStatus = 'approved' | 'rejected' | 'completed'

const ALLOWED: Record<string, ReplenishmentStatus[]> = {
  pending: ['approved', 'rejected'],
  approved: ['completed'],
  rejected: [],
  completed: [],
}

/**
 * Super Admin decision on a personnel stock-replenishment request.
 * Only `stock_replenishment` requests are actionable here — employee
 * transfer / assignment / repair requests stay read-only oversight.
 * Approval is a status change only; actual procurement is logged later
 * as a delivery by personnel.
 */
export async function setReplenishmentStatus(
  id: string,
  status: ReplenishmentStatus,
  note?: string
): Promise<{ success?: boolean; error?: string }> {
  const remarks = note?.trim() ?? ''
  if (!remarks) return { error: 'Enter remarks for this action.' }
  if (!['approved', 'rejected', 'completed'].includes(status))
    return { error: 'Invalid status.' }

  let adminId: string
  try {
    const session = await requireSuperAdmin()
    adminId = session.userId
  } catch {
    return { error: 'Forbidden: Super Admin only.' }
  }

  try {
    const current = await prisma.request.findUnique({ where: { id } })
    if (!current) return { error: 'Request not found.' }
    if (current.request_type !== 'stock_replenishment')
      return { error: 'Only stock replenishment requests are actionable here.' }

    const allowed = ALLOWED[current.status ?? 'pending'] ?? []
    if (!allowed.includes(status)) {
      return {
        error: `Cannot move a ${current.status ?? 'pending'} request to ${status}.`,
      }
    }

    await prisma.request.update({
      where: { id },
      data: {
        status,
        date_resolved: new Date(),
        description: `${current.description}\nNote (${status} by admin): ${remarks}`,
      },
    })

    await writeAuditLog({
      userId: adminId,
      action: `request:${status}`,
      module: 'requests',
      details: {
        purpose: remarks,
        summary: `Stock replenishment ${id.slice(0, 8).toUpperCase()} → ${status}`,
        reference_id: id,
        status,
        request_type: 'stock_replenishment',
      },
    })

    revalidatePath('/super-admin/requests')
    revalidatePath('/personnel/requests')
    return { success: true }
  } catch (e) {
    console.error('[setReplenishmentStatus]', e)
    return { error: 'Failed to update the request. Please try again.' }
  }
}
