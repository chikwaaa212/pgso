'use server'

import { revalidatePath as nextRevalidatePath } from 'next/cache'

// Every Next.js revalidation also busts the Upstash personnel cache so
// Redis never serves stale lists after a write (fire-and-forget).
function revalidatePath(path: string) {
  nextRevalidatePath(path)
  void import('@/lib/personnel-cache')
    .then((m) => m.bustPersonnelCache())
    .catch(() => {})
}
import { createClient } from '@/lib/supabase/server'
import prisma from '@/lib/prisma'
import { writeAuditLog } from '@/lib/audit'
import { getPersonnelScope } from '@/lib/personnel-scope'
import { getAllUnifiedAssets } from '../assets/actions'
import { REPAIR_STATUSES, type RepairStatus } from './repair-types'

export interface RepairRow {
  id: string
  asset_id: string
  asset_label: string | null
  account_code: string | null
  account_title: string | null
  asset_type: string | null
  reported_by: string
  reporter_name: string
  repair_date: string
  description: string
  status: string | null
  cost: number | null
  technician: string | null
  created_at: string | null
  created_by?: string | null
}

export interface RepairAssetOption {
  id: string
  label: string
  account_code: string | null
  account_title: string | null
  asset_type: string | null
  location: string | null
  status: string | null
}

export interface RepairEmployeeOption {
  id: string
  full_name: string
}

function assetLabel(a: {
  qr_code: string | null
  account_code: string | null
  article: string | null
  description: string | null
}): string {
  const bits = [a.qr_code ?? a.account_code, a.article, a.description].filter(
    Boolean
  ) as string[]
  return bits.length > 0 ? bits.join(' — ').slice(0, 80) : 'Asset'
}

export async function getRepairs(): Promise<RepairRow[]> {
  const { withScopedCache } = await import('@/lib/personnel-cache')
  // v2 = strict owner filter (created_by = me). Bumps the cache key so the
  // pre-fix payload (which included legacy NULL rows for everyone) is
  // never served after deploy.
  return withScopedCache('personnel:repairs', 30, async () => {
  try {
    // Strict own-data for personnel: only tickets this login created
    // (manual logs) or auto-tickets routed to them as the request
    // recipient (see setRequestStatus). No legacy-NULL fallback — a NULL
    // owner must never leak another user's ticket. Super_admin sees all.
    const scope = await getPersonnelScope()
    if (scope.isEmpty || !scope.userId) return []
    interface RepairDbRow {
      id: string
      asset_id: string
      reported_by: string
      repair_date: Date | string
      description: string
      status: string | null
      cost: unknown
      technician: string | null
      created_at: Date | string | null
      created_by: string | null
    }
    let repairRows: RepairDbRow[]
    try {
      repairRows = scope.isSuperAdmin
        ? await prisma.$queryRaw<RepairDbRow[]>`
        SELECT id::text AS id, asset_id::text AS asset_id,
               reported_by::text AS reported_by, repair_date, description,
               status, cost, technician, created_at,
               created_by::text AS created_by
        FROM repairs
        ORDER BY created_at DESC`
        : await prisma.$queryRaw<RepairDbRow[]>`
        SELECT id::text AS id, asset_id::text AS asset_id,
               reported_by::text AS reported_by, repair_date, description,
               status, cost, technician, created_at,
               created_by::text AS created_by
        FROM repairs
        WHERE created_by = ${scope.userId}::uuid
        ORDER BY created_at DESC`
    } catch {
      // Column missing (migration not applied yet) → fail closed for
      // personnel: returning everything would leak other users' tickets.
      // Super_admin keeps the unfiltered fallback; personnel gets nothing
      // rather than the whole table.
      if (!scope.isSuperAdmin) return []
      const fallback = await prisma.repair.findMany({
        orderBy: { created_at: 'desc' },
      })
      repairRows = fallback.map((r) => ({
        id: r.id,
        asset_id: r.asset_id,
        reported_by: r.reported_by,
        repair_date: r.repair_date,
        description: r.description,
        status: r.status,
        cost: r.cost,
        technician: r.technician,
        created_at: r.created_at,
        created_by: null,
      }))
    }
    const [profiles, assets] = await Promise.all([
      prisma.profile.findMany({ select: { id: true, full_name: true } }),
      getAllUnifiedAssets(),
    ])

    const names = new Map(profiles.map((p) => [p.id, p.full_name ?? '—']))
    const byId = new Map(assets.map((a) => [a.id, a]))

    return repairRows.map((r) => {
      const a = byId.get(r.asset_id)
      const repairDate =
        r.repair_date instanceof Date
          ? r.repair_date.toISOString().slice(0, 10)
          : new Date(r.repair_date).toISOString().slice(0, 10)
      const createdAt = !r.created_at
        ? null
        : r.created_at instanceof Date
          ? r.created_at.toISOString()
          : new Date(r.created_at).toISOString()
      return {
        id: r.id,
        asset_id: r.asset_id,
        asset_label: a ? assetLabel(a) : null,
        account_code: a?.account_code ?? null,
        account_title: a?.account_title ?? a?.account_name ?? null,
        asset_type: a?.category ?? null,
        reported_by: r.reported_by,
        reporter_name: names.get(r.reported_by) ?? 'Unknown employee',
        repair_date: repairDate,
        description: r.description,
        status: r.status,
        cost: r.cost != null ? Number(r.cost) : null,
        technician: r.technician,
        created_at: createdAt,
        created_by: r.created_by,
      }
    })
  } catch (e) {
    console.error('[getRepairs]', e)
    return []
  }
  }, { v: 2 })
}

