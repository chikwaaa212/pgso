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
  employee_no: string | null
  department: string | null
  profile_completed: boolean
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

// Explicit column list: `findMany()` without `select` pulls every Prisma
// model field, which throws P2022 on DBs where migration 25 hasn't run yet.
const ADMIN_SELECT = {
  id: true,
  full_name: true,
  role: true,
  status: true,
  position: true,
  office: true,
  created_at: true,
} as const

// New columns exist only after migration 25 — probe once per process.
let migration25Applied: boolean | null = null

async function hasMigration25(): Promise<boolean> {
  if (migration25Applied !== null) return migration25Applied
  try {
    await prisma.$queryRawUnsafe(
      `SELECT "employee_no" FROM "profiles" LIMIT 0`
    )
    migration25Applied = true
  } catch {
    migration25Applied = false
  }
  return migration25Applied
}

function toAdminRow(
  r: {
    id: string
    full_name: string | null
    role: string
    status: string
    position: string | null
    office: string | null
    created_at: Date | null
  },
  emails: Map<string, string>,
  extra?: { employee_no?: string | null; department?: string | null; profile_completed?: boolean | null }
): AdminUserRow {
  return {
    id: r.id,
    full_name: r.full_name,
    email: emails.get(r.id) ?? null,
    role: r.role,
    status: r.status,
    position: r.position,
    office: r.office,
    employee_no: extra?.employee_no ?? null,
    department: extra?.department ?? null,
    profile_completed: extra?.profile_completed ?? false,
    created_at: r.created_at?.toISOString() ?? null,
  }
}

async function extraFor(ids: string[]): Promise<Map<string, { employee_no: string | null; department: string | null; profile_completed: boolean }>> {
  const out = new Map<string, { employee_no: string | null; department: string | null; profile_completed: boolean }>()
  if (ids.length === 0 || !(await hasMigration25())) return out
  try {
    const rows = await prisma.profile.findMany({
      where: { id: { in: ids } },
      select: { id: true, employee_no: true, department: true, profile_completed: true },
    })
    for (const r of rows) {
      out.set(r.id, {
        employee_no: r.employee_no ?? null,
        department: r.department ?? null,
        profile_completed: r.profile_completed ?? false,
      })
    }
  } catch (e) {
    // Migration probe said yes but columns still missing (replica lag etc.)
    // — stay degraded rather than crashing the page.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((e as any)?.code === 'P2022') migration25Applied = false
    else console.error('[users:extra-profile-columns]', e)
  }
  return out
}

export async function getPendingEmployees(): Promise<AdminUserRow[]> {
  try {
    await requireSuperAdmin()
  } catch {
    return []
  }
  // Same list caching as the other admin pages (30s) — auth stays
  // outside the cache so failure fallbacks are never stored.
  const { withScopedCache } = await import('@/lib/personnel-cache')
  return withScopedCache('super-admin:pending-employees', 30, async () => {
  try {
    // Both self-registered roles wait for approval (employee + personnel).
    const rows = await prisma.profile.findMany({
      where: { status: 'pending', role: { in: ['employee', 'pgso_personnel'] } },
      orderBy: { created_at: 'desc' },
      take: 200,
      select: ADMIN_SELECT,
    })
    const [emails, extra] = await Promise.all([
      emailMapFor(rows.map((r) => r.id)),
      extraFor(rows.map((r) => r.id)),
    ])
    return rows.map((r) => toAdminRow(r, emails, extra.get(r.id)))
  } catch (e) {
    console.error('[getPendingEmployees]', e)
    return []
  }
  })
}

export async function getAllUsers(): Promise<AdminUserRow[]> {
  try {
    await requireSuperAdmin()
  } catch {
    return []
  }
  const { withScopedCache } = await import('@/lib/personnel-cache')
  return withScopedCache('super-admin:all-users', 30, async () => {
  try {
    const rows = await prisma.profile.findMany({
      orderBy: { created_at: 'desc' },
      take: 300,
      select: ADMIN_SELECT,
    })
    const [emails, extra] = await Promise.all([
      emailMapFor(rows.map((r) => r.id)),
      extraFor(rows.map((r) => r.id)),
    ])
    return rows.map((r) => toAdminRow(r, emails, extra.get(r.id)))
  } catch (e) {
    console.error('[getAllUsers]', e)
    return []
  }
  })
}

