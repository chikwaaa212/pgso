'use server'

import prisma from '@/lib/prisma'
import { getPersonnelScope } from '@/lib/personnel-scope'
import { VIEWED_DOC_TYPES } from './document-types'

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

export interface DeliveryDocsPageOpts {
  page?: number
  pageSize?: number
  q?: string
}

export async function getDeliveryDocumentsPage(
  opts: DeliveryDocsPageOpts = {}
): Promise<{ rows: DeliveryDocumentRow[]; data: DeliveryDocumentRow[]; total: number; page: number; pageSize: number; totalPages: number }> {
  const { withScopedCache } = await import('@/lib/personnel-cache')
  const { PAGE_SIZE } = await import('@/lib/constants')
  const { parsePage, parseQuery, clampPage, totalPagesFor } = await import('@/lib/paged')
  const page = parsePage(opts.page)
  const rawSize = Math.floor(Number(opts.pageSize))
  const pageSize = Number.isFinite(rawSize) ? Math.min(Math.max(rawSize, 1), 100) : PAGE_SIZE
  const q = parseQuery(opts.q)
  return withScopedCache('personnel:delivery-documents', 30, async () => {
    try {
      const scope = await getPersonnelScope()
      if (scope.isEmpty) return { rows: [], data: [], total: 0, page: 1, pageSize, totalPages: 1 }
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
      const safePage = clampPage(page, Math.max(1, total))
      const mapped = deliveries.map((d) => ({
          delivery_id: d.id,
          ref: d.id.slice(0, 8).toUpperCase(),
          supplier: d.supplier,
          po_reference: d.po_reference,
          date_delivered: d.date_delivered?.toISOString().slice(0, 10) ?? null,
          delivery_status: d.delivery_status,
          inspection_status: d.inspection_status,
          item_count: d._count.items,
          created_at: d.created_at?.toISOString() ?? null,
        }))
      return {
        total,
        rows: mapped,
        data: mapped,
        page: safePage,
        pageSize,
        totalPages: totalPagesFor(total, pageSize),
      }
    } catch (e) {
      console.error('[getDeliveryDocuments]', e)
      return { rows: [], data: [], total: 0, page: 1, pageSize, totalPages: 1 }
    }
  }, { page, pageSize, q })
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
 * Per-tab page window (PAGE_SIZE = 15): only the ACTIVE tab fetches.
 * Each tab reuses its list page's server-paged reader; `total` drives the pager.
 */
export async function getDocumentsTabPage(
  tab: DocumentsTab,
  opts: { page?: number; q?: string } = {}
): Promise<{ rows: unknown[]; data: unknown[]; total: number; page: number; pageSize: number; totalPages: number }> {
  const { parsePage, parseQuery } = await import('@/lib/paged')
  const { PAGE_SIZE } = await import('@/lib/constants')
  const page = parsePage(opts.page)
  const q = parseQuery(opts.q)
  const passthrough = (r: { rows: unknown[]; total: number; page?: number; totalPages?: number }) => ({
    rows: r.rows,
    data: (r as { data?: unknown[] }).data ?? r.rows,
    total: r.total,
    page: r.page ?? page,
    pageSize: PAGE_SIZE,
    totalPages: r.totalPages ?? Math.max(1, Math.ceil(r.total / PAGE_SIZE)),
  })
  switch (tab) {
    case 'delivery': {
      return getDeliveryDocumentsPage({ page, q })
    }
    case 'inspection': {
      // Documents shows only inspected deliveries (history receipts exist).
      const { getInspectionsPage } = await import('../inspections/actions')
      return passthrough(await getInspectionsPage({ page, pageSize: PAGE_SIZE, q, status: 'inspected' }))
    }
    case 'stocks': {
      const { getInventoryPage } = await import('../inventory/actions')
      return passthrough(await getInventoryPage({ page, pageSize: PAGE_SIZE, q }))
    }
    case 'assets': {
      const { getUnifiedAssetsPage } = await import('../assets/actions')
      return getUnifiedAssetsPage({ page, q, slim: true })
    }
    case 'repairs': {
      // Documents shows completed repairs only (same as before).
      const { getRepairsPage } = await import('../repairs/actions')
      return passthrough(await getRepairsPage({ page, pageSize: PAGE_SIZE, q, status: 'completed' }))
    }
    case 'iar': {
      return getIarReportsPage({ page, q })
    }
    case 'par': {
      const { getIssuancesPage } = await import('../issuances/actions')
      const r = await getIssuancesPage({ page, pageSize: PAGE_SIZE, q, docType: 'PAR' })
      return passthrough(r)
    }
    case 'ics': {
      const { getIssuancesPage } = await import('../issuances/actions')
      const r = await getIssuancesPage({ page, pageSize: PAGE_SIZE, q, docType: 'ICS' })
      return passthrough(r)
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
): Promise<{ rows: IarReportRow[]; data: IarReportRow[]; total: number; page: number; pageSize: number; totalPages: number }> {
  const { withScopedCache } = await import('@/lib/personnel-cache')
  const { PAGE_SIZE } = await import('@/lib/constants')
  const { parsePage, parseQuery, clampPage, totalPagesFor } = await import('@/lib/paged')
  const page = parsePage(opts.page)
  const rawSize = Math.floor(Number(opts.pageSize))
  const pageSize = Number.isFinite(rawSize) ? Math.min(Math.max(rawSize, 1), 100) : PAGE_SIZE
  const q = parseQuery(opts.q)
  return withScopedCache('personnel:iar-reports', 30, async () => {
  try {
    // Own-data only for personnel; super_admin sees all.
    const scope = await getPersonnelScope()
    if (scope.isEmpty) return { rows: [], data: [], total: 0, page: 1, pageSize, totalPages: 1 }
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

    const mapped = rows.map((r) => ({
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
      }))
    const safePage = clampPage(page, Math.max(1, total))
    return {
      total,
      rows: mapped,
      data: mapped,
      page: safePage,
      pageSize,
      totalPages: totalPagesFor(total, pageSize),
    }
  } catch (e) {
    console.error('[getAllIarReports]', e)
    return { rows: [], data: [], total: 0, page: 1, pageSize, totalPages: 1 }
  }
  }, { page, pageSize, q })
}
