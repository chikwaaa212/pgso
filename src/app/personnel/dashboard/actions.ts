'use server'

import prisma from '@/lib/prisma'
import { getPersonnelScope } from '@/lib/personnel-scope'

// ─── Extended counts for the full operations overview ───────────────────────

export interface OperationsStats {
  totalDeliveries: number
  pendingInspections: number
  completedInspections: number
  totalItems: number
  pendingRequests: number
  pendingRepairs: number
  inProgressRepairs: number
  totalDocuments: number
  lowStockCount: number
  outOfStockCount: number
  totalAssets: number
  totalStockSkus: number
  totalIssuances: number
}

async function countIssuances(ownerId?: string | null, scopeAll?: boolean): Promise<number> {
  try {
    if (ownerId && !scopeAll) {
      const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count FROM issuance_records WHERE created_by = ${ownerId}::uuid`
      return Number(rows[0]?.count ?? 0)
    }
    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM issuance_records`
    return Number(rows[0]?.count ?? 0)
  } catch {
    return 0
  }
}

async function countMyRepairsByStatus(
  ownerId: string | null,
  status: string,
  scopeAll?: boolean
): Promise<number> {
  if (!ownerId) return 0
  try {
    if (scopeAll) return await prisma.repair.count({ where: { status } })
    // Strict own-data (created_by = me, no legacy-NULL fallback) — matches
    // getRepairs() behind the repairs page so the badge never exceeds what
    // the login user actually sees.
    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM repairs
      WHERE status = ${status} AND created_by = ${ownerId}::uuid`
    return Number(rows[0]?.count ?? 0)
  } catch {
    // Column missing (migration not applied yet) → fail closed for
    // personnel: returning the global queue would leak other users' tickets.
    return 0
  }
}

export async function getOperationsStats(
  scopeOverride?: import('@/lib/personnel-scope').PersonnelScope
): Promise<OperationsStats> {
  const { withScopedCache } = await import('@/lib/personnel-cache')
  const scopeHint = scopeOverride
    ? { u: scopeOverride.userId ?? 'anon', a: scopeOverride.isSuperAdmin ? 1 : 0 }
    : {}
  return withScopedCache('personnel:ops-stats', 60, async () => {
  const zeros: OperationsStats = {
    totalDeliveries: 0,
    pendingInspections: 0,
    completedInspections: 0,
    totalItems: 0,
    pendingRequests: 0,
    pendingRepairs: 0,
    inProgressRepairs: 0,
    totalDocuments: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
    totalAssets: 0,
    totalStockSkus: 0,
    totalIssuances: 0,
  }
  try {
    // Own-data scope for personnel activity; super_admin sees all.
    // Shared pools (requests queue, stocks, assets registry) stay global.
    const scope = scopeOverride ?? (await getPersonnelScope())
    if (scope.isEmpty || !scope.userId) return zeros
    const me = scope.userId
    const myDeliveryFilter = scope.isSuperAdmin ? {} : { received_by: me }
    const myInspectionFilter = scope.isSuperAdmin ? {} : { inspector_id: me }
    // Requests badge/cards match the personnel inbox exactly (strict
    // recipient_id = me — same filter as getRequests({ forRecipient: true })
    // behind the requests page). Super admin keeps the global queue count.
    const myRequestFilter = scope.isSuperAdmin
      ? { status: 'pending' }
      : { status: 'pending', recipient_id: me }
    const { getDashboardStats } = await import('../inspections/actions')
    // Two sequential batches (was one 11-way fan-out): the dashboard shares
    // one pooler connection pool with the layout's own stats queries.
    // totalDocuments joins the second batch instead of a third serial hop.
    const [
      totalDeliveries,
      pendingInspections,
      completedInspections,
      totalItems,
      pendingRequests,
      pendingRepairs,
    ] = await Promise.all([
      prisma.delivery.count({ where: myDeliveryFilter }),
      prisma.delivery.count({ where: { ...myDeliveryFilter, inspection_status: 'pending' } }),
      prisma.inspection.count({ where: myInspectionFilter }),
      prisma.deliveryItem.count({ where: { delivery: myDeliveryFilter } }),
      prisma.request.count({ where: myRequestFilter }),
      countMyRepairsByStatus(me, 'pending', scope.isSuperAdmin),
    ])
    const [
      inProgressRepairs,
      totalAssets,
      totalStockSkus,
      totalIssuances,
      out,
      low,
      totalDocuments,
    ] = await Promise.all([
      countMyRepairsByStatus(me, 'in_progress', scope.isSuperAdmin),
      prisma.asset.count().catch(() => 0),
      prisma.inventoryItem.count().catch(() => 0),
      countIssuances(me, scope.isSuperAdmin),
      // Count in the DB instead of downloading every stock row to tally in JS.
      prisma.inventoryItem.count({ where: { quantity: { lte: 0 } } }).catch(() => 0),
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count FROM inventory
        WHERE quantity > 0 AND reorder_threshold IS NOT NULL AND quantity <= reorder_threshold`
        .then((r) => Number(r[0]?.count ?? 0))
        .catch(() => 0),
      // Same "unviewed documents" notion as the sidebar badge so the
      // dashboard card and the nav stay in sync — same scope, no re-lookup.
      getDashboardStats(scope).then((s) => s.totalDocuments).catch(() => 0),
    ])

    return {
      totalDeliveries,
      pendingInspections,
      completedInspections,
      totalItems,
      pendingRequests,
      pendingRepairs,
      inProgressRepairs,
      totalDocuments,
      lowStockCount: low,
      outOfStockCount: out,
      totalAssets,
      totalStockSkus,
      totalIssuances,
    }
  } catch (e) {
    console.error('[getOperationsStats]', e)
    return zeros
  }
  }, scopeHint)
}

