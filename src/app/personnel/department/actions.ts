'use server'

import { revalidatePath as nextRevalidatePath } from 'next/cache'
import prisma from '@/lib/prisma'
import { writeAuditLog } from '@/lib/audit'
import { requireCurrentUserId } from '@/lib/personnel-scope'
import { getActiveDepartments, resolveDepartmentName } from '@/lib/master-data'

export interface DepartmentOption {
  id: string
  name: string
}

function revalidateAll() {
  nextRevalidatePath('/personnel/dashboard')
  nextRevalidatePath('/super-admin/users')
  void import('@/lib/personnel-cache')
    .then((m) => m.bustPersonnelCache())
    .catch(() => {})
}

/** Active departments for the personnel account-menu picker. Never throws. */
export async function getDepartmentOptions(): Promise<DepartmentOption[]> {
  try {
    await requireCurrentUserId()
  } catch {
    return []
  }
  try {
    return await getActiveDepartments()
  } catch (e) {
    console.error('[getDepartmentOptions]', e)
    return []
  }
}

/**
 * Self-service assignment: personnel picks the department they belong to.
 * The value must match an active department (case-insensitive) and is stored
 * on `profiles.office` so existing position · office displays keep working.
 */
export async function updateMyDepartment(
  name: string
): Promise<{ ok: boolean; error?: string; department?: string }> {
  let userId = ''
  try {
    userId = await requireCurrentUserId()
  } catch {
    return { ok: false, error: 'Not authenticated.' }
  }
  try {
    const canonical = await resolveDepartmentName(name)
    if (!canonical) {
      return { ok: false, error: 'Select a valid active department.' }
    }
    await prisma.profile.update({
      where: { id: userId },
      data: { office: canonical },
    })
    await writeAuditLog({
      userId,
      action: 'personnel:update_department',
      module: 'personnel',
      details: {
        purpose: 'Update assigned department',
        summary: `Set assigned department to "${canonical}"`,
      },
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to update department.' }
  }
  revalidateAll()
  try {
    const fresh = await prisma.profile.findUnique({
      where: { id: userId },
      select: { office: true },
    })
    return { ok: true, department: fresh?.office ?? undefined }
  } catch {
    return { ok: true }
  }
}
