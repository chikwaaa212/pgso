'use server'

import { notFound } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { Prisma } from '@prisma/client'
import { createClient } from '@/lib/supabase/server'
import prisma from '@/lib/prisma'

// ─── Types returned to the client ────────────────────────────────────────────

export interface DeliveryItemData {
  id: string
  item_name: string
  unit: string | null
  quantity: number
  unit_cost: number | null
}

export interface DeliveryForInspection {
  id: string
  po_reference: string | null
  supplier: string | null
  date_delivered: string | null   // ISO date string
  delivery_status: string | null
  inspection_status: string | null
  recipient_name: string | null
  recipient_role: string | null
  asset_type: string | null
  asset_code: string | null
  account_type: string | null
  received_by: string             // UUID
  items: DeliveryItemData[]
  inspection_data?: {
    inspector_name: string | null
    inspector_id: string | null
    inspection_date: string
    result: string
    remarks: string | null
    supplier_checks: Record<string, string> | null
    item_checks: Array<{
      itemId: string
      status: string
      actualQty: number
      remarks: string
    }> | null
    iar_no: string | null
    iar_date: string | null
    iar_invoice_no: string | null
    iar_invoice_date: string | null
    iar_data: Record<string, string> | null
    iar_generated_at: string | null
    iar_image_url: string | null
  }
}

export interface InspectionRow {
  id: string
  delivery_id: string
  delivery_ref: string            // first 8 chars of delivery_id, uppercased
  supplier: string | null
  inspector_name: string | null
  result: string
  inspection_date: string         // ISO date string
  created_at: string | null
}

export interface PendingDeliveryRow {
  id: string
  delivery_ref: string
  supplier: string | null
  po_reference: string | null
  date_delivered: string | null
  delivery_status: string | null
  item_count: number
}

// ─── Fetch a single delivery + its items for the inspection form ──────────────

export async function getDeliveryForInspection(
  deliveryId: string
): Promise<DeliveryForInspection> {
  const delivery = await prisma.delivery.findUnique({
    where: { id: deliveryId },
    include: {
      items: { orderBy: { created_at: 'asc' } },
      inspections: {
        orderBy: { created_at: 'desc' },
        take: 1,
        select: {
          inspector_name: true,
          inspector_id: true,
          inspection_date: true,
          result: true,
          remarks: true,
          supplier_checks: true,
          item_checks: true,
          iar_no: true,
          iar_date: true,
          iar_invoice_no: true,
          iar_invoice_date: true,
          iar_data: true,
          iar_generated_at: true,
          iar_image_url: true,
        },
      },
    },
  })

  if (!delivery) notFound()

  const latestInspection = delivery.inspections[0] ?? null

  return {
    id:               delivery.id,
    po_reference:     delivery.po_reference,
    supplier:         delivery.supplier,
    date_delivered:   delivery.date_delivered?.toISOString().slice(0, 10) ?? null,
    delivery_status:  delivery.delivery_status,
    inspection_status: delivery.inspection_status,
    recipient_name:   delivery.recipient_name,
    recipient_role:   delivery.recipient_role,
    asset_type:       delivery.asset_type,
    asset_code:       delivery.asset_code,
    account_type:     delivery.account_type,
    received_by:      delivery.received_by,
    items: delivery.items.map((item) => ({
      id:        item.id,
      item_name: item.item_name,
      unit:      item.unit,
      quantity:  item.quantity,
      unit_cost: item.unit_cost ? Number(item.unit_cost) : null,
    })),
    inspection_data: latestInspection
      ? {
          inspector_name: latestInspection.inspector_name,
          inspector_id: latestInspection.inspector_id,
          inspection_date: latestInspection.inspection_date.toISOString().slice(0, 10),
          result: latestInspection.result,
          remarks: latestInspection.remarks,
          supplier_checks: latestInspection.supplier_checks as Record<string, string> | null,
          item_checks: latestInspection.item_checks as Array<{
            itemId: string
            status: string
            actualQty: number
            remarks: string
          }> | null,
          iar_no: latestInspection.iar_no,
          iar_date: latestInspection.iar_date?.toISOString().slice(0, 10) ?? null,
          iar_invoice_no: latestInspection.iar_invoice_no,
          iar_invoice_date: latestInspection.iar_invoice_date?.toISOString().slice(0, 10) ?? null,
          iar_data: latestInspection.iar_data as Record<string, string> | null,
          iar_generated_at: latestInspection.iar_generated_at?.toISOString() ?? null,
          iar_image_url: latestInspection.iar_image_url,
        }
      : undefined,
  }
}