export interface UsersPage {
  rows: AdminUserRow[]
  data: AdminUserRow[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/**
 * Server-paged roster window (PAGE_SIZE = 15) replacing the legacy take-300
 * snapshot + client slice: the DB returns only the window (+ exact total per
 * filter set, cached 30s and busted by user writes). Search spans the DB
 * profile columns plus Auth emails (bounded pre-lookup, same 200-user cap as
 * the legacy path). Pending self-registrations (any role) live in the
 * approval queue, not the roster table.
 */
export async function getUsersPage(
  opts: { page?: number; q?: string } = {}
): Promise<UsersPage> {
  try {
    await requireSuperAdmin()
  } catch {
    return { rows: [], data: [], total: 0, page: 1, pageSize: 15, totalPages: 1 }
  }
  const { withScopedCache } = await import('@/lib/personnel-cache')
  const { PAGE_SIZE } = await import('@/lib/constants')
  const { parsePage, parseQuery, pageResponse } = await import('@/lib/paged')
  const page = parsePage(opts.page)
  const q = parseQuery(opts.q)
  const pageSize = PAGE_SIZE
  return withScopedCache('super-admin:users-page', 30, async () => {
  try {
    const like = q ? `%${q}%` : null
    // Email lives in Auth, not the DB: pre-resolve matching ids (bounded)
    // so email search keeps working on a server window.
    let emailIds: string[] = []
    if (like) {
      try {
        const supabase = adminClient()
        const { data } = await supabase.auth.admin.listUsers({ perPage: 100 })
        const all = [...(data?.users ?? [])]
        if (all.length >= 100) {
          const { data: page2 } = await supabase.auth.admin.listUsers({ perPage: 100, page: 2 })
          all.push(...(page2?.users ?? []))
        }
        emailIds = all.filter((u) => (u.email ?? '').toLowerCase().includes(q.toLowerCase())).map((u) => u.id)
      } catch {
        emailIds = []
      }
    }
    const where: Record<string, unknown> = {
      NOT: [{ status: 'pending' }],
    }
    if (like) {
      // employee_no / department exist only after migration 25 (same guard
      // as the SELECT list) — filtering on missing columns would P2022 the
      // whole window into an empty roster on older DBs.
      const migrated = await hasMigration25()
      ;(where as Record<string, unknown>).OR = [
        { full_name: { contains: q, mode: 'insensitive' } },
        { role: { contains: q, mode: 'insensitive' } },
        { status: { contains: q, mode: 'insensitive' } },
        { position: { contains: q, mode: 'insensitive' } },
        { office: { contains: q, mode: 'insensitive' } },
        ...(migrated
          ? [
              { department: { contains: q, mode: 'insensitive' } },
              { employee_no: { contains: q, mode: 'insensitive' } },
            ]
          : []),
        ...(emailIds.length > 0 ? [{ id: { in: emailIds } }] : []),
      ]
    }
    const [total, rows] = await Promise.all([
      prisma.profile.count({ where: where as never }),
      prisma.profile.findMany({
        where: where as never,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: ADMIN_SELECT,
      }),
    ])
    const [emails, extra] = await Promise.all([
      emailMapFor(rows.map((r) => r.id)),
      extraFor(rows.map((r) => r.id)),
    ])
    const mapped = rows.map((r) => toAdminRow(r, emails, extra.get(r.id)))
    const e = pageResponse(mapped, total, page, pageSize)
    return { rows: e.rows, data: e.data, total: e.total, page: e.page, pageSize: e.pageSize, totalPages: e.totalPages }
  } catch (e) {
    console.error('[getUsersPage]', e)
    return { rows: [], data: [], total: 0, page: 1, pageSize, totalPages: 1 }
  }
  }, { page, pageSize, q })
}

export async function getUserCounts(): Promise<{ pending: number; personnel: number; employees: number }> {  try {
    await requireSuperAdmin()
  } catch {
    return { pending: 0, personnel: 0, employees: 0 }
  }
  const { withScopedCache } = await import('@/lib/personnel-cache')
  return withScopedCache('super-admin:user-counts', 30, async () => {
  try {
    const [pending, personnel, employees] = await Promise.all([
      prisma.profile.count({ where: { status: 'pending', role: { in: ['employee', 'pgso_personnel'] } } }),
      prisma.profile.count({ where: { role: 'pgso_personnel' } }),
      prisma.profile.count({ where: { role: 'employee' } }),
    ])
    return { pending, personnel, employees }
  } catch {
    return { pending: 0, personnel: 0, employees: 0 }
  }
  })
}

async function guardTarget(actorId: string, targetId: string) {
  if (actorId === targetId) {
    throw new Error('You cannot change your own account.')
  }
    const target = await prisma.profile.findUnique({
      where: { id: targetId },
      select: { id: true, full_name: true, role: true, status: true },
    })
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
    if ((target.role !== 'employee' && target.role !== 'pgso_personnel') || target.status !== 'pending') {
      throw new Error('Only pending employee / personnel accounts can be approved.')
    }
    await prisma.profile.update({
      where: { id: targetId },
      data: { status: 'active' },
    })
    const { bustRoleCache } = await import('@/lib/personnel-scope')
    bustRoleCache(targetId)
    const { bustMiddlewareRoleCache } = await import('@/lib/personnel-cache')
    void bustMiddlewareRoleCache(targetId).catch(() => {})
    await writeAuditLog({
      userId: actorId,
      action: 'users:approve_employee',
      module: 'users',
      details: { purpose: 'Approve self-registration', summary: `Approved ${target.full_name ?? targetId} (${target.role})`, reference_id: targetId },
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Approval failed.' }
  }
  const { bustSuperAdminScopes } = await import('@/lib/personnel-cache')
  await bustSuperAdminScopes(['users'])
  revalidatePath('/super-admin/users')
  revalidatePath('/super-admin/dashboard')
  return { ok: true }
}

export async function rejectEmployee(targetId: string): Promise<{ ok: boolean; error?: string }> {
  let actorId = ''
  try {
    ;({ userId: actorId } = await requireSuperAdmin())
    const target = await guardTarget(actorId, targetId)
    if ((target.role !== 'employee' && target.role !== 'pgso_personnel') || target.status !== 'pending') {
      throw new Error('Only pending employee / personnel accounts can be rejected.')
    }
    await prisma.profile.update({
      where: { id: targetId },
      data: { status: 'inactive' },
    })
    const { bustRoleCache } = await import('@/lib/personnel-scope')
    bustRoleCache(targetId)
    const { bustMiddlewareRoleCache } = await import('@/lib/personnel-cache')
    void bustMiddlewareRoleCache(targetId).catch(() => {})
    // NOTE: auth.admin.signOut() takes a JWT, not a user ID, so it cannot
    // revoke this session. No replacement call exists server-side; the
    // middleware profile-status check signs the account out on its next
    // request instead.
    await writeAuditLog({
      userId: actorId,
      action: 'users:reject_employee',
      module: 'users',
      details: { purpose: 'Reject self-registration', summary: `Rejected ${target.full_name ?? targetId} (${target.role})`, reference_id: targetId },
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Rejection failed.' }
  }
  const { bustSuperAdminScopes } = await import('@/lib/personnel-cache')
  await bustSuperAdminScopes(['users'])
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
    const { bustRoleCache } = await import('@/lib/personnel-scope')
    bustRoleCache(targetId)
    const { bustMiddlewareRoleCache } = await import('@/lib/personnel-cache')
    void bustMiddlewareRoleCache(targetId).catch(() => {})
    // NOTE: auth.admin.signOut() takes a JWT, not a user ID, so it cannot
    // revoke this session — the middleware profile-status check signs the
    // account out on its next request instead. The status flip above is the
    // enforcement point.
  const target = await prisma.profile.findUnique({
    where: { id: targetId },
    select: { id: true, full_name: true, role: true, status: true },
  })
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
  const { bustSuperAdminScopes } = await import('@/lib/personnel-cache')
  await bustSuperAdminScopes(['users'])
  revalidatePath('/super-admin/users')
  revalidatePath('/super-admin/dashboard')
  return { ok: true }
}
