'use server'

import prisma from '@/lib/prisma'
import { getPersonnelScope } from '@/lib/personnel-scope'
import { VIEWED_DOC_TYPES } from './document-types'
import { getInspectionsList, type UnifiedInspectionRow } from '../inspections/actions'
import { getInventoryItems, type InventoryRow } from '../inventory/actions'
import { getAllUnifiedAssets, type UnifiedAssetRow } from '../assets/actions'
import { getRepairs, type RepairRow } from '../repairs/actions'
import { getParAndIcsReports, type IssuanceRecordRow } from '../issuances/actions'

// ─── Viewed receipts ─────────────────────────────────────────────────────────
// Tracks which document receipts each user opened so sidebar badges count
// only THEIR unviewed documents. Keys are `${doc_type}:${doc_id}` with
// doc_type in 'delivery' | 'inspection' | 'stock' | 'asset' | 'repair' |
// 'iar' | 'par' | 'ics'. Views are per-viewer: one role opening a receipt
// never clears the unread state another role sees.

export async function getViewedDocKeys(): Promise<string[]> {
  // Per-user read (raw SQL so no client regen is needed for viewer_id).
  // Signed-out callers see nothing as viewed.
  let viewer: string | null = null
  try {
    const scope = await getPersonnelScope()
    if (scope.isEmpty || !scope.userId) return []
    viewer = scope.userId
  } catch {
    return []
  }
  const { withScopedCache } = await import('@/lib/personnel-cache')
  return withScopedCache('personnel:viewed-doc-keys', 30, async () => {
    try {
      const rows = await prisma.$queryRaw<Array<{ doc_type: string; doc_id: string }>>`
        SELECT doc_type, doc_id::text AS doc_id FROM document_views WHERE viewer_id = ${viewer}::uuid`
      return rows.map((r) => `${r.doc_type}:${r.doc_id}`)
    } catch (e) {
      console.error('[getViewedDocKeys]', e)
      return []
    }
  })
}

export async function markDocumentViewed(
  docType: string,
  docId: string
): Promise<{ success?: boolean; error?: string }> {
  if (
    !(VIEWED_DOC_TYPES as readonly string[]).includes(docType) ||
    !docId?.trim()
  )
    return { error: 'Invalid document.' }
  let viewer: string | null = null
  try {
    const scope = await getPersonnelScope()
    if (scope.isEmpty || !scope.userId) return { error: 'You must be signed in.' }
    viewer = scope.userId
  } catch {
    return { error: 'You must be signed in.' }
  }
  try {
    // Per-viewer upsert (raw SQL so no client regen is needed for
    // viewer_id) — one role's view never touches another role's state.
    const { randomUUID } = await import('crypto')
    await prisma.$executeRaw`
      INSERT INTO document_views (id, doc_type, doc_id, viewer_id)
      VALUES (${randomUUID()}::uuid, ${docType}, ${docId}::uuid, ${viewer}::uuid)
      ON CONFLICT (doc_type, doc_id, viewer_id) DO NOTHING`
    const { bustCachePrefixes } = await import('@/lib/personnel-cache')
    // Viewing only affects badge counts — never wipe pools/snapshots.
    await bustCachePrefixes(['personnel:viewed-doc-keys', 'personnel:dashboard'])
    return { success: true }
  } catch (e) {
    console.error('[markDocumentViewed]', e)
    return { error: 'Failed to mark the document as viewed.' }
  }
}

// ─── Delivery receipts ──────────────────────────────────────────────────────

export interface DeliveryDocumentRow {
  delivery_id: string
  ref: string
  supplier: string | null
  po_reference: string | null
  date_delivered: string | null
  delivery_status: string | null
  inspection_status: string | null
  item_count: number
  created_at: string | null
}

/** Every logged delivery — the same receipt record shown on Deliveries. */
export async function getDeliveryDocuments(): Promise<DeliveryDocumentRow[]> {
  const { rows } = await getDeliveryDocumentsPage({ page: 1, pageSize: 500 })
  return rows
}

export interface DeliveryDocsPageOpts {
  page?: number
  pageSize?: number
  q?: string
}

