'use server'

import prisma from '@/lib/prisma'
import { requireSuperAdmin } from '@/lib/auth-guard'
import {
  getInspectionsList,
  getDeliveryForInspection,
  getInspectionHistory,
  getIarRecords,
  type UnifiedInspectionRow,
  type DeliveryForInspection,
  type InspectionHistoryRecord,
  type IarRecordRow,
} from '@/app/personnel/inspections/actions'
import { getDeliveryDetails, type DeliveryDetails } from '@/app/personnel/deliveries/actions'
import { getInventoryItems, type InventoryRow } from '@/app/personnel/inventory/actions'
import {
  getAllUnifiedAssets,
  getUnifiedAsset,
  getAsset,
  getStock,
  getCategories,
  getAssetHistory,
  type UnifiedAssetRow,
  type AssetRow,
  type StockRow,
  type AssetHistory,
} from '@/app/personnel/assets/actions'
import {
  getIssuances,
  getIssuance,
  type IssuanceRecordRow,
  type IssuanceDetail,
} from '@/app/personnel/issuances/actions'
import { getCompletedRequestIssues, getPublicIssues, type PublicIssueLine } from '@/app/personnel/issues/actions'
import { getRequests, type RequestRow } from '@/app/personnel/requests/actions'
import { getRepairs, getRepair, type RepairRow } from '@/app/personnel/repairs/actions'
import {
  getDeliveryDocuments,
  getAllIarReports,
  getViewedDocKeys,
  type DeliveryDocumentRow,
  type IarReportRow,
} from '@/app/personnel/documents/actions'
import {
  getParReports,
  getIcsReports,
  type IssuanceRecordRow as IssuanceRow,
} from '@/app/personnel/issuances/actions'

/**
 * Read-only browse layer for Super Admin oversight. Every reader first
 * requires an active super_admin session and fails closed (empty / null)
 * otherwise. No function here mutates anything.
 */

async function allowed(): Promise<boolean> {
  try {
    await requireSuperAdmin()
    return true
  } catch {
    return false
  }
}

export interface BrowseDeliveryRow {
  id: string
  ref: string
  supplier: string | null
  po_reference: string | null
  date_delivered: string | null
  delivery_status: string | null
  inspection_status: string | null
  item_count: number
  logged_by: string | null
}

export async function browseDeliveries(): Promise<BrowseDeliveryRow[]> {
  if (!(await allowed())) return []
  try {
    const rows = await prisma.delivery.findMany({
      orderBy: { created_at: 'desc' },
      take: 500,
      include: { _count: { select: { items: true } } },
    })
    const ids = [...new Set(rows.map((d) => d.received_by).filter(Boolean))] as string[]
    let names = new Map<string, string>()
    try {
      if (ids.length > 0) {
        const profiles = await prisma.profile.findMany({
          where: { id: { in: ids } },
          select: { id: true, full_name: true },
        })
        names = new Map(profiles.map((p) => [p.id, p.full_name ?? 'Unknown']))
      }
    } catch {
      names = new Map()
    }
    return rows.map((d) => ({
      id: d.id,
      ref: d.id.slice(0, 8).toUpperCase(),
      supplier: d.supplier,
      po_reference: d.po_reference,
      date_delivered: d.date_delivered?.toISOString().slice(0, 10) ?? null,
      delivery_status: d.delivery_status,
      inspection_status: d.inspection_status,
      item_count: d._count.items,
      logged_by: names.get(d.received_by) ?? null,
    }))
  } catch (e) {
    console.error('[browseDeliveries]', e)
    return []
  }
}

export async function browseDelivery(id: string): Promise<DeliveryDetails | null> {
  if (!(await allowed())) return null
  try {
    return await getDeliveryDetails(id)
  } catch {
    return null
  }
}

export async function browseInspections(): Promise<UnifiedInspectionRow[]> {
  if (!(await allowed())) return []
  try {
    const rows = await getInspectionsList()
    // Resolve the system user who logged each inspection (same as deliveries' "Logged By").
    const ids = [...new Set(rows.map((r) => r.inspector_id).filter((v): v is string => Boolean(v)))]
    let names = new Map<string, string>()
    try {
      if (ids.length > 0) {
        const profiles = await prisma.profile.findMany({
          where: { id: { in: ids } },
          select: { id: true, full_name: true },
        })
        names = new Map(profiles.map((p) => [p.id, p.full_name ?? 'Unknown']))
      }
    } catch {
      names = new Map()
    }
    return rows.map((r) => ({
      ...r,
      logged_by: (r.inspector_id ? names.get(r.inspector_id) : undefined) ?? r.inspector_name ?? null,
    }))
  } catch (e) {
    console.error('[browseInspections]', e)
    return []
  }
}

export interface BrowseInspectionDetail {
  delivery: DeliveryForInspection
  history: InspectionHistoryRecord[]
  iar: IarRecordRow[]
}