// ─── Fetch a unified list for the inspections index page ─────────────────────────

export interface UnifiedInspectionRow {
  delivery_id: string
  delivery_ref: string
  supplier: string | null
  po_reference: string | null
  date_delivered: string | null
  item_count: number
  delivery_status: string | null
  inspector_name: string | null
  inspection_date: string | null
  result: string | null
  inspection_status: string // 'pending' | 'passed' | 'failed' | 'partial'
  created_at: string | null
  iar_no: string | null
  iar_image_url: string | null
}

export async function getInspectionsList(): Promise<UnifiedInspectionRow[]> {
  const deliveries = await prisma.delivery.findMany({
    orderBy: { date_delivered: 'desc' },
    include: {
      _count: { select: { items: true } },
      inspections: {
        orderBy: { created_at: 'desc' },
        take: 1,
        select: {
          inspector_name: true,
          result: true,
          inspection_date: true,
          created_at: true,
          iar_no: true,
          iar_image_url: true,
        },
      },
    },
  })

  return deliveries.map((d) => ({
    delivery_id:       d.id,
    delivery_ref:      d.id.slice(0, 8).toUpperCase(),
    supplier:          d.supplier,
    po_reference:      d.po_reference,
    date_delivered:    d.date_delivered?.toISOString().slice(0, 10) ?? null,
    item_count:        d._count.items,
    delivery_status:   d.delivery_status,
    inspector_name:    d.inspections[0]?.inspector_name ?? null,
    inspection_date:   d.inspections[0]?.inspection_date?.toISOString().slice(0, 10) ?? null,
    result:            d.inspections[0]?.result ?? null,
    inspection_status: d.inspection_status ?? 'pending',
    created_at:        d.inspections[0]?.created_at?.toISOString() ?? null,
    iar_no:            d.inspections[0]?.iar_no ?? null,
    iar_image_url:     d.inspections[0]?.iar_image_url ?? null,
  }))
}

// ─── Fetch full inspection history for a delivery ─────────────────────────

export interface InspectionHistoryRecord {
  id: string
  inspector_id: string | null
  inspector_name: string | null
  inspection_date: string // ISO date string
  result: string
  remarks: string | null
  supplier_checks: Record<string, string> | null
  item_checks: Array<{
    itemId: string
    status: string
    actualQty: number
    remarks: string
  }> | null
  created_at: string | null
}

export async function getInspectionHistory(
  deliveryId: string
): Promise<InspectionHistoryRecord[]> {
  const inspections = await prisma.inspection.findMany({
    where: { delivery_id: deliveryId },
    orderBy: { created_at: 'desc' },
    select: {
      id: true,
      inspector_id: true,
      inspector_name: true,
      inspection_date: true,
      result: true,
      remarks: true,
      supplier_checks: true,
      item_checks: true,
      created_at: true,
    },
  })

  return inspections.map((inspection) => ({
    id: inspection.id,
    inspector_id: inspection.inspector_id,
    inspector_name: inspection.inspector_name,
    inspection_date: inspection.inspection_date.toISOString().slice(0, 10),
    result: inspection.result,
    remarks: inspection.remarks,
    supplier_checks: inspection.supplier_checks as Record<string, string> | null,
    item_checks: inspection.item_checks as Array<{
      itemId: string
      status: string
      actualQty: number
      remarks: string
    }> | null,
    created_at: inspection.created_at?.toISOString() ?? null,
  }))
}