// ─── Low-stock watchlist ────────────────────────────────────────────────────

export interface LowStockRow {
  id: string
  item_name: string
  quantity: number
  unit: string | null
  reorder_threshold: number | null
  level: 'low' | 'critical' | 'out'
}

export async function getLowStockItems(limit = 5): Promise<LowStockRow[]> {
  const { withCache, cacheKey } = await import('@/lib/personnel-cache')
  // Shared stock pool — global key (not per-user).
  return withCache(cacheKey('personnel:low-stock', { limit }), 60, async () => {
  try {
    const rows = await prisma.inventoryItem.findMany({
      orderBy: { quantity: 'asc' },
      take: 60,
      select: {
        id: true,
        item_name: true,
        quantity: true,
        unit: true,
        reorder_threshold: true,
      },
    })
    const flagged: LowStockRow[] = []
    for (const r of rows) {
      if (r.quantity <= 0) {
        flagged.push({ ...r, level: 'out' })
      } else if (
        r.reorder_threshold != null &&
        r.quantity <= Math.floor(r.reorder_threshold / 2)
      ) {
        flagged.push({ ...r, level: 'critical' })
      } else if (
        r.reorder_threshold != null &&
        r.quantity <= r.reorder_threshold
      ) {
        flagged.push({ ...r, level: 'low' })
      }
      if (flagged.length >= limit) break
    }
    return flagged
  } catch (e) {
    console.error('[getLowStockItems]', e)
    return []
  }
  })
}

// ─── Recent requests ────────────────────────────────────────────────────────

export interface RecentRequestRow {
  id: string
  request_type: string
  status: string | null
  employee_name: string
  date_requested: string | null
}

export async function getRecentRequests(
  limit = 5,
  scopeOverride?: import('@/lib/personnel-scope').PersonnelScope
): Promise<RecentRequestRow[]> {
  const { withScopedCache } = await import('@/lib/personnel-cache')
  const scopeHint = scopeOverride
    ? { u: scopeOverride.userId ?? 'anon', a: scopeOverride.isSuperAdmin ? 1 : 0, limit }
    : { limit }
  return withScopedCache('personnel:recent-requests', 60, async () => {
  try {
    // Personnel inbox only (recipient = me — same filter as the requests
    // page); super_admin sees the whole queue. Scoped per-user so one
    // login's dashboard never shows another user's requests.
    const scope = scopeOverride ?? (await getPersonnelScope())
    if (scope.isEmpty || !scope.userId) return []
    const take = Number.isFinite(limit)
      ? Math.min(Math.max(Math.floor(limit), 1), 100)
      : 5
    const rows = await prisma.request.findMany({
      where: scope.isSuperAdmin ? undefined : { recipient_id: scope.userId },
      orderBy: { date_requested: 'desc' },
      take,
      select: {
        id: true,
        request_type: true,
        status: true,
        employee_id: true,
        date_requested: true,
      },
    })
    const names = new Map<string, string>()
    if (rows.length > 0) {
      const profiles = await prisma.profile
        .findMany({
          where: { id: { in: [...new Set(rows.map((r) => r.employee_id))] } },
          select: { id: true, full_name: true },
        })
        .catch(() => [] as { id: string; full_name: string | null }[])
      for (const p of profiles) names.set(p.id, p.full_name ?? 'Unknown')
    }
    return rows.map((r) => ({
      id: r.id,
      request_type: r.request_type,
      status: r.status,
      employee_name: names.get(r.employee_id) ?? 'Unknown employee',
      date_requested: r.date_requested?.toISOString() ?? null,
    }))
  } catch (e) {
    console.error('[getRecentRequests]', e)
    return []
  }
  }, scopeHint)
}