export async function browseInspection(deliveryId: string): Promise<BrowseInspectionDetail | null> {
  if (!(await allowed())) return null
  try {
    const [delivery, history, iar] = await Promise.all([
      getDeliveryForInspection(deliveryId),
      getInspectionHistory(deliveryId),
      getIarRecords(deliveryId),
    ])
    return { delivery, history, iar }
  } catch {
    return null
  }
}

export async function browseInventory(): Promise<InventoryRow[]> {
  if (!(await allowed())) return []
  try {
    return await getInventoryItems()
  } catch (e) {
    console.error('[browseInventory]', e)
    return []
  }
}

export async function browseAssets(): Promise<UnifiedAssetRow[]> {
  if (!(await allowed())) return []
  try {
    return await getAllUnifiedAssets()
  } catch (e) {
    console.error('[browseAssets]', e)
    return []
  }
}

export async function browseAsset(id: string): Promise<UnifiedAssetRow | null> {
  if (!(await allowed())) return null
  try {
    return await getUnifiedAsset(id)
  } catch {
    return null
  }
}

export async function browseAssetHistory(id: string): Promise<AssetHistory> {
  if (!(await allowed()))
    return { assignedToName: null, repairs: [], issuances: [], requests: [] }
  try {
    return await getAssetHistory(id)
  } catch {
    return { assignedToName: null, repairs: [], issuances: [], requests: [] }
  }
}

export async function browseAssetRaw(id: string): Promise<AssetRow | null> {
  if (!(await allowed())) return null
  try {
    return await getAsset(id)
  } catch {
    return null
  }
}

export async function browseStock(id: string): Promise<StockRow | null> {
  if (!(await allowed())) return null
  try {
    return await getStock(id)
  } catch {
    return null
  }
}

export async function browseCategories(): Promise<string[]> {
  if (!(await allowed())) return []
  try {
    return await getCategories()
  } catch {
    return []
  }
}

export async function browseIssuances(): Promise<BrowseIssuanceRow[]> {
  if (!(await allowed())) return []
  try {
    return await withIssuanceLoggers(await getIssuances())
  } catch (e) {
    console.error('[browseIssuances]', e)
    return []
  }
}

export async function browseIssuance(id: string): Promise<IssuanceDetail | null> {
  if (!(await allowed())) return null
  try {
    return await getIssuance(id)
  } catch {
    return null
  }
}

export async function browseIssues(): Promise<PublicIssueLine[]> {
  if (!(await allowed())) return []
  try {
    return await getPublicIssues()
  } catch (e) {
    console.error('[browseIssues]', e)
    return []
  }
}

/** All completed requests (every type, asset or stock) — admin QR oversight. */
export async function browseCompletedRequests(): Promise<RequestRow[]> {
  if (!(await allowed())) return []
  try {
    return await getCompletedRequestIssues()
  } catch (e) {
    console.error('[browseCompletedRequests]', e)
    return []
  }
}

export type BrowseRequestRow = RequestRow & { logged_by: string | null }

export async function browseRequests(): Promise<BrowseRequestRow[]> {
  if (!(await allowed())) return []
  try {
    const rows = await getRequests()
    // Requests store the *requesting* employee; the session user who actually
    // filed it is captured in the audit log (request:create → reference_id).
    let filerByRequest = new Map<string, string>()
    try {
      // Bounded: audit_logs grows without bound; latest 5k covers years of filings.
      const audits = await prisma.auditLog.findMany({
        where: { action: 'request:create' },
        orderBy: { created_at: 'desc' },
        take: 5000,
        select: { user_id: true, details: true },
      })
      for (const a of audits) {
        const ref = (a.details as { reference_id?: unknown } | null)?.reference_id
        if (typeof ref === 'string' && ref) filerByRequest.set(ref, a.user_id)
      }
    } catch {
      filerByRequest = new Map()
    }
    const names = await resolveProfileNames([...filerByRequest.values()])
    return rows.map((r) => {
      const filerId = filerByRequest.get(r.id)
      return {
        ...r,
        logged_by: (filerId ? names.get(filerId) : undefined) ?? null,
      }
    })
  } catch (e) {
    console.error('[browseRequests]', e)
    return []
  }
}

export async function browseRepairs(): Promise<RepairRow[]> {
  if (!(await allowed())) return []
  try {
    return await getRepairs()
  } catch (e) {
    console.error('[browseRepairs]', e)
    return []
  }
}

export async function browseRepair(id: string): Promise<RepairRow | null> {
  if (!(await allowed())) return null
  try {
    return await getRepair(id)
  } catch {
    return null
  }
}

export interface DocumentHubCounts {
  deliveries: number
  inspections: number
  stocks: number
  assets: number
  repairs: number
  iarRecords: number
  parDocs: number
  icsDocs: number
}

