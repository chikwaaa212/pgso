'use server'

import prisma from '@/lib/prisma'
import { getPersonnelScope } from '@/lib/personnel-scope'
import {
  getInspectionsList,
  getInspectionsPage,
  getDeliveryForInspection,
  getInspectionHistory,
  getIarRecords,
  type UnifiedInspectionRow,
  type DeliveryForInspection,
  type InspectionHistoryRecord,
  type IarRecordRow,
} from '@/app/personnel/inspections/actions'
import { getDeliveryDetails, type DeliveryDetails } from '@/app/personnel/deliveries/actions'
import { getInventoryItems, getInventoryPage, type InventoryRow } from '@/app/personnel/inventory/actions'
import {
  getUnifiedAssetsPage,
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
  getIssuancesPage,
  type IssuanceDetail,
} from '@/app/personnel/issuances/actions'
import { getCompletedRequestIssues, getPublicIssues, type PublicIssueLine } from '@/app/personnel/issues/actions'
import { getRequests, type RequestRow } from '@/app/personnel/requests/actions'
import { getRepairs, getRepair, getRepairsPage, type RepairRow } from '@/app/personnel/repairs/actions'
import {
  getDeliveryDocumentsPage,
  getIarReportsPage,
  getViewedDocKeys,
  type DeliveryDocumentRow,
  type DocumentsTab,
  type IarReportRow,
} from '@/app/personnel/documents/actions'
import {
  type IssuanceRecordRow as IssuanceRow,
} from '@/app/personnel/issuances/actions'

/**
 * Read-only browse layer for Super Admin oversight. Every reader first
 * requires an active super_admin session and fails closed (empty / null)
 * otherwise. No function here mutates anything.
 */