export async function getDeliveryDocumentsPage(
  opts: DeliveryDocsPageOpts = {}
): Promise<{ rows: DeliveryDocumentRow[]; total: number }> {
  const { withScopedCache } = await import('@/lib/personnel-cache')
  const page = Math.floor(Number(opts.page)) >= 1 ? Math.min(Math.floor(Number(opts.page)), 1000) : 1
  const pageSize = 20
  const q = (opts.q ?? '').trim().slice(0, 120)
  return withScopedCache('personnel:delivery-documents', 30, async () => {
    try {
      const scope = await getPersonnelScope()
      if (scope.isEmpty) return { rows: [], total: 0 }
      const where: Record<string, unknown> = scope.isSuperAdmin ? {} : { received_by: scope.userId! }
      if (q) {
        ;(where as Record<string, unknown>).OR = [
          { supplier: { contains: q, mode: 'insensitive' } },
          { po_reference: { contains: q, mode: 'insensitive' } },
          { delivery_status: { contains: q, mode: 'insensitive' } },
          { inspection_status: { contains: q, mode: 'insensitive' } },
        ]
      }
      const [total, deliveries] = await Promise.all([
        prisma.delivery.count({ where: where as never }),
        prisma.delivery.findMany({
          where: where as never,
          orderBy: { created_at: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: {
            id: true,
            supplier: true,
            po_reference: true,
            date_delivered: true,
            delivery_status: true,
            inspection_status: true,
            created_at: true,
            _count: { select: { items: true } },
          },
        }),
      ])
      return {
        total,
        rows: deliveries.map((d) => ({
          delivery_id: d.id,
          ref: d.id.slice(0, 8).toUpperCase(),
          supplier: d.supplier,
          po_reference: d.po_reference,
          date_delivered: d.date_delivered?.toISOString().slice(0, 10) ?? null,
          delivery_status: d.delivery_status,
          inspection_status: d.inspection_status,
          item_count: d._count.items,
          created_at: d.created_at?.toISOString() ?? null,
        })),
      }
    } catch (e) {
      console.error('[getDeliveryDocuments]', e)
      return { rows: [], total: 0 }
    }
  }, { page, q })
}

// ─── IAR reports (all generated / attached documentation) ───────────────────

export interface IarReportRow {
  id: string
  kind: string // 'generated' | 'attached'
  iar_no: string | null
  iar_date: string | null
  delivery_id: string
  delivery_ref: string
  supplier: string | null
  po_reference: string | null
  inspector_id: string | null
  inspector_name: string | null
  inspection_result: string | null
  inspection_date: string | null
  created_at: string | null
}

export interface DocumentsSnapshot {
  deliveries: DeliveryDocumentRow[]
  inspections: UnifiedInspectionRow[]
  stocks: InventoryRow[]
  /** QR payloads blanked — the documents tables/receipts never render them. */
  assets: UnifiedAssetRow[]
  repairs: RepairRow[]
  iars: IarReportRow[]
  pars: IssuanceRecordRow[]
  icss: IssuanceRecordRow[]
  viewedKeys: string[]
}

/**
 * Single round-trip for the documents page (all 8 tabs + viewed keys),
 * cached client-side under CLIENT_CACHE_KEYS.documents like the
 * dashboard / deliveries / inspections / stocks / assets pages.
 */
export async function getDocumentsSnapshot(): Promise<DocumentsSnapshot> {
  const { withScopedCache } = await import('@/lib/personnel-cache')
  return withScopedCache('personnel:documents-snapshot', 30, async () => {
    // Single issuance round-trip for PAR+ICS (was two full downloads).
    const [d, i, s, a, rep, r, pc, v] = await Promise.all([
      getDeliveryDocuments(),
      getInspectionsList(),
      getInventoryItems(),
      getAllUnifiedAssets(),
      getRepairs(),
      getAllIarReports(),
      getParAndIcsReports(),
      getViewedDocKeys(),
    ])
    return {
      deliveries: d,
      inspections: i,
      stocks: s,
      assets: a.map((row) => ({ ...row, qr_data_url: '' })),
      repairs: rep,
      iars: r,
      pars: pc.pars,
      icss: pc.icss,
      viewedKeys: v,
    }
  })
}
export async function getAllIarReports(): Promise<IarReportRow[]> {
  const { rows } = await getIarReportsPage({ page: 1, pageSize: 500 })
  return rows
}

export type DocumentsTab =
  | 'delivery'
  | 'inspection'
  | 'stocks'
  | 'assets'
  | 'repairs'
  | 'iar'
  | 'par'
  | 'ics'

/**
 * Per-tab page window (fixed 20): only the ACTIVE tab fetches — the old
 * snapshot fired all 8 readers on every visit. Each tab reuses its list
 * page's server-paged reader; `total` drives the pager.
 */
export async function getDocumentsTabPage(
  tab: DocumentsTab,
  opts: { page?: number; q?: string } = {}
): Promise<{ rows: unknown[]; total: number }> {
  const page = Math.floor(Number(opts.page)) >= 1 ? Math.min(Math.floor(Number(opts.page)), 1000) : 1
  const q = (opts.q ?? '').trim().slice(0, 120)
  switch (tab) {
    case 'delivery': {
      return getDeliveryDocumentsPage({ page, q })
    }
    case 'inspection': {
      // Documents shows only inspected deliveries (history receipts exist).
      const { getInspectionsPage } = await import('../inspections/actions')
      return getInspectionsPage({ page, pageSize: 20, q, status: 'inspected' })
    }
    case 'stocks': {
      const { getInventoryPage } = await import('../inventory/actions')
      return getInventoryPage({ page, pageSize: 20, q })
    }
    case 'assets': {
      const { getUnifiedAssetsPage } = await import('../assets/actions')
      return getUnifiedAssetsPage({ page, q, slim: true })
    }
    case 'repairs': {
      // Documents shows completed repairs only (same as before).
      const { getRepairsPage } = await import('../repairs/actions')
      return getRepairsPage({ page, pageSize: 20, q, status: 'completed' })
    }
    case 'iar': {
      return getIarReportsPage({ page, q })
    }
    case 'par': {
      const { getIssuancesPage } = await import('../issuances/actions')
      const { rows, total } = await getIssuancesPage({ page, pageSize: 20, q, docType: 'PAR' })
      return { rows, total }
    }
    case 'ics': {
      const { getIssuancesPage } = await import('../issuances/actions')
      const { rows, total } = await getIssuancesPage({ page, pageSize: 20, q, docType: 'ICS' })
      return { rows, total }
    }
  }
}

/** Cheap per-tab totals for the header counts (no row payloads). */
export async function getDocumentsCounts(): Promise<Record<DocumentsTab, number>> {
  const { withScopedCache } = await import('@/lib/personnel-cache')
  return withScopedCache('personnel:documents-counts', 60, async () => {
    const zeros: Record<DocumentsTab, number> = {
      delivery: 0, inspection: 0, stocks: 0, assets: 0,
      repairs: 0, iar: 0, par: 0, ics: 0,
    }
    try {
      const scope = await getPersonnelScope()
      if (scope.isEmpty || !scope.userId) return zeros
      const me = scope.userId
      const all = scope.isSuperAdmin
      const [delivery, inspection, stocks, assets, repairs, iars, pars, icss] =
        await Promise.all([
          prisma.delivery.count({ where: all ? {} : { received_by: me } }),
          prisma.delivery.count({
            where: all
              ? {}
              : { OR: [{ received_by: me }, { inspections: { some: { inspector_id: me } } }] },
          }),
          prisma.inventoryItem.count().catch(() => 0),
          prisma.asset.count().catch(() => 0),
          (async () => {
            try {
              const r = all
                ? await prisma.$queryRaw<Array<{ count: bigint }>>`
                    SELECT COUNT(*)::bigint AS count FROM repairs WHERE status = 'completed'`
                : await prisma.$queryRaw<Array<{ count: bigint }>>`
                    SELECT COUNT(*)::bigint AS count FROM repairs
                    WHERE status = 'completed' AND created_by = ${me}::uuid`
              return Number(r[0]?.count ?? 0)
            } catch {
              return 0
            }
          })(),
          prisma.iarRecord
            .count({
              where: all
                ? {}
                : {
                    delivery: {
                      OR: [
                        { received_by: me },
                        { inspections: { some: { inspector_id: me } } },
                      ],
                    },
                  },
            })
            .catch(() => 0),
          (async () => {
            try {
              const r = all
                ? await prisma.$queryRaw<Array<{ count: bigint }>>`
                    SELECT COUNT(*)::bigint AS count FROM issuance_records WHERE doc_type = 'PAR'`
                : await prisma.$queryRaw<Array<{ count: bigint }>>`
                    SELECT COUNT(*)::bigint AS count FROM issuance_records
                    WHERE doc_type = 'PAR' AND created_by = ${me}::uuid`
              return Number(r[0]?.count ?? 0)
            } catch {
              return 0
            }
          })(),
          (async () => {
            try {
              const r = all
                ? await prisma.$queryRaw<Array<{ count: bigint }>>`
                    SELECT COUNT(*)::bigint AS count FROM issuance_records WHERE doc_type = 'ICS'`
                : await prisma.$queryRaw<Array<{ count: bigint }>>`
                    SELECT COUNT(*)::bigint AS count FROM issuance_records
                    WHERE doc_type = 'ICS' AND created_by = ${me}::uuid`
              return Number(r[0]?.count ?? 0)
            } catch {
              return 0
            }
          })(),
        ])
      return {
        delivery,
        inspection,
        stocks,
        assets: assets + stocks,
        repairs,
        iar: iars,
        par: pars,
        ics: icss,
      }
    } catch (e) {
      console.error('[getDocumentsCounts]', e)
      return zeros
    }
  })
}

export interface IarReportsPageOpts {
  page?: number
  pageSize?: number
  q?: string
}

export async function getIarReportsPage(
  opts: IarReportsPageOpts = {}
): Promise<{ rows: IarReportRow[]; total: number }> {
  const { withScopedCache } = await import('@/lib/personnel-cache')
  const page = Math.floor(Number(opts.page)) >= 1 ? Math.min(Math.floor(Number(opts.page)), 1000) : 1
  const pageSize = 20
  const q = (opts.q ?? '').trim().slice(0, 120)
  return withScopedCache('personnel:iar-reports', 30, async () => {
  try {
    // Own-data only for personnel; super_admin sees all.
    const scope = await getPersonnelScope()
    if (scope.isEmpty) return { rows: [], total: 0 }
    const baseWhere = scope.isSuperAdmin
      ? {}
      : {
          delivery: {
            OR: [
              { received_by: scope.userId! },
              { inspections: { some: { inspector_id: scope.userId! } } },
            ],
          },
        }
    const where = q
      ? {
          AND: [
            baseWhere,
            {
              OR: [
                { iar_no: { contains: q, mode: 'insensitive' } },
                { kind: { contains: q, mode: 'insensitive' } },
                { delivery: { supplier: { contains: q, mode: 'insensitive' } } },
                { delivery: { po_reference: { contains: q, mode: 'insensitive' } } },
                { inspection: { inspector_name: { contains: q, mode: 'insensitive' } } },
                // Exact: each IAR row belongs to one inspection.
                { inspection: { result: { contains: q, mode: 'insensitive' } } },
              ],
            },
          ],
        }
      : baseWhere
    const include = {
      delivery: {
        select: { id: true, supplier: true, po_reference: true },
      },
      inspection: {
        select: {
          result: true,
          inspection_date: true,
          inspector_id: true,
          inspector_name: true,
        },
      },
    } as const
    const [total, rows] = await Promise.all([
      prisma.iarRecord.count({ where: where as never }),
      prisma.iarRecord.findMany({
        where: where as never,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include,
      }),
    ])

    return {
      total,
      rows: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        iar_no: r.iar_no,
        iar_date: r.iar_date?.toISOString().slice(0, 10) ?? null,
        delivery_id: r.delivery_id,
        delivery_ref: r.delivery.id.slice(0, 8).toUpperCase(),
        supplier: r.delivery.supplier,
        po_reference: r.delivery.po_reference,
        inspector_id: r.inspection.inspector_id,
        inspector_name: r.inspection.inspector_name,
        inspection_result: r.inspection.result,
        inspection_date: r.inspection.inspection_date.toISOString().slice(0, 10),
        created_at: r.created_at?.toISOString() ?? null,
      })),
    }
  } catch (e) {
    console.error('[getAllIarReports]', e)
    return { rows: [], total: 0 }
  }
  }, { page, q })
}