export async function getRepair(id: string): Promise<RepairRow | null> {
  try {
    const rows = await getRepairs()
    return rows.find((r) => r.id === id) ?? null
  } catch (e) {
    console.error('[getRepair]', e)
    return null
  }
}

export async function getRepairFormOptions(): Promise<{
  assets: RepairAssetOption[]
  employees: RepairEmployeeOption[]
}> {
  const { withCache, cacheKey } = await import('@/lib/personnel-cache')
  return withCache(cacheKey('personnel:repair-form-options'), 60, async () => {
  try {
    const [profiles, assets] = await Promise.all([
      prisma.profile.findMany({
        where: { status: 'active', role: 'employee' },
        orderBy: { full_name: 'asc' },
        select: { id: true, full_name: true },
      }),
      getAllUnifiedAssets(),
    ])

    return {
      employees: profiles.map((p) => ({
        id: p.id,
        full_name: p.full_name ?? 'Unnamed',
      })),
      assets: assets
        .filter((a) => a.source === 'asset')
        .map((a) => ({
          id: a.id,
          label: assetLabel(a),
          account_code: a.account_code,
          account_title: a.account_title ?? a.account_name,
          asset_type: a.category,
          location: a.location,
          status: a.status,
        })),
    }
  } catch (e) {
    console.error('[getRepairFormOptions]', e)
    return { assets: [], employees: [] }
  }
  })
}

export interface RepairState {
  success?: boolean
  error?: string
}

export interface CreateRepairInput {
  assetId: string
  employeeId: string
  repairDate: string
  description: string
  technician?: string
  cost?: string
}

