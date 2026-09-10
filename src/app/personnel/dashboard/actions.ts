'use server'

import prisma from '@/lib/prisma'

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

async function countIssuances(): Promise<number> {
  try {
    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM issuance_records`
    return Number(rows[0]?.count ?? 0)
  } catch {
    return 0
  }
}

export async function getOperationsStats(): Promise<OperationsStats> {
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
    const [
      totalDeliveries,
      pendingInspections,
      completedInspections,
      totalItems,
      pendingRequests,
      pendingRepairs,
      inProgressRepairs,
      totalAssets,
      totalStockSkus,
      totalIssuances,
      stocks,
    ] = await Promise.all([
      prisma.delivery.count(),
      prisma.delivery.count({ where: { inspection_status: 'pending' } }),
      prisma.inspection.count(),
      prisma.deliveryItem.count(),
      prisma.request.count({ where: { status: 'pending' } }),
      prisma.repair.count({ where: { status: 'pending' } }),
      prisma.repair.count({ where: { status: 'in_progress' } }),
      prisma.asset.count().catch(() => 0),
      prisma.inventoryItem.count().catch(() => 0),
      countIssuances(),
      prisma.inventoryItem
        .findMany({ select: { quantity: true, reorder_threshold: true } })
        .catch(() => [] as { quantity: number; reorder_threshold: number | null }[]),
    ])

    let low = 0
    let out = 0
    for (const s of stocks) {
      if (s.quantity <= 0) {
        out += 1
      } else if (s.reorder_threshold != null && s.quantity <= s.reorder_threshold) {
        low += 1
      }
    }

    // Reuse the same "unviewed documents" notion as the sidebar badge so the
    // dashboard card and the nav stay in sync.
    let totalDocuments = 0
    try {
      const { getDashboardStats } = await import('../inspections/actions')
      totalDocuments = (await getDashboardStats()).totalDocuments
    } catch {
      totalDocuments = 0
    }

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
}

// ─── Recent requests ────────────────────────────────────────────────────────

export interface RecentRequestRow {
  id: string
  request_type: string
  status: string | null
  employee_name: string
  date_requested: string | null
}

export async function getRecentRequests(limit = 5): Promise<RecentRequestRow[]> {
  try {
    const rows = await prisma.request.findMany({
      orderBy: { date_requested: 'desc' },
      take: limit,
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

export async function getRecentRepairs(limit = 5): Promise<RecentRepairRow[]> {
  try {
    const rows = await prisma.repair.findMany({
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
      repair_date: r.repair_date.toISOString().slice(0, 10),
    }))
  } catch (e) {
    console.error('[getRecentRepairs]', e)
    return []
  }
}

// ─── Recent PAR / ICS issuances ─────────────────────────────────────────────

export interface RecentIssuanceRow {
  id: string
  doc_type: string
  doc_no: string | null
  employee_name: string
  created_at: string | null
}

export async function getRecentIssuances(limit = 5): Promise<RecentIssuanceRow[]> {
  try {
    const rows = await prisma.$queryRaw<
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
}
