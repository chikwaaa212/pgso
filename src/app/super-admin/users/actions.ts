'use server'

import { revalidatePath } from 'next/cache'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import prisma from '@/lib/prisma'
import { writeAuditLog } from '@/lib/audit'
import { requireSuperAdmin } from '@/lib/auth-guard'

export interface AdminUserRow {
  id: string
  full_name: string | null
  email: string | null
  role: string
  status: string
  position: string | null
  office: string | null
  created_at: string | null
}

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function emailMapFor(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (ids.length === 0) return map
  try {
    const supabase = adminClient()
    // listUsers paginates; 100 covers Phase 1 scale. Paginate once more if needed.
    const { data } = await supabase.auth.admin.listUsers({ perPage: 100 })
    for (const u of data?.users ?? []) {
      if (u.email) map.set(u.id, u.email)
    }
    if (map.size < ids.length) {
      const { data: page2 } = await supabase.auth.admin.listUsers({ perPage: 100, page: 2 })
      for (const u of page2?.users ?? []) {
        if (u.email) map.set(u.id, u.email)
      }
    }
  } catch {
    // best-effort: emails stay null
  }
  return map
}

export async function getPendingEmployees(): Promise<AdminUserRow[]> {
  try {
    await requireSuperAdmin()
  } catch {
    return []
  }
  try {
    const rows = await prisma.profile.findMany({
      where: { role: 'employee', status: 'pending' },
      orderBy: { created_at: 'desc' },
      take: 200,
    })
    const emails = await emailMapFor(rows.map((r) => r.id))
    return rows.map((r) => ({
      id: r.id,
      full_name: r.full_name,
      email: emails.get(r.id) ?? null,
      role: r.role,
      status: r.status,
      position: r.position,
      office: r.office,
      created_at: r.created_at?.toISOString() ?? null,
    }))
  } catch (e) {
    console.error('[getPendingEmployees]', e)
    return []
  }
}

export async function getAllUsers(): Promise<AdminUserRow[]> {
  try {
    await requireSuperAdmin()
  } catch {
    return []
  }
  try {
    const rows = await prisma.profile.findMany({
      orderBy: { created_at: 'desc' },
      take: 300,
    })
    const emails = await emailMapFor(rows.map((r) => r.id))
    return rows.map((r) => ({
      id: r.id,
      full_name: r.full_name,
      email: emails.get(r.id) ?? null,
      role: r.role,
      status: r.status,
      position: r.position,
      office: r.office,
      created_at: r.created_at?.toISOString() ?? null,
    }))
  } catch (e) {
    console.error('[getAllUsers]', e)
    return []
  }
}

export async function getUserCounts(): Promise<{ pending: number; personnel: number; employees: number }> {
  try {
    await requireSuperAdmin()
  } catch {
    return { pending: 0, personnel: 0, employees: 0 }
  }
  try {
    const [pending, personnel, employees] = await Promise.all([
      prisma.profile.count({ where: { role: 'employee', status: 'pending' } }),
      prisma.profile.count({ where: { role: 'pgso_personnel' } }),
      prisma.profile.count({ where: { role: 'employee' } }),
    ])
    return { pending, personnel, employees }
  } catch {
    return { pending: 0, personnel: 0, employees: 0 }
  }
}

async function guardTarget(actorId: string, targetId: string) {
  if (actorId === targetId) {
    throw new Error('You cannot change your own account.')
  }
  const target = await prisma.profile.findUnique({ where: { id: targetId } })
  if (!target) throw new Error('Account not found.')
  if (target.role === 'super_admin') {
    throw new Error('Super Admin accounts cannot be changed here.')
  }
  return target
}

export async function approveEmployee(targetId: string): Promise<{ ok: boolean; error?: string }> {
  let actorId = ''
  try {
    ;({ userId: actorId } = await requireSuperAdmin())
    const target = await guardTarget(actorId, targetId)
    if (target.role !== 'employee' || target.status !== 'pending') {
      throw new Error('Only pending employee accounts can be approved.')
    }
    await prisma.profile.update({
      where: { id: targetId },
      data: { status: 'active' },
    })
    await writeAuditLog({
      userId: actorId,
      action: 'users:approve_employee',
      module: 'users',
      details: { purpose: 'Approve employee registration', summary: `Approved ${target.full_name ?? targetId}`, reference_id: targetId },
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Approval failed.' }
  }
  revalidatePath('/super-admin/users')
  revalidatePath('/super-admin/dashboard')
  return { ok: true }
}

export async function rejectEmployee(targetId: string): Promise<{ ok: boolean; error?: string }> {
  let actorId = ''
  try {
    ;({ userId: actorId } = await requireSuperAdmin())
    const target = await guardTarget(actorId, targetId)
    if (target.role !== 'employee' || target.status !== 'pending') {
      throw new Error('Only pending employee accounts can be rejected.')
    }
    await prisma.profile.update({
      where: { id: targetId },
      data: { status: 'inactive' },
    })
    try {
      await adminClient().auth.admin.signOut(targetId)
    } catch {
      // best-effort
    }
    await writeAuditLog({
      userId: actorId,
      action: 'users:reject_employee',
      module: 'users',
      details: { purpose: 'Reject employee registration', summary: `Rejected ${target.full_name ?? targetId}`, reference_id: targetId },
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Rejection failed.' }
  }
  revalidatePath('/super-admin/users')
  revalidatePath('/super-admin/dashboard')
  return { ok: true }
}

export async function setUserActive(
  targetId: string,
  active: boolean
): Promise<{ ok: boolean; error?: string }> {
  let actorId = ''
  try {
    ;({ userId: actorId } = await requireSuperAdmin())
    await guardTarget(actorId, targetId)
    await prisma.profile.update({
      where: { id: targetId },
      data: { status: active ? 'active' : 'inactive' },
    })
    if (!active) {
      try {
        await adminClient().auth.admin.signOut(targetId)
      } catch {
        // best-effort
      }
    }
    const target = await prisma.profile.findUnique({ where: { id: targetId } })
    await writeAuditLog({
      userId: actorId,
      action: active ? 'users:reactivate' : 'users:deactivate',
      module: 'users',
      details: {
        purpose: active ? 'Reactivate account' : 'Deactivate account',
        summary: `${active ? 'Reactivated' : 'Deactivated'} ${target?.full_name ?? targetId}`,
        reference_id: targetId,
      },
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Update failed.' }
  }
  revalidatePath('/super-admin/users')
  revalidatePath('/super-admin/dashboard')
  return { ok: true }
}
