'use server'

import prisma from '@/lib/prisma'
import { VIEWED_DOC_TYPES } from './document-types'

// ─── Viewed receipts ─────────────────────────────────────────────────────────
// Tracks which document receipts have been opened so sidebar badges count
// only unviewed documents. Keys are `${doc_type}:${doc_id}` with doc_type in
// 'delivery' | 'inspection' | 'stock' | 'asset' | 'repair' | 'iar' | 'par' | 'ics'.

export async function getViewedDocKeys(): Promise<string[]> {
  try {
    const rows = await prisma.documentView.findMany({
      select: { doc_type: true, doc_id: true },
    })
    return rows.map((r) => `${r.doc_type}:${r.doc_id}`)
  } catch (e) {
    console.error('[getViewedDocKeys]', e)
    return []
  }
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
  try {
    await prisma.documentView.upsert({
      where: { doc_type_doc_id: { doc_type: docType, doc_id: docId } },
      update: {},
      create: { doc_type: docType, doc_id: docId },
    })
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
  try {
    const deliveries = await prisma.delivery.findMany({
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

/** Every IAR ever generated or attached, newest first, across all deliveries. */
export async function getAllIarReports(): Promise<IarReportRow[]> {
  try {
    const rows = await prisma.iarRecord.findMany({
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
}