// ─── Dashboard helpers ────────────────────────────────────────────────────────

export interface DashboardStats {
  totalDeliveries: number
  pendingInspections: number
  completedInspections: number
  totalItems: number
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const [totalDeliveries, pendingInspections, completedInspections, totalItems] =
    await Promise.all([
      prisma.delivery.count(),
      prisma.delivery.count({ where: { inspection_status: 'pending' } }),
      prisma.inspection.count(),
      prisma.deliveryItem.count(),
    ])

  return { totalDeliveries, pendingInspections, completedInspections, totalItems }
}

export interface MonthlyPoint {
  month: string   // e.g. "Jan", "Feb"
  deliveries: number
  inspections: number
}

export async function getMonthlyOverview(): Promise<MonthlyPoint[]> {
  // Last 6 calendar months including current
  const now = new Date()
  const months: MonthlyPoint[] = []

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const start = new Date(d.getFullYear(), d.getMonth(), 1)
    const end   = new Date(d.getFullYear(), d.getMonth() + 1, 1)

    const [deliveries, inspections] = await Promise.all([
      prisma.delivery.count({
        where: { created_at: { gte: start, lt: end } },
      }),
      prisma.inspection.count({
        where: { created_at: { gte: start, lt: end } },
      }),
    ])

    months.push({
      month: d.toLocaleString('en-PH', { month: 'short' }),
      deliveries,
      inspections,
    })
  }

  return months
}

export interface RecentDeliveryRow {
  id: string
  supplier: string | null
  po_reference: string | null
  delivery_status: string | null
  inspection_status: string | null
  date_delivered: string | null
}

export async function getRecentDeliveries(limit = 5): Promise<RecentDeliveryRow[]> {
  const rows = await prisma.delivery.findMany({
    orderBy: { created_at: 'desc' },
    take: limit,
    select: {
      id: true,
      supplier: true,
      po_reference: true,
      delivery_status: true,
      inspection_status: true,
      date_delivered: true,
    },
  })

  return rows.map((d) => ({
    id:               d.id,
    supplier:         d.supplier,
    po_reference:     d.po_reference,
    delivery_status:  d.delivery_status,
    inspection_status: d.inspection_status,
    date_delivered:   d.date_delivered?.toISOString().slice(0, 10) ?? null,
  }))
}

// ─── Generated AIR / IAR ───────────────────────────────────────────────────

export interface SaveAirState {
  success?: boolean
  error?: string
  recordId?: string
}

export interface SaveAirInput {
  entity: string
  department: string
  rcCode: string
  fundCluster: string
  iarNo: string
  iarDate: string      // ISO yyyy-mm-dd
  invoiceNo: string
  invoiceDate: string  // ISO yyyy-mm-dd
}