// ─── Recent repairs ─────────────────────────────────────────────────────────

export interface RecentRepairRow {
  id: string
  description: string
  status: string | null
  technician: string | null
  asset_label: string | null
  repair_date: string
}

export async function getRecentRepairs(
  limit = 5,
  scopeOverride?: import('@/lib/personnel-scope').PersonnelScope
): Promise<RecentRepairRow[]> {
  const { withScopedCache } = await import('@/lib/personnel-cache')
  const scopeHint = scopeOverride
    ? { u: scopeOverride.userId ?? 'anon', a: scopeOverride.isSuperAdmin ? 1 : 0, limit }
    : { limit }
  return withScopedCache('personnel:recent-repairs', 60, async () => {
  try {
    // Own-data only for personnel (strict created_by = me — same filter as
    // getRepairs() behind the repairs page); super_admin sees all.
    const scope = scopeOverride ?? (await getPersonnelScope())
    if (scope.isEmpty || !scope.userId) return []
    const me = scope.userId
    interface RepairRecentDb {
      id: string
      description: string
      status: string | null
      technician: string | null
      asset_id: string
      repair_date: Date | string
    }
    let rows: RepairRecentDb[] = []
    try {
      rows = scope.isSuperAdmin
        ? await prisma.$queryRaw<RepairRecentDb[]>`
        SELECT id::text AS id, description, status, technician,
               asset_id::text AS asset_id, repair_date
        FROM repairs
        ORDER BY created_at DESC LIMIT ${limit}`
        : await prisma.$queryRaw<RepairRecentDb[]>`
        SELECT id::text AS id, description, status, technician,
               asset_id::text AS asset_id, repair_date
        FROM repairs
        WHERE created_by = ${me}::uuid
        ORDER BY created_at DESC LIMIT ${limit}`
    } catch {
      // Column missing (migration not applied yet) → fail closed for
      // personnel (never the whole table); super_admin keeps the fallback.
      if (!scope.isSuperAdmin) return []
      const fallback = await prisma.repair.findMany({
        orderBy: { created_at: 'desc' },
        take: limit,
        select: {
          id: true,
          description: true,
          status: true,
          technician: true,
          asset_id: true,
          repair_date: true,
        },
      })
      rows = fallback
    }
    const assetMap = new Map<string, string>()
    if (rows.length > 0) {
      const assets = await prisma.asset
        .findMany({
          where: { id: { in: [...new Set(rows.map((r) => r.asset_id))] } },
          select: { id: true, article: true, description: true, qr_code: true },
        })
        .catch(() => [] as { id: string; article: string | null; description: string | null; qr_code: string | null }[])
      for (const a of assets) {
        const bits = [a.qr_code, a.article, a.description].filter(Boolean) as string[]
        assetMap.set(a.id, bits.length > 0 ? bits.join(' — ').slice(0, 60) : 'Asset')
      }
    }
    return rows.map((r) => ({
      id: r.id,
      description: r.description,
      status: r.status,
      technician: r.technician,
      asset_label: assetMap.get(r.asset_id) ?? null,
      repair_date:
        r.repair_date instanceof Date
          ? r.repair_date.toISOString().slice(0, 10)
          : new Date(r.repair_date).toISOString().slice(0, 10),
    }))
  } catch (e) {
    console.error('[getRecentRepairs]', e)
    return []
  }
  }, scopeHint)
}

// ─── Recent PAR / ICS issuances ─────────────────────────────────────────────

export interface RecentIssuanceRow {
  id: string
  doc_type: string
  doc_no: string | null
  employee_name: string
  created_at: string | null
}