export async function createRepair(
  input: CreateRepairInput
): Promise<RepairState> {
  const assetId = input.assetId?.trim() ?? ''
  const employeeId = input.employeeId?.trim() ?? ''
  const description = input.description?.trim() ?? ''
  const technician = input.technician?.trim() || null
  const costRaw = input.cost?.trim() ?? ''

  if (!assetId) return { error: 'Select the asset to repair.' }
  if (!employeeId) return { error: 'Select who reported the issue.' }
  if (!description) return { error: 'Describe the issue.' }

  const repairDate = input.repairDate ? new Date(input.repairDate) : new Date()
  if (Number.isNaN(repairDate.getTime()))
    return { error: 'Enter a valid repair date.' }

  let cost: number | null = null
  if (costRaw !== '') {
    const n = Number(costRaw)
    if (!Number.isFinite(n) || n < 0)
      return { error: 'Cost must be zero or more.' }
    cost = n
  }

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const [asset, employee] = await Promise.all([
      prisma.asset.findUnique({ where: { id: assetId }, select: { id: true } }),
      prisma.profile.findUnique({
        where: { id: employeeId },
        select: { id: true, role: true, status: true },
      }),
    ])
    if (!asset) return { error: 'Selected asset no longer exists.' }
    if (!employee) return { error: 'Selected employee no longer exists.' }
    if (!user) return { error: 'You must be signed in to log a repair.' }

    // Raw insert carries created_by even when the generated client predates migration 16.
    try {
      const { randomUUID } = await import('crypto')
      await prisma.$executeRaw`
        INSERT INTO repairs (id, asset_id, reported_by, repair_date, description, technician, cost, status, created_by)
        VALUES (${randomUUID()}::uuid, ${assetId}::uuid, ${employeeId}::uuid, ${repairDate}::date, ${description}, ${technician}, ${cost}, 'pending', ${user.id}::uuid)`
    } catch {
      // Column missing (migration not applied yet) → legacy insert without owner.
      await prisma.repair.create({
        data: {
          asset_id: assetId,
          reported_by: employeeId,
          repair_date: repairDate,
          description,
          technician,
          cost,
          status: 'pending',
        },
      })
    }
  } catch (e) {
    console.error('[createRepair]', e)
    return { error: 'Failed to log the repair. Please try again.' }
  }

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      await writeAuditLog({
        userId: user.id,
        action: 'repair:create',
        module: 'repairs',
        details: {
          purpose: description,
          summary: `Repair ticket for asset ${assetId.slice(0, 8).toUpperCase()}${technician ? ` · ${technician}` : ''}`,
          reference_id: assetId,
        },
      })
    }
  } catch {
    // best-effort only
  }

  // Await the Redis bust BEFORE reporting success: otherwise the client's
  // immediate refetch wins the race, serves pre-write rows, and re-caches
  // them as fresh (same pattern as requests / deliveries writes).
  const { bustPersonnelCache } = await import('@/lib/personnel-cache')
  await bustPersonnelCache()
  revalidatePath('/personnel/repairs')
  revalidatePath('/personnel/dashboard')
  return { success: true }
}

export interface UpdateRepairInput {
  repairDate: string
  description: string
  technician?: string
  cost?: string
  status: string
}

export async function updateRepair(
  id: string,
  input: UpdateRepairInput
): Promise<RepairState> {
  if (!id) return { error: 'Missing repair id.' }
  if (!REPAIR_STATUSES.includes(input.status as RepairStatus))
    return { error: 'Select a valid status.' }

  const description = input.description?.trim() ?? ''
  if (!description) return { error: 'Describe the issue.' }

  const repairDate = input.repairDate ? new Date(input.repairDate) : null
  if (!repairDate || Number.isNaN(repairDate.getTime()))
    return { error: 'Enter a valid repair date.' }

  const technician = input.technician?.trim() || null
  const costRaw = input.cost?.trim() ?? ''
  let cost: number | null = null
  if (costRaw !== '') {
    const n = Number(costRaw)
    if (!Number.isFinite(n) || n < 0)
      return { error: 'Cost must be zero or more.' }
    cost = n
  }

  // Starting or handling a repair requires full info — no bare status flips.
  if ((input.status === 'in_progress' || input.status === 'completed') && !technician)
    return { error: 'Assign a technician before starting the repair.' }
  if (input.status === 'completed' && cost === null)
    return { error: 'Enter the repair cost before completing the repair.' }

  try {
    const scope = await getPersonnelScope()
    // Strict own-data for personnel: a ticket with no owner or another
    // owner's id is invisible AND uneditable. Super_admin bypasses.
    if (!scope.isSuperAdmin) {
      try {
        const owner = await prisma.$queryRaw<Array<{ created_by: string | null }>>`
          SELECT created_by::text AS created_by FROM repairs WHERE id = ${id}::uuid`
        const createdBy = owner[0]?.created_by ?? null
        if (!scope.userId) return { error: 'You must be signed in.' }
        if (owner.length === 0 || createdBy !== scope.userId)
          return { error: 'You can only update your own repair tickets.' }
      } catch {
        const existing = await prisma.repair.findUnique({
          where: { id },
          select: { id: true },
        })
        if (!existing) return { error: 'Repair ticket not found.' }
        // Column missing → fail closed: cannot prove ownership.
        if (!scope.isSuperAdmin) return { error: 'You can only update your own repair tickets.' }
      }
    }

    await prisma.repair.update({
      where: { id },
      data: {
        repair_date: repairDate,
        description,
        technician,
        cost,
        status: input.status,
      },
    })
  } catch (e) {
    console.error('[updateRepair]', e)
    return { error: 'Failed to update the repair. Please try again.' }
  }

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      await writeAuditLog({
        userId: user.id,
        action: `repair:${input.status}`,
        module: 'repairs',
        details: {
          purpose: description,
          summary: `Repair ${id.slice(0, 8).toUpperCase()} → ${input.status}${technician ? ` · ${technician}` : ''}`,
          reference_id: id,
          status: input.status,
        },
      })
    }
  } catch {
    // best-effort only
  }

  // Await the Redis bust BEFORE reporting success (see createRepair).
  const { bustPersonnelCache: bustUpdateCache } = await import('@/lib/personnel-cache')
  await bustUpdateCache()
  revalidatePath('/personnel/repairs')
  revalidatePath('/personnel/dashboard')
  return { success: true }
}

