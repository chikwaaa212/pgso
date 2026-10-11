'use server'

import prisma from '@/lib/prisma'
import { getPersonnelScope } from '@/lib/personnel-scope'

// ─── Extended counts for the full operations overview ───────────────────────

export interface OperationsStats {  totalDeliveries: number
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
    // Requests badge/cards match the personnel inbox exactly (strict
    // recipient_id = me — same filter as getRequests({ forRecipient: true })
    // behind the requests page). Super admin keeps the global queue count.
    // (Enforced in the combined COUNT below; the old per-query filter consts
    // were removed with the fan-out.)
    const { getDashboardStats } = await import('../inspections/actions')
    // Single combined COUNT query (was two sequential Promise.all batches =
    // 13 round-trips). Each COUNT costs a full pooler RTT from far regions
    // while executing in ms in-DB, so fan-out was the dominant cost — same
    // lesson as browseDocumentHub (8 RTT → 1). Filters are identical to the
    // per-query versions they replace (own-data for personnel, global for
    // super_admin); only the batching changed, never the scoping.
    interface OpsCounts {
      total_deliveries: bigint
      pending_inspections: bigint
      completed_inspections: bigint
      total_items: bigint
      pending_requests: bigint
      pending_repairs: bigint
      in_progress_repairs: bigint
      total_assets: bigint
      total_skus: bigint
      total_issuances: bigint
      out_count: bigint
      low_count: bigint
    }
    const countsQuery = scope.isSuperAdmin
      ? prisma.$queryRaw<OpsCounts[]>`
        SELECT
          (SELECT COUNT(*) FROM deliveries)::bigint AS total_deliveries,
          (SELECT COUNT(*) FROM deliveries WHERE inspection_status = 'pending')::bigint AS pending_inspections,
          (SELECT COUNT(*) FROM inspections)::bigint AS completed_inspections,
          (SELECT COUNT(*) FROM delivery_items)::bigint AS total_items,
          (SELECT COUNT(*) FROM requests WHERE status = 'pending')::bigint AS pending_requests,
          (SELECT COUNT(*) FROM repairs WHERE status = 'pending')::bigint AS pending_repairs,
          (SELECT COUNT(*) FROM repairs WHERE status = 'in_progress')::bigint AS in_progress_repairs,
          (SELECT COUNT(*) FROM assets)::bigint AS total_assets,
          (SELECT COUNT(*) FROM inventory)::bigint AS total_skus,
          (SELECT COUNT(*) FROM issuance_records)::bigint AS total_issuances,
          (SELECT COUNT(*) FROM inventory WHERE quantity <= 0)::bigint AS out_count,
          (SELECT COUNT(*) FROM inventory WHERE quantity > 0 AND reorder_threshold IS NOT NULL AND quantity <= reorder_threshold)::bigint AS low_count`
      : prisma.$queryRaw<OpsCounts[]>`
        SELECT
          (SELECT COUNT(*) FROM deliveries WHERE received_by = ${me}::uuid)::bigint AS total_deliveries,
          (SELECT COUNT(*) FROM deliveries WHERE received_by = ${me}::uuid AND inspection_status = 'pending')::bigint AS pending_inspections,
          (SELECT COUNT(*) FROM inspections WHERE inspector_id = ${me}::uuid)::bigint AS completed_inspections,
          (SELECT COUNT(*) FROM delivery_items di JOIN deliveries d ON d.id = di.delivery_id WHERE d.received_by = ${me}::uuid)::bigint AS total_items,
          (SELECT COUNT(*) FROM requests WHERE status = 'pending' AND recipient_id = ${me}::uuid)::bigint AS pending_requests,
          (SELECT COUNT(*) FROM repairs WHERE status = 'pending' AND created_by = ${me}::uuid)::bigint AS pending_repairs,
          (SELECT COUNT(*) FROM repairs WHERE status = 'in_progress' AND created_by = ${me}::uuid)::bigint AS in_progress_repairs,
          (SELECT COUNT(*) FROM assets)::bigint AS total_assets,
          (SELECT COUNT(*) FROM inventory)::bigint AS total_skus,
          (SELECT COUNT(*) FROM issuance_records WHERE created_by = ${me}::uuid)::bigint AS total_issuances,
          (SELECT COUNT(*) FROM inventory WHERE quantity <= 0)::bigint AS out_count,
          (SELECT COUNT(*) FROM inventory WHERE quantity > 0 AND reorder_threshold IS NOT NULL AND quantity <= reorder_threshold)::bigint AS low_count`
    const [countRows, totalDocuments] = await Promise.all([
      countsQuery.catch(() => null),
      // Same "unviewed documents" notion as the sidebar badge so the
      // dashboard card and the nav stay in sync — same scope, no re-lookup.
      getDashboardStats(scope).then((s) => s.totalDocuments).catch(() => 0),
    ])
    if (!countRows || countRows.length === 0) return zeros
    const c = countRows[0]
    const totalDeliveries = Number(c.total_deliveries ?? 0)
    const pendingInspections = Number(c.pending_inspections ?? 0)
    const completedInspections = Number(c.completed_inspections ?? 0)
    const totalItems = Number(c.total_items ?? 0)
    const pendingRequests = Number(c.pending_requests ?? 0)
    const pendingRepairs = Number(c.pending_repairs ?? 0)
    const inProgressRepairs = Number(c.in_progress_repairs ?? 0)
    const totalAssets = Number(c.total_assets ?? 0)
    const totalStockSkus = Number(c.total_skus ?? 0)
    const totalIssuances = Number(c.total_issuances ?? 0)
    const out = Number(c.out_count ?? 0)
    const low = Number(c.low_count ?? 0)

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