export async function getRecentIssuances(
  limit = 5,
  scopeOverride?: import('@/lib/personnel-scope').PersonnelScope
): Promise<RecentIssuanceRow[]> {
  const { withScopedCache } = await import('@/lib/personnel-cache')
  const scopeHint = scopeOverride
    ? { u: scopeOverride.userId ?? 'anon', a: scopeOverride.isSuperAdmin ? 1 : 0, limit }
    : { limit }
  return withScopedCache('personnel:recent-issuances', 60, async () => {
  try {
    // Own-data only for personnel; super_admin sees all.
    const scope = scopeOverride ?? (await getPersonnelScope())
    if (scope.isEmpty || !scope.userId) return []
    const me = scope.userId
    const rows = scope.isSuperAdmin
      ? await prisma.$queryRaw<
      {
        id: string
        doc_type: string
        doc_no: string | null
        employee_id: string
        created_at: Date | string | null
      }[]
    >`
      SELECT id::text AS id, doc_type, doc_no,
             employee_id::text AS employee_id, created_at
      FROM issuance_records ORDER BY created_at DESC LIMIT ${limit}`
      : await prisma.$queryRaw<
      {
        id: string
        doc_type: string
        doc_no: string | null
        employee_id: string
        created_at: Date | string | null
      }[]
    >`
      SELECT id::text AS id, doc_type, doc_no,
             employee_id::text AS employee_id, created_at
      FROM issuance_records WHERE created_by = ${me}::uuid ORDER BY created_at DESC LIMIT ${limit}`
    const names = new Map<string, string>()
    if (rows.length > 0) {
      const profiles = await prisma.profile
        .findMany({
          where: { id: { in: [...new Set(rows.map((r) => r.employee_id))] } },
          select: { id: true, full_name: true },
        })
        .catch(() => [] as { id: string; full_name: string | null }[])
      for (const p of profiles) names.set(p.id, p.full_name ?? 'Unknown')
    }
    return rows.map((r) => ({
      id: r.id,
      doc_type: r.doc_type,
      doc_no: r.doc_no,
      employee_name: names.get(r.employee_id) ?? 'Unknown employee',
      created_at:
        r.created_at instanceof Date
          ? r.created_at.toISOString()
          : r.created_at
            ? new Date(r.created_at).toISOString()
            : null,
    }))
  } catch (e) {
    console.error('[getRecentIssuances]', e)
    return []
  }
  }, scopeHint)
}

// ─── Snapshot (single round-trip for the cached client dashboard) ──────────

export interface DashboardSnapshot {
  stats: OperationsStats
  monthly: import('../inspections/actions').MonthlyPoint[]
  recentDeliveries: import('../inspections/actions').RecentDeliveryRow[]
  recentRequests: RecentRequestRow[]
  recentRepairs: RecentRepairRow[]
  lowStock: LowStockRow[]
  recentIssuances: RecentIssuanceRow[]
}

/**
 * One server round-trip for the whole dashboard. Each inner reader keeps its
 * own Redis entry, and the assembled snapshot gets a scoped 60s entry on
 * top — back-navigation is served from the browser cache instantly and only
 * revalidates silently when stale.
 */
export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  const { withScopedCache } = await import('@/lib/personnel-cache')
  return withScopedCache('personnel:dashboard-snapshot', 60, async () => {
    const { getMonthlyOverview, getRecentDeliveries } = await import(
      '../inspections/actions'
    )
    // Resolve scope once and thread it — 7 readers sharing one Auth+profile
    // lookup instead of 7 independent getUser+profile chains.
    const { getPersonnelScope } = await import('@/lib/personnel-scope')
    const scope = await getPersonnelScope()
    const [
      stats,
      monthly,
      recentDeliveries,
      recentRequests,
      recentRepairs,
      lowStock,
      recentIssuances,
    ] = await Promise.all([
      getOperationsStats(scope),
      getMonthlyOverview(scope),
      getRecentDeliveries(5, scope),
      getRecentRequests(7, scope),
      getRecentRepairs(5, scope),
      getLowStockItems(5),
      getRecentIssuances(5, scope),
    ])
    return {
      stats,
      monthly,
      recentDeliveries,
      recentRequests,
      recentRepairs,
      lowStock,
      recentIssuances,
    }
  })
}