async function allowed(): Promise<boolean> {
  // Uses the per-request cached personnel scope (same lookup `withScopedCache`
  // performs for the key) so a single browse call pays for one Auth + profile
  // lookup instead of two. Fails closed for non-super-admins.
  try {
    const scope = await getPersonnelScope()
    return scope.isSuperAdmin && !scope.isEmpty
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
  // Same caching as the personnel deliveries list (30s scoped — per-user
  // key so entries can't leak across accounts). Auth stays outside the
  // cache so failure fallbacks are never stored.
  const { withScopedCache } = await import('@/lib/personnel-cache')
  return withScopedCache('super-admin:deliveries-list', 30, async () => {
  try {
    // Lean select (list only renders these + item_count + logged_by) —
    // avoids shipping full delivery rows over the server-action boundary.
    const rows = await prisma.delivery.findMany({
      orderBy: { created_at: 'desc' },
      take: 500,
      select: {
        id: true,
        supplier: true,
        po_reference: true,
        date_delivered: true,
        delivery_status: true,
        inspection_status: true,
        received_by: true,
        _count: { select: { items: true } },
      },
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
  })
}

export async function browseDelivery(id: string): Promise<DeliveryDetails | null> {
  if (!(await allowed())) return null
  // Read-only oversight snapshot, cached per record like the personnel
  // detail snapshots (30s scoped). Auth stays outside the cache.
  const { withScopedCache } = await import('@/lib/personnel-cache')
  return withScopedCache('super-admin:delivery-detail', 30, async () => {
  try {
    return await getDeliveryDetails(id)
  } catch {
    return null
  }
  }, { id })
}

export async function browseInspections(): Promise<UnifiedInspectionRow[]> {
  if (!(await allowed())) return []
  // Same list caching as personnel inspections (30s scoped). Auth stays
  // outside the cache so failure fallbacks are never stored.
  const { withScopedCache } = await import('@/lib/personnel-cache')
  return withScopedCache('super-admin:inspections-list', 30, async () => {
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
  })
}

export interface BrowseInspectionDetail {
  delivery: DeliveryForInspection
  history: InspectionHistoryRecord[]
  iar: IarRecordRow[]
}

export async function browseInspection(deliveryId: string): Promise<BrowseInspectionDetail | null> {
  if (!(await allowed())) return null
  // Same per-record snapshot caching as browseDelivery above.
  const { withScopedCache } = await import('@/lib/personnel-cache')
  return withScopedCache('super-admin:inspection-detail', 30, async () => {
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
  }, { id: deliveryId })
}

export async function browseInventory(): Promise<InventoryRow[]> {
  if (!(await allowed())) return []
  // Shared stock pool — global (unscoped) key like the personnel
  // inventory-items cache, same 60s TTL. Auth stays outside the cache.
  const { withCache, cacheKey } = await import('@/lib/personnel-cache')
  return withCache(cacheKey('super-admin:inventory-list'), 60, async () => {
  try {
    return await getInventoryItems()
  } catch (e) {
    console.error('[browseInventory]', e)
    return []
  }
  })
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
  // Same caching as the personnel asset-categories list (300s global —
  // categories change rarely). Auth stays outside the cache.
  const { withCache, cacheKey } = await import('@/lib/personnel-cache')
  return withCache(cacheKey('super-admin:asset-categories'), 300, async () => {
  try {
    return await getCategories()
  } catch {
    return []
  }
  })
}

export async function browseIssuances(): Promise<BrowseIssuanceRow[]> {
  if (!(await allowed())) return []
  // Same list caching as personnel issuances (30s scoped — per-user key).
  // Auth stays outside the cache so failure fallbacks are never stored.
  const { withScopedCache } = await import('@/lib/personnel-cache')
  return withScopedCache('super-admin:issuances-list', 30, async () => {
  try {
    return await withIssuanceLoggers(await getIssuances())
  } catch (e) {
    console.error('[browseIssuances]', e)
    return []
  }
  })
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
  // Same list caching as personnel requests (30s scoped — per-user key).
  // Auth stays outside the cache so failure fallbacks are never stored.
  const { withScopedCache } = await import('@/lib/personnel-cache')
  return withScopedCache('super-admin:requests-list', 30, async () => {
  try {
    const rows = await getRequests()
    // Requests store the *requesting* employee; the session user who actually
    // filed it is captured in the audit log (request:create → reference_id).
    let filerByRequest = new Map<string, string>()
    try {
      // Bounded to 500 (was 5000): the cached list itself holds ≤500 rows, so
      // scanning 10x more audit rows only grew the payload without changing
      // the rendered table. Index (action, created_at) covers this filter.
      const audits = await prisma.auditLog.findMany({
        where: { action: 'request:create' },
        orderBy: { created_at: 'desc' },
        take: 500,
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
  })
}

/** Single request detail for read-only modals — rides the cached list. */
export async function browseRequest(id: string): Promise<BrowseRequestRow | null> {
  if (!(await allowed())) return null
  try {
    const rows = await browseRequests()
    return rows.find((r) => r.id === id) ?? null
  } catch {
    return null
  }
}

export async function browseRepairs(): Promise<RepairRow[]> {
  if (!(await allowed())) return []
  // Same list caching as personnel repairs (30s scoped — per-user key).
  // Auth stays outside the cache so failure fallbacks are never stored.
  const { withScopedCache } = await import('@/lib/personnel-cache')
  return withScopedCache('super-admin:repairs-list', 30, async () => {
  try {
    return await getRepairs()
  } catch (e) {
    console.error('[browseRepairs]', e)
    return []
  }
  })
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
    // Single round-trip (was 8 sequential/parallel round-trips): each COUNT
    // costs a full pooler RTT (~2s from far regions), so fan-out was the
    // dominant cost, not the COUNTs themselves (all indexed, ms-scale in DB).
    const rows = await prisma.$queryRaw<
      Array<{
        deliveries: bigint
        inspections: bigint
        stocks: bigint
        assets: bigint
        repairs: bigint
        iar_records: bigint
        par_docs: bigint
        ics_docs: bigint
      }>
    >`
      SELECT
        (SELECT COUNT(*) FROM deliveries)::bigint AS deliveries,
        (SELECT COUNT(*) FROM inspections)::bigint AS inspections,
        (SELECT COUNT(*) FROM inventory)::bigint AS stocks,
        (SELECT COUNT(*) FROM assets)::bigint AS assets,
        (SELECT COUNT(*) FROM repairs)::bigint AS repairs,
        (SELECT COUNT(*) FROM iar_records)::bigint AS iar_records,
        (SELECT COUNT(*) FROM issuance_records WHERE doc_type = 'PAR')::bigint AS par_docs,
        (SELECT COUNT(*) FROM issuance_records WHERE doc_type = 'ICS')::bigint AS ics_docs
    `.catch(() => null)
    if (!rows || rows.length === 0) return zeros
    const r = rows[0]
    return {
      deliveries: Number(r.deliveries ?? 0),
      inspections: Number(r.inspections ?? 0),
      stocks: Number(r.stocks ?? 0),
      assets: Number(r.assets ?? 0),
      repairs: Number(r.repairs ?? 0),
      iarRecords: Number(r.iar_records ?? 0),
      parDocs: Number(r.par_docs ?? 0),
      icsDocs: Number(r.ics_docs ?? 0),
    }
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

export type BrowseIarReportRow = IarReportRow & { logged_by: string | null }

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

// ─── Document-center per-tab windows (server pagination, PAGE_SIZE = 15) ────
// Replaces the old 8×500 full-list snapshot + client filter: each visit
// fetches ONE 15-row window for the ACTIVE tab (plus cached counts), with
// the same Browse* row shapes (logged_by preserved) the tables render.

export type AdminDocumentsTab = DocumentsTab;

export interface AdminDocumentsTabPage {
  rows: unknown[]
  data: unknown[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export async function getAdminDocumentsTabPage(
  tab: AdminDocumentsTab,
  opts: { page?: number; q?: string } = {}
): Promise<AdminDocumentsTabPage> {
  if (!(await allowed())) {
    return { rows: [], data: [], total: 0, page: 1, pageSize: 15, totalPages: 1 }
  }
  const { withScopedCache } = await import('@/lib/personnel-cache')
  const { PAGE_SIZE } = await import('@/lib/constants')
  const { parsePage, parseQuery, pageResponse } = await import('@/lib/paged')
  const page = parsePage(opts.page)
  const q = parseQuery(opts.q)
  const pageSize = PAGE_SIZE
  const envelope = <T>(rows: T[], total: number): AdminDocumentsTabPage => {
    const e = pageResponse(rows, total, page)
    return { rows: e.rows, data: e.data, total: e.total, page: e.page, pageSize: e.pageSize, totalPages: e.totalPages }
  }
  return withScopedCache('super-admin:documents-tab', 30, async () => {
    try {
      switch (tab) {
        case 'delivery': {
          const r = await getDeliveryDocumentsPage({ page, pageSize, q })
          const received = await prisma.delivery
            .findMany({
              where: { id: { in: r.rows.map((d) => d.delivery_id) } },
              select: { id: true, received_by: true },
            })
            .catch(() => [] as { id: string; received_by: string }[])
          const byId = new Map(received.map((d) => [d.id, d.received_by]))
          const names = await resolveProfileNames([...byId.values()])
          const rows: BrowseDeliveryDocumentRow[] = r.rows.map((d) => {
            const userId = byId.get(d.delivery_id)
            return { ...d, logged_by: (userId ? names.get(userId) : undefined) ?? null }
          })
          return envelope(rows, r.total)
        }
        case 'inspection': {
          const r = await getInspectionsPage({ page, pageSize, q, status: 'inspected' })
          const names = await resolveProfileNames(
            r.rows.map((d) => d.inspector_id).filter((v): v is string => Boolean(v))
          )
          const rows = r.rows
            .filter((d) => d.inspection_status !== 'pending')
            .map((d) => ({
              ...d,
              logged_by:
                (d.inspector_id ? names.get(d.inspector_id) : undefined) ??
                d.inspector_name ??
                null,
            }))
          return envelope(rows, r.total)
        }
        case 'stocks': {
          const r = await getInventoryPage({ page, pageSize, q })
          return envelope(r.rows, r.total)
        }
        case 'assets': {
          const r = await getUnifiedAssetsPage({ page, q, slim: true })
          return envelope(r.rows, r.total)
        }
        case 'repairs': {
          const r = await getRepairsPage({ page, pageSize, q, status: 'completed' })
          return envelope(r.rows, r.total)
        }
        case 'iar': {
          const r = await getIarReportsPage({ page, pageSize, q })
          const names = await resolveProfileNames(
            r.rows.map((d) => d.inspector_id).filter((v): v is string => Boolean(v))
          )
          const rows: BrowseIarReportRow[] = r.rows.map((d) => ({
            ...d,
            logged_by:
              (d.inspector_id ? names.get(d.inspector_id) : undefined) ??
              d.inspector_name ??
              null,
          }))
          return envelope(rows, r.total)
        }
        case 'par':
        case 'ics': {
          const r = await getIssuancesPage({
            page,
            pageSize,
            q,
            docType: tab === 'par' ? 'PAR' : 'ICS',
          })
          return envelope(await withIssuanceLoggers(r.rows), r.total)
        }
      }
    } catch (e) {
      console.error('[getAdminDocumentsTabPage]', e)
      return { rows: [], data: [], total: 0, page: 1, pageSize, totalPages: 1 }
    }
  }, { tab, page, pageSize, q })
}