export async function setRepairStatus(
  id: string,
  status: string
): Promise<RepairState> {
  if (!id) return { error: 'Missing repair id.' }
  if (!REPAIR_STATUSES.includes(status as RepairStatus))
    return { error: 'Select a valid status.' }

  try {
    // Strict own-data for personnel: invisible tickets are also uneditable.
    const scope = await getPersonnelScope()
    if (!scope.isSuperAdmin) {
      if (!scope.userId) return { error: 'You must be signed in.' }
      try {
        const owner = await prisma.$queryRaw<Array<{ created_by: string | null }>>`
          SELECT created_by::text AS created_by FROM repairs WHERE id = ${id}::uuid`
        if (owner.length === 0) return { error: 'Repair ticket not found.' }
        const createdBy = owner[0]?.created_by ?? null
        if (createdBy !== scope.userId)
          return { error: 'You can only update your own repair tickets.' }
      } catch {
        // Column missing → fail closed, cannot prove ownership.
        return { error: 'You can only update your own repair tickets.' }
      }
    }
    // Guard the quick-action buttons so a repair can't be started/completed
    // without its required info — the Edit form collects it instead.
    if (status === 'in_progress' || status === 'completed') {
      const existing = await prisma.repair.findUnique({
        where: { id },
        select: { technician: true, cost: true },
      })
      if (!existing) return { error: 'Repair ticket not found.' }
      if (!existing.technician?.trim())
        return {
          error:
            'Assign a technician first — open Edit, fill in the needed information, then start the repair.',
        }
      if (status === 'completed' && existing.cost === null)
        return {
          error:
            'Enter the repair cost first — open Edit, fill in the needed information, then complete the repair.',
        }
    }
    await prisma.repair.update({ where: { id }, data: { status } })
  } catch (e) {
    console.error('[setRepairStatus]', e)
    return { error: 'Failed to update the repair status.' }
  }

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      await writeAuditLog({
        userId: user.id,
        action: `repair:${status}`,
        module: 'repairs',
        details: {
          purpose: `Change repair status to ${status}`,
          summary: `Repair ${id.slice(0, 8).toUpperCase()} → ${status}`,
          reference_id: id,
          status,
        },
      })
    }
  } catch {
    // best-effort only
  }

  // Await the Redis bust BEFORE reporting success (see createRepair).
  const { bustPersonnelCache: bustStatusCache } = await import('@/lib/personnel-cache')
  await bustStatusCache()
  revalidatePath('/personnel/repairs')
  revalidatePath('/personnel/dashboard')
  return { success: true }
}
