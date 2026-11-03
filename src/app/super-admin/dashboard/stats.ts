'use server'

import prisma from '@/lib/prisma'
import { requireSuperAdmin } from '@/lib/auth-guard'
import { getDashboardStats } from '@/app/personnel/inspections/actions'
import type { OperationsStats } from '@/app/personnel/dashboard/actions'

export interface RecentAuditEntry {
  id: string
  action: string
  module: string
  summary: string | null
  user_name: string
  created_at: string | null
}

export interface SuperOverview {
  ops: OperationsStats
  pendingAccounts: number
  totalPersonnel: number
  totalEmployees: number
  activeUnits: number
  activeCatalog: number
  inactiveCatalog: number
  recentAudit: RecentAuditEntry[]
}

const zeroOps: OperationsStats = {
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

export async function getSuperAdminOverview(): Promise<SuperOverview> {
  const fallback: SuperOverview = {
    ops: zeroOps,
    pendingAccounts: 0,
    totalPersonnel: 0,
    totalEmployees: 0,
    activeUnits: 0,
    activeCatalog: 0,
    inactiveCatalog: 0,
    recentAudit: [],
  }
  try {
    await requireSuperAdmin()
  } catch {
    return fallback
  }
  // Same caching as the personnel dashboard aggregates (60s scoped —
  // per-user key so entries can't leak across accounts). Auth stays
  // outside the cache so failure fallbacks are never stored.
  const { withScopedCache } = await import('@/lib/personnel-cache')
  return withScopedCache('super-admin:overview', 60, async () => {
  try {
    // getDashboardStats is per-request memoized and shared with the layout,
    // so the six overlapping global counts run once (was a second full
    // getOperationsStats fan-out on top of the layout's queries).
    // Kick off the badge-stat query and the extras query together: both hit
    // the remote DB (~350ms RTT), so sequential awaits would double the cold
    // dashboard time.
    const dashPromise = getDashboardStats()

    // Extras the badge stats don't carry — one SQL round-trip. The DB is
    // remote (~350ms RTT), so profile/catalog/unit counts, stock levels and
    // the recent audit stream (author names joined) all come back in one
    // query instead of a dozen parallel/sequential ones.
    interface OverviewExtras {
      pending_accounts: bigint
      total_personnel: bigint
      total_employees: bigint
      active_units: bigint
      active_catalog: bigint
      inactive_catalog: bigint
      in_progress_repairs: bigint
      total_assets: bigint
      total_stock_skus: bigint
      total_issuances: bigint
      out_count: bigint
      low_count: bigint
      audit: Array<{
        id: string
        action: string
        module: string
        details: unknown
        created_at: string | null
        user_name: string | null
      }> | null
    }
    const [dash, extrasRows] = await Promise.all([
      dashPromise,
      prisma.$queryRaw<OverviewExtras[]>`
      SELECT
        (SELECT COUNT(*) FROM profiles WHERE status = 'pending' AND role IN ('employee', 'pgso_personnel'))::bigint AS pending_accounts,
        (SELECT COUNT(*) FROM profiles WHERE role = 'pgso_personnel')::bigint AS total_personnel,
        (SELECT COUNT(*) FROM profiles WHERE role = 'employee')::bigint AS total_employees,
        (SELECT COUNT(*) FROM units WHERE status = 'active')::bigint AS active_units,
        (SELECT COUNT(*) FROM account_catalog WHERE status = 'active')::bigint AS active_catalog,
        (SELECT COUNT(*) FROM account_catalog WHERE status = 'inactive')::bigint AS inactive_catalog,
        (SELECT COUNT(*) FROM repairs WHERE status = 'in_progress')::bigint AS in_progress_repairs,
        (SELECT COUNT(*) FROM assets)::bigint AS total_assets,
        (SELECT COUNT(*) FROM inventory)::bigint AS total_stock_skus,
        (SELECT COUNT(*) FROM issuance_records)::bigint AS total_issuances,
        (SELECT COUNT(*) FROM inventory WHERE quantity <= 0)::bigint AS out_count,
        (SELECT COUNT(*) FROM inventory WHERE quantity > 0 AND reorder_threshold IS NOT NULL AND quantity <= reorder_threshold)::bigint AS low_count,
        COALESCE((
          SELECT json_agg(t)
          FROM (
            SELECT a.id, a.action, a.module, a.details, a.created_at, p.full_name AS user_name
            FROM audit_logs a
            LEFT JOIN profiles p ON p.id = a.user_id
            ORDER BY a.created_at DESC
            LIMIT 5
          ) t
        ), '[]'::json) AS audit`,
    ])
    const extras = extrasRows[0]

    const n = (v: bigint | null | undefined) => Number(v ?? 0)
    const low = n(extras?.low_count)
    const out = n(extras?.out_count)

    const ops: OperationsStats = {
      totalDeliveries: dash.totalDeliveries,
      pendingInspections: dash.pendingInspections,
      completedInspections: dash.completedInspections,
      totalItems: dash.totalItems,
      pendingRequests: dash.pendingRequests,
      pendingRepairs: dash.pendingRepairs,
      inProgressRepairs: n(extras?.in_progress_repairs),
      totalDocuments: dash.totalDocuments,
      lowStockCount: low,
      outOfStockCount: out,
      totalAssets: n(extras?.total_assets),
      totalStockSkus: n(extras?.total_stock_skus),
      totalIssuances: n(extras?.total_issuances),
    }

    const recentAudit: RecentAuditEntry[] = (extras?.audit ?? []).map((r) => {
      const d = (r.details ?? {}) as Record<string, unknown>
      const summary =
        typeof d.summary === 'string'
          ? d.summary
          : typeof d.description === 'string'
            ? d.description
            : null
      return {
        id: r.id,
        action: r.action,
        module: r.module,
        summary,
        user_name: r.user_name ?? 'Unknown',
        created_at: r.created_at ? new Date(r.created_at).toISOString() : null,
      }
    })

    return {
      ops,
      pendingAccounts: n(extras?.pending_accounts),
      totalPersonnel: n(extras?.total_personnel),
      totalEmployees: n(extras?.total_employees),
      activeUnits: n(extras?.active_units),
      activeCatalog: n(extras?.active_catalog),
      inactiveCatalog: n(extras?.inactive_catalog),
      recentAudit,
    }
  } catch (e) {
    console.error('[getSuperAdminOverview]', e)
    return fallback
  }
  })
}