export async function browseDocumentHub(): Promise<DocumentHubCounts> {
  const zeros: DocumentHubCounts = {
    deliveries: 0,
    inspections: 0,
    stocks: 0,
    assets: 0,
    repairs: 0,
    iarRecords: 0,
    parDocs: 0,
    icsDocs: 0,
  }
  if (!(await allowed())) return zeros
  try {
    const [deliveries, inspections, stocks, assets, repairs, iarRecords, parDocs, icsDocs] =
      await Promise.all([
        prisma.delivery.count().catch(() => 0),
        prisma.inspection.count().catch(() => 0),
        prisma.inventoryItem.count().catch(() => 0),
        prisma.asset.count().catch(() => 0),
        prisma.repair.count().catch(() => 0),
        prisma.iarRecord.count().catch(() => 0),
        prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM issuance_records WHERE doc_type = 'PAR'`
          .then((r) => Number(r[0]?.count ?? 0))
          .catch(() => 0),
        prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM issuance_records WHERE doc_type = 'ICS'`
          .then((r) => Number(r[0]?.count ?? 0))
          .catch(() => 0),
      ])
    return { deliveries, inspections, stocks, assets, repairs, iarRecords, parDocs, icsDocs }
  } catch (e) {
    console.error('[browseDocumentHub]', e)
    return zeros
  }
}

// ─── Document-center lists (entire personnel pool, read-only) ────────────────

/** Batch-resolves profile IDs to display names (best-effort, never throws). */
async function resolveProfileNames(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return new Map()
  try {
    const profiles = await prisma.profile.findMany({
      where: { id: { in: unique } },
      select: { id: true, full_name: true },
    })
    return new Map(profiles.map((p) => [p.id, p.full_name ?? 'Unknown']))
  } catch {
    return new Map()
  }
}

export type BrowseDeliveryDocumentRow = DeliveryDocumentRow & {
  logged_by: string | null
}

export async function browseDeliveryDocuments(): Promise<BrowseDeliveryDocumentRow[]> {
  if (!(await allowed())) return []
  try {
    const rows = await getDeliveryDocuments()
    const deliveries = await prisma.delivery
      .findMany({
        where: { id: { in: rows.map((r) => r.delivery_id) } },
        select: { id: true, received_by: true },
      })
      .catch(() => [] as { id: string; received_by: string }[])
    const byId = new Map(deliveries.map((d) => [d.id, d.received_by]))
    const names = await resolveProfileNames([...byId.values()])
    return rows.map((r) => {
      const userId = byId.get(r.delivery_id)
      return {
        ...r,
        logged_by: (userId ? names.get(userId) : undefined) ?? null,
      }
    })
  } catch (e) {
    console.error('[browseDeliveryDocuments]', e)
    return []
  }
}

export type BrowseIarReportRow = IarReportRow & { logged_by: string | null }

export async function browseIarReports(): Promise<BrowseIarReportRow[]> {
  if (!(await allowed())) return []
  try {
    const rows = await getAllIarReports()
    const names = await resolveProfileNames(
      rows.map((r) => r.inspector_id).filter((v): v is string => Boolean(v))
    )
    return rows.map((r) => ({
      ...r,
      logged_by:
        (r.inspector_id ? names.get(r.inspector_id) : undefined) ??
        r.inspector_name ??
        null,
    }))
  } catch (e) {
    console.error('[browseIarReports]', e)
    return []
  }
}

export type BrowseIssuanceRow = IssuanceRow & { logged_by: string | null }

async function withIssuanceLoggers(rows: IssuanceRow[]): Promise<BrowseIssuanceRow[]> {
  const names = await resolveProfileNames(
    rows.map((r) => r.created_by).filter((v): v is string => Boolean(v))
  )
  return rows.map((r) => ({
    ...r,
    logged_by: (r.created_by ? names.get(r.created_by) : undefined) ?? null,
  }))
}

export async function browseParReports(): Promise<BrowseIssuanceRow[]> {
  if (!(await allowed())) return []
  try {
    return await withIssuanceLoggers(await getParReports())
  } catch (e) {
    console.error('[browseParReports]', e)
    return []
  }
}

export async function browseIcsReports(): Promise<BrowseIssuanceRow[]> {
  if (!(await allowed())) return []
  try {
    return await withIssuanceLoggers(await getIcsReports())
  } catch (e) {
    console.error('[browseIcsReports]', e)
    return []
  }
}

export async function browseDeliveryForInspection(
  deliveryId: string
): Promise<DeliveryForInspection | null> {
  if (!(await allowed())) return null
  try {
    return await getDeliveryForInspection(deliveryId)
  } catch {
    return null
  }
}

export async function browseInspectionHistory(
  deliveryId: string
): Promise<InspectionHistoryRecord[]> {
  if (!(await allowed())) return []
  try {
    return await getInspectionHistory(deliveryId)
  } catch {
    return []
  }
}

export async function browseIarRecords(
  deliveryId: string
): Promise<IarRecordRow[]> {
  if (!(await allowed())) return []
  try {
    return await getIarRecords(deliveryId)
  } catch {
    return []
  }
}

/** Read-only view of which docs have been opened (admin never marks). */
export async function browseViewedDocKeys(): Promise<string[]> {
  if (!(await allowed())) return []
  try {
    return await getViewedDocKeys()
  } catch {
    return []
  }
}
