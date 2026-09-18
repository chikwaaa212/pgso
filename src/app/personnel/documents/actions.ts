'use server'

import prisma from '@/lib/prisma'
import { getPersonnelScope } from '@/lib/personnel-scope'
import { VIEWED_DOC_TYPES } from './document-types'
import { getInspectionsList, type UnifiedInspectionRow } from '../inspections/actions'
import { getInventoryItems, type InventoryRow } from '../inventory/actions'
import { getAllUnifiedAssets, type UnifiedAssetRow } from '../assets/actions'
import { getRepairs, type RepairRow } from '../repairs/actions'
import { getParReports, getIcsReports, type IssuanceRecordRow } from '../issuances/actions'

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
    const { bustPersonnelCache } = await import('@/lib/personnel-cache')
    await bustPersonnelCache()
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
  const { withScopedCache } = await import('@/lib/personnel-cache')
  return withScopedCache('personnel:delivery-documents', 30, async () => {
  try {
    // Own-data only for personnel; super_admin sees all.
    const scope = await getPersonnelScope()
    if (scope.isEmpty) return []
    const deliveries = await prisma.delivery.findMany({
      where: scope.isSuperAdmin ? {} : { received_by: scope.userId! },
      orderBy: { created_at: 'desc' },
      include: { _count: { select: { items: true } } },
    })

    return deliveries.map((d) => ({
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
  } catch (e) {
    console.error('[getDeliveryDocuments]', e)
    return []
  }
  })
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
  const [d, i, s, a, rep, r, p, c, v] = await Promise.all([
    getDeliveryDocuments(),
    getInspectionsList(),
    getInventoryItems(),
    getAllUnifiedAssets(),
    getRepairs(),
    getAllIarReports(),
    getParReports(),
    getIcsReports(),
    getViewedDocKeys(),
  ])
  return {
    deliveries: d,
    inspections: i,
    stocks: s,
    assets: a.map((row) => ({ ...row, qr_data_url: '' })),
    repairs: rep,
    iars: r,
    pars: p,
    icss: c,
    viewedKeys: v,
  }
}
export async function getAllIarReports(): Promise<IarReportRow[]> {
  const { withScopedCache } = await import('@/lib/personnel-cache')
  return withScopedCache('personnel:iar-reports', 30, async () => {
  try {
    // Own-data only for personnel; super_admin sees all.
    const scope = await getPersonnelScope()
    if (scope.isEmpty) return []
    const rows = await prisma.iarRecord.findMany({
      where: scope.isSuperAdmin
        ? {}
        : {
            delivery: {
              OR: [
                { received_by: scope.userId! },
                { inspections: { some: { inspector_id: scope.userId! } } },
              ],
            },
          },
      orderBy: { created_at: 'desc' },
      include: {
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
      },
    })

    return rows.map((r) => ({
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
  } catch (e) {
    console.error('[getAllIarReports]', e)
    return []
  }
  })
}
