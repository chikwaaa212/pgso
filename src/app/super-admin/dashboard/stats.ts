'use server'

import prisma from '@/lib/prisma'
import { requireSuperAdmin } from '@/lib/auth-guard'
import {
  getOperationsStats,
  type OperationsStats,
} from '@/app/personnel/dashboard/actions'

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
  try {
    const [
      ops,
      pendingAccounts,
      totalPersonnel,
      totalEmployees,
      activeUnits,
      activeCatalog,
      inactiveCatalog,
      auditRows,
    ] = await Promise.all([
      getOperationsStats(),
      prisma.profile.count({ where: { role: 'employee', status: 'pending' } }).catch(() => 0),
      prisma.profile.count({ where: { role: 'pgso_personnel' } }).catch(() => 0),
      prisma.profile.count({ where: { role: 'employee' } }).catch(() => 0),
      prisma.unit.count({ where: { status: 'active' } }).catch(() => 0),
      prisma.accountCatalog.count({ where: { status: 'active' } }).catch(() => 0),
      prisma.accountCatalog.count({ where: { status: 'inactive' } }).catch(() => 0),
      prisma.auditLog
        .findMany({
          orderBy: { created_at: 'desc' },
          take: 5,
          select: { id: true, user_id: true, action: true, module: true, details: true, created_at: true },
        })
        .catch(() => [] as { id: string; user_id: string; action: string; module: string; details: unknown; created_at: Date | null }[]),
    ])

    let recentAudit: RecentAuditEntry[] = []
    if (auditRows.length > 0) {
      const ids = [...new Set(auditRows.map((r) => r.user_id))]
      const profiles = await prisma.profile
        .findMany({ where: { id: { in: ids } }, select: { id: true, full_name: true } })
        .catch(() => [] as { id: string; full_name: string | null }[])
      const names = new Map(profiles.map((p) => [p.id, p.full_name ?? 'Unknown']))
      recentAudit = auditRows.map((r) => {
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
          user_name: names.get(r.user_id) ?? 'Unknown',
          created_at: r.created_at?.toISOString() ?? null,
        }
      })
    }

    return {
      ops,
      pendingAccounts,
      totalPersonnel,
      totalEmployees,
      activeUnits,
      activeCatalog,
      inactiveCatalog,
      recentAudit,
    }
  } catch (e) {
    console.error('[getSuperAdminOverview]', e)
    return fallback
  }
}