/** Persists a generated AIR/IAR against the latest inspection of a delivery. */
export async function saveAir(
  deliveryId: string,
  input: SaveAirInput
): Promise<SaveAirState> {
  const iarNo = input.iarNo?.trim() ?? ''
  const entity = input.entity?.trim() ?? ''
  const department = input.department?.trim() ?? ''

  if (!deliveryId) return { error: 'Delivery ID is required.' }
  if (!iarNo) return { error: 'IAR No. is required.' }
  if (!entity) return { error: 'Entity name is required.' }
  if (!department) return { error: 'Requisitioning officer/department is required.' }
  if (!input.iarDate || Number.isNaN(Date.parse(input.iarDate))) {
    return { error: 'A valid IAR date is required.' }
  }
  if (!input.invoiceDate || Number.isNaN(Date.parse(input.invoiceDate))) {
    return { error: 'A valid invoice date is required.' }
  }

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in to generate an AIR.' }
  }

  try {
    const delivery = await prisma.delivery.findUnique({
      where: { id: deliveryId },
      select: { id: true },
    })
    if (!delivery) return { error: 'Delivery not found.' }

    const inspection = await prisma.inspection.findFirst({
      where: { delivery_id: deliveryId },
      orderBy: { created_at: 'desc' },
      select: { id: true },
    })
    if (!inspection) {
      return { error: 'Record the inspection first before generating the AIR.' }
    }

    // Every generation is kept as its own timestamped record.
    const record = await prisma.iarRecord.create({
      data: {
        inspection_id:    inspection.id,
        delivery_id:      deliveryId,
        kind:             'generated',
        iar_no:           iarNo,
        iar_date:         new Date(input.iarDate),
        iar_invoice_no:   input.invoiceNo?.trim() || null,
        iar_invoice_date: new Date(input.invoiceDate),
        iar_data: {
          entity:       entity,
          department:   department,
          rcCode:       input.rcCode?.trim() ?? '',
          fundCluster:  input.fundCluster?.trim() ?? '',
        },
      },
      select: { id: true },
    })
    await syncInspectionAir(inspection.id)

    revalidatePath('/personnel/inspections')
    revalidatePath(`/personnel/inspections/${deliveryId}`)
    revalidatePath(`/personnel/inspections/${deliveryId}/iar`)
    revalidatePath(`/personnel/inspections/${deliveryId}/receipt`)
    return { success: true, recordId: record.id }
  } catch (e) {
    console.error('[saveAir]', e)
    return { error: 'Failed to save the AIR. Please try again.' }
  }
}

export interface AttachAirState {
  success?: boolean
  error?: string
}

async function latestInspectionId(deliveryId: string) {
  const inspection = await prisma.inspection.findFirst({
    where: { delivery_id: deliveryId },
    orderBy: { created_at: 'desc' },
    select: { id: true },
  })
  return inspection?.id ?? null
}

/** Attaches a scanned/signed IAR image URL to the latest inspection. */
export async function attachIarImage(
  deliveryId: string,
  imageUrl: string
): Promise<AttachAirState> {
  const url = imageUrl?.trim() ?? ''
  if (!deliveryId) return { error: 'Delivery ID is required.' }
  if (!url || !/^https?:\/\//i.test(url)) {
    return { error: 'A valid image URL is required.' }
  }

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'You must be signed in to attach an IAR.' }

  try {
    const inspectionId = await latestInspectionId(deliveryId)
    if (!inspectionId) {
      return { error: 'Record the inspection first before attaching an IAR.' }
    }
    // Every attach is kept as its own timestamped record.
    await prisma.iarRecord.create({
      data: {
        inspection_id: inspectionId,
        delivery_id:   deliveryId,
        kind:          'attached',
        iar_image_url: url,
      },
    })
    await syncInspectionAir(inspectionId)
    revalidatePath('/personnel/inspections')
    revalidatePath(`/personnel/inspections/${deliveryId}/iar`)
    revalidatePath(`/personnel/inspections/${deliveryId}/receipt`)
    return { success: true }
  } catch (e) {
    console.error('[attachIarImage]', e)
    return { error: 'Failed to attach the IAR image. Please try again.' }
  }
}

/** Removes an attached IAR record (or clears a legacy attached image). */
export async function removeIarImage(
  deliveryId: string,
  recordId?: string
): Promise<AttachAirState> {
  if (!deliveryId) return { error: 'Delivery ID is required.' }

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'You must be signed in to remove an IAR.' }

  try {
    const inspectionId = await latestInspectionId(deliveryId)
    if (!inspectionId) return { error: 'No inspection record found.' }
    if (recordId) {
      const rec = await prisma.iarRecord.findFirst({
        where: { id: recordId, delivery_id: deliveryId },
        select: { id: true, kind: true },
      })
      if (!rec) return { error: 'AIR record not found.' }
      if (rec.kind !== 'attached') {
        return { error: 'Only attached scans can be removed.' }
      }
      await prisma.iarRecord.delete({ where: { id: rec.id } })
    } else {
      // Legacy path: image stored directly on the inspection.
      await prisma.inspection.update({
        where: { id: inspectionId },
        data: { iar_image_url: null },
      })
    }
    await syncInspectionAir(inspectionId)
    revalidatePath('/personnel/inspections')
    revalidatePath(`/personnel/inspections/${deliveryId}/iar`)
    revalidatePath(`/personnel/inspections/${deliveryId}/receipt`)
    return { success: true }
  } catch (e) {
    console.error('[removeIarImage]', e)
    return { error: 'Failed to remove the IAR image. Please try again.' }
  }
}

/**
 * Keeps the inspection's latest-AIR columns in sync with its history:
 * form fields come from the newest generated record, the scan from the
 * newest attached record, and the timestamp from the newest record overall.
 */
async function syncInspectionAir(inspectionId: string) {
  const [gen, att, anyLatest] = await Promise.all([
    prisma.iarRecord.findFirst({
      where: { inspection_id: inspectionId, kind: 'generated' },
      orderBy: { created_at: 'desc' },
    }),
    prisma.iarRecord.findFirst({
      where: { inspection_id: inspectionId, kind: 'attached' },
      orderBy: { created_at: 'desc' },
    }),
    prisma.iarRecord.findFirst({
      where: { inspection_id: inspectionId },
      orderBy: { created_at: 'desc' },
      select: { created_at: true },
    }),
  ])

  await prisma.inspection.update({
    where: { id: inspectionId },
    data: {
      iar_no:           gen?.iar_no ?? null,
      iar_date:         gen?.iar_date ?? null,
      iar_invoice_no:   gen?.iar_invoice_no ?? null,
      iar_invoice_date: gen?.iar_invoice_date ?? null,
      iar_data:         gen?.iar_data ?? Prisma.JsonNull,
      iar_generated_at: anyLatest?.created_at ?? null,
      iar_image_url:    att?.iar_image_url ?? null,
    },
  })
}

// ─── AIR history ──────────────────────────────────────────────────────────

export interface IarRecordRow {
  id: string
  kind: string // 'generated' | 'attached'
  iar_no: string | null
  iar_date: string | null
  iar_invoice_no: string | null
  iar_invoice_date: string | null
  iar_data: Record<string, string> | null
  iar_image_url: string | null
  created_at: string | null
  inspection_id: string
  inspection_result: string | null
  inspection_date: string | null
  inspector_name: string | null
}

/** Every generated / attached AIR for a delivery, newest first. */
export async function getIarRecords(deliveryId: string): Promise<IarRecordRow[]> {
  const rows = await prisma.iarRecord.findMany({
    where: { delivery_id: deliveryId },
    orderBy: { created_at: 'desc' },
    include: {
      inspection: {
        select: {
          result: true,
          inspection_date: true,
          inspector_name: true,
        },
      },
    },
  })

  return rows.map((r) => ({
    id:               r.id,
    kind:             r.kind,
    iar_no:           r.iar_no,
    iar_date:         r.iar_date?.toISOString().slice(0, 10) ?? null,
    iar_invoice_no:   r.iar_invoice_no,
    iar_invoice_date: r.iar_invoice_date?.toISOString().slice(0, 10) ?? null,
    iar_data:         r.iar_data as Record<string, string> | null,
    iar_image_url:    r.iar_image_url,
    created_at:       r.created_at?.toISOString() ?? null,
    inspection_id:    r.inspection_id,
    inspection_result: r.inspection.result,
    inspection_date:  r.inspection.inspection_date.toISOString().slice(0, 10),
    inspector_name:   r.inspection.inspector_name,
  }))
}
