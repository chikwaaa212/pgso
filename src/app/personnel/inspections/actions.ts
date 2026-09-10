'use server'

import { cache } from 'react'
import { notFound } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { Prisma } from '@prisma/client'
import { createClient } from '@/lib/supabase/server'
import { writeAuditLog } from '@/lib/audit'
import { stockInspectionItems } from '@/lib/stock'
import { getPersonnelScope } from '@/lib/personnel-scope'
import prisma from '@/lib/prisma'

// ─── Types returned to the client ────────────────────────────────────────────

export interface DeliveryItemData {
  id: string
  item_name: string
  unit: string | null
  quantity: number
  unit_cost: number | null
  stocked_qty: number
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
  account_code: string | null
  account_title: string | null
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
    stocked_at: string | null
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
  try {
    const scope = await getPersonnelScope()
    // Fail closed: signed-out callers see nothing (previously fell through
    // to the unfiltered row, costs included).
    if (scope.isEmpty || !scope.userId) notFound()
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
            stocked_at: true,
          },
        },
      },
    })

    if (!delivery) notFound()

    // Own-data only for personnel; super_admin sees all.
    if (!scope.isSuperAdmin && scope.userId) {
      const inspectedByMe = delivery.inspections.some(
        (i) => i.inspector_id === scope.userId
      )
      if (delivery.received_by !== scope.userId && !inspectedByMe) notFound()
    }

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
      account_code:     delivery.account_code,
      account_title:     delivery.account_title,
      received_by:      delivery.received_by,
      items: delivery.items.map((item) => ({
        id:        item.id,
        item_name: item.item_name,
        unit:      item.unit,
        quantity:  item.quantity,
        unit_cost: item.unit_cost ? Number(item.unit_cost) : null,
        stocked_qty: item.stocked_qty,
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
            stocked_at: latestInspection.stocked_at?.toISOString() ?? null,
          }
        : undefined,
    }
  } catch (e) {
    console.error('[getDeliveryForInspection]', e)
    notFound()
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
  inspector_id: string | null
  inspector_name: string | null
  inspection_date: string | null
  result: string | null
  inspection_status: string // 'pending' | 'passed' | 'failed' | 'partial'
  created_at: string | null
  iar_no: string | null
  iar_image_url: string | null
  stocked_at: string | null
  /** Resolved system-user name of who logged the inspection (super-admin browse fills this). */
  logged_by: string | null
}

export async function getInspectionsList(): Promise<UnifiedInspectionRow[]> {
  try {
    const scope = await getPersonnelScope()
    if (scope.isEmpty || !scope.userId) return []
    // Own-data only for personnel; super_admin sees all.
    const where: Prisma.DeliveryWhereInput = scope.isSuperAdmin
      ? {}
      : {
          OR: [
            { received_by: scope.userId },
            { inspections: { some: { inspector_id: scope.userId } } },
          ],
        };
    const deliveries = await prisma.delivery.findMany({
      where,
      orderBy: { created_at: 'desc' },
      include: {
        _count: { select: { items: true } },
        inspections: {
          orderBy: { created_at: 'desc' },
          take: 1,
          select: {
            inspector_id: true,
            inspector_name: true,
            result: true,
            inspection_date: true,
            created_at: true,
            iar_no: true,
            iar_image_url: true,
            stocked_at: true,
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
      inspector_id:      d.inspections[0]?.inspector_id ?? null,
      inspector_name:    d.inspections[0]?.inspector_name ?? null,
      inspection_date:   d.inspections[0]?.inspection_date?.toISOString().slice(0, 10) ?? null,
      result:            d.inspections[0]?.result ?? null,
      inspection_status: d.inspection_status ?? 'pending',
      created_at:        d.inspections[0]?.created_at?.toISOString() ?? null,
      iar_no:            d.inspections[0]?.iar_no ?? null,
      iar_image_url:     d.inspections[0]?.iar_image_url ?? null,
      stocked_at:        d.inspections[0]?.stocked_at?.toISOString() ?? null,
      logged_by:         null,
    }))
  } catch (e) {
    console.error('[getInspectionsList]', e)
    return []
  }
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
  try {
    // Own-data only for personnel; super_admin sees all.
    const scope = await getPersonnelScope()
    if (scope.isEmpty) return []
    if (!scope.isSuperAdmin && scope.userId) {
      const owner = await prisma.delivery.findUnique({
        where: { id: deliveryId },
        select: {
          received_by: true,
          inspections: { select: { inspector_id: true }, take: 10 },
        },
      })
      if (!owner) return []
      const mine =
        owner.received_by === scope.userId ||
        owner.inspections.some((i) => i.inspector_id === scope.userId)
      if (!mine) return []
    }
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
  } catch (e) {
    console.error('[getInspectionHistory]', e)
    return []
  }
}

// ─── Dashboard helpers ────────────────────────────────────────────────────────

export interface DashboardStats {
  totalDeliveries: number
  pendingInspections: number
  completedInspections: number
  totalItems: number
  pendingRequests: number
  pendingRepairs: number
  totalDocuments: number
}

// Per-request memoized: layout + page render in one request and both need
// these badges, so share a single execution instead of doubling the queries.
export const getDashboardStats = cache(async function getDashboardStats(): Promise<DashboardStats> {
  const zeros: DashboardStats = {
    totalDeliveries: 0,
    pendingInspections: 0,
    completedInspections: 0,
    totalItems: 0,
    pendingRequests: 0,
    pendingRepairs: 0,
    totalDocuments: 0,
  }
  try {
    // Own-data only for personnel sidebar badges; super_admin sees all.
    const scope = await getPersonnelScope()
    if (scope.isEmpty || !scope.userId) return zeros
    const all = scope.isSuperAdmin
    const me = scope.userId
    const myDeliveryFilter = all ? {} : { received_by: me }
    const myInspectionFilter = all ? {} : { inspector_id: me }
    const myDeliveriesOrInspected = all
      ? {}
      : {
          OR: [
            { received_by: me },
            { inspections: { some: { inspector_id: me } } },
          ],
        }
    const issuanceDocs = all
      ? await prisma
          .$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM issuance_records`
          .then((r) => Number(r[0]?.count ?? 0))
          .catch(() => 0)
      : await prisma
          .$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM issuance_records WHERE created_by = ${me}::uuid`
          .then((r) => Number(r[0]?.count ?? 0))
          .catch(() => 0)
    // Repairs own-data uses created_by when present (legacy NULL rows count as mine
    // so old tickets don't vanish; new tickets always carry the creator).
    // Raw SQL keeps working whether or not the generated client knows the column.
    const countMyRepairs = async (status: string): Promise<number> => {
      try {
        if (all) return await prisma.repair.count({ where: { status } })
        const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(*)::bigint AS count FROM repairs
          WHERE status = ${status} AND (created_by = ${me}::uuid OR created_by IS NULL)`
        return Number(rows[0]?.count ?? 0)
      } catch {
        // Column missing (migration not applied yet) → fall back to global count.
        try {
          return await prisma.repair.count({ where: { status } })
        } catch {
          return 0
        }
      }
    }
    const countMyCompletedRepairs = () => countMyRepairs('completed')
    const countMyPendingRepairs = () => countMyRepairs('pending')
    // Two sequential batches of 6 (was one 12-way fan-out): the dashboard
    // shares one pooler connection pool, and a 12-wide burst plus the page's
    // own queries was tripping the connection timeout.
    const countBatch = async (which: 'core' | 'docs') => {
      if (which === 'core') {
        return await Promise.all([
          prisma.delivery.count({ where: myDeliveryFilter }),
          prisma.delivery.count({ where: { ...myDeliveryFilter, inspection_status: 'pending' } }),
          prisma.inspection.count({ where: myInspectionFilter }),
          prisma.deliveryItem.count({ where: { delivery: myDeliveryFilter } }),
          prisma.request.count({ where: myRequestFilter }),
          countMyPendingRepairs(),
        ])
      }
      return await Promise.all([
        prisma.delivery.count({ where: myDeliveryFilter }),
        prisma.inventoryItem.count(),
        prisma.asset.count(),
        countMyCompletedRepairs(),
        prisma.iarRecord.count({ where: { delivery: myDeliveriesOrInspected } }),
        prisma.documentView.count(),
      ])
    }
    // Requests badge matches the personnel inbox (recipient = me + legacy NULL).
    // Super admin keeps the global queue count.
    const myRequestFilter = all
      ? { status: 'pending' }
      : { status: 'pending', OR: [{ recipient_id: me }, { recipient_id: null }] }
    const [
      totalDeliveries,
      pendingInspections,
      completedInspections,
      totalItems,
      pendingRequests,
      pendingRepairs,
    ] = await countBatch('core')
    const [
      deliveryDocs,
      stockDocs,
      assetDocs,
      repairDocs,
      iarDocs,
      viewedDocs,
    ] = await countBatch('docs')
    return {
      totalDeliveries,
      pendingInspections,
      completedInspections,
      totalItems,
      pendingRequests,
      pendingRepairs,
      totalDocuments: Math.max(
        0,
        deliveryDocs + stockDocs + assetDocs + repairDocs + iarDocs + issuanceDocs - viewedDocs
      ),
    }
  } catch (e) {
    console.error('[getDashboardStats]', e)
    return zeros
  }
})

export interface MonthlyPoint {
  month: string   // e.g. "Jan", "Feb"
  deliveries: number
  inspections: number
}

export async function getMonthlyOverview(): Promise<MonthlyPoint[]> {
  const now = new Date()
  const months: MonthlyPoint[] = []
  // Own-data only for personnel; super_admin sees all.
  const scope = await getPersonnelScope()
  const windowStart = new Date(now.getFullYear(), now.getMonth() - 5, 1)

  // One grouped query per table (was 12 per-month counts): keeps the
  // dashboard from flooding the pooler with concurrent connections.
  interface MonthCount {
    month: Date
    count: bigint
  }
  let deliveryBuckets: MonthCount[] = []
  let inspectionBuckets: MonthCount[] = []
  try {
    if (scope.isSuperAdmin) {
      ;[deliveryBuckets, inspectionBuckets] = await Promise.all([
        prisma.$queryRaw<MonthCount[]>`
          SELECT date_trunc('month', created_at) AS month, COUNT(*)::bigint AS count
          FROM deliveries WHERE created_at >= ${windowStart} GROUP BY 1`,
        prisma.$queryRaw<MonthCount[]>`
          SELECT date_trunc('month', created_at) AS month, COUNT(*)::bigint AS count
          FROM inspections WHERE created_at >= ${windowStart} GROUP BY 1`,
      ])
    } else if (scope.userId) {
      const me = scope.userId
      ;[deliveryBuckets, inspectionBuckets] = await Promise.all([
        prisma.$queryRaw<MonthCount[]>`
          SELECT date_trunc('month', created_at) AS month, COUNT(*)::bigint AS count
          FROM deliveries WHERE created_at >= ${windowStart} AND received_by = ${me}::uuid GROUP BY 1`,
        prisma.$queryRaw<MonthCount[]>`
          SELECT date_trunc('month', created_at) AS month, COUNT(*)::bigint AS count
          FROM inspections WHERE created_at >= ${windowStart} AND inspector_id = ${me}::uuid GROUP BY 1`,
      ])
    }
  } catch (e) {
    console.error('[getMonthlyOverview]', e)
  }
  const keyOf = (d: Date) => `${d.getUTCFullYear()}-${d.getUTCMonth()}`
  const deliveryMap = new Map(
    deliveryBuckets.map((r) => [keyOf(new Date(r.month)), Number(r.count)])
  )
  const inspectionMap = new Map(
    inspectionBuckets.map((r) => [keyOf(new Date(r.month)), Number(r.count)])
  )

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    // date_trunc buckets are UTC; local month keys coincide except for rows
    // stamped in the first/last hours of a month — negligible for a trend.
    months.push({
      month: d.toLocaleString('en-PH', { month: 'short' }),
      deliveries: deliveryMap.get(key) ?? 0,
      inspections: inspectionMap.get(key) ?? 0,
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
  try {
    const scope = await getPersonnelScope()
    if (scope.isEmpty) return []
    // Clamp client-controlled take: huge/negative values scanned or flipped rows.
    const take = Number.isFinite(limit)
      ? Math.min(Math.max(Math.floor(limit), 1), 100)
      : 5
    const rows = await prisma.delivery.findMany({
      where: scope.isSuperAdmin ? {} : { received_by: scope.userId! },
      orderBy: { created_at: 'desc' },
      take,
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
  } catch (e) {
    console.error('[getRecentDeliveries]', e)
    return []
  }
}

// ─── Generated AIR / IAR ───────────────────────────────────────────────────

export interface SaveAirState {
  success?: boolean
  error?: string
  recordId?: string
  /** Set when the AIR saved but stocking failed — recover via Stocks sync. */
  stockWarning?: string
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

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in to generate an AIR.' }
  }

  try {
    const delivery = await prisma.delivery.findUnique({
      where: { id: deliveryId },
      select: {
        id: true,
        received_by: true,
        inspections: {
          orderBy: { created_at: 'desc' },
          take: 5,
          select: { id: true, inspector_id: true },
        },
      },
    })
    if (!delivery) return { error: 'Delivery not found.' }
    // Own-data only.
    const mine =
      delivery.received_by === user.id ||
      delivery.inspections.some((i) => i.inspector_id === user.id)
    if (!mine) return { error: 'You can only manage your own deliveries.' }

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
    // Passed/partial + AIR now present → move remaining items to stock.
    let stockWarning: string | undefined
    try {
      const res = await stockInspectionItems(inspection.id)
      if (res.stocked) revalidatePath('/personnel/inventory')
    } catch (e) {
      console.error('[saveAir:stock]', e)
      stockWarning =
        'AIR saved, but moving items to stocks failed. Use “Sync from inspections” on the Stocks page.'
    }

    revalidatePath('/personnel/inspections')
    revalidatePath(`/personnel/inspections/${deliveryId}`)
    revalidatePath(`/personnel/inspections/${deliveryId}/iar`)
    revalidatePath(`/personnel/inspections/${deliveryId}/receipt`)
    await writeAuditLog({
      userId: user.id,
      action: 'iar:generate',
      module: 'inspections',
      details: {
        purpose: `Generate AIR ${iarNo} for ${entity} — ${department}`,
        summary: `Delivery ${deliveryId.slice(0, 8).toUpperCase()} · Invoice ${input.invoiceNo?.trim() || '—'}`,
        reference_id: record.id,
        iar_no: iarNo,
      },
    })
    return { success: true, recordId: record.id, stockWarning }
  } catch (e) {
    console.error('[saveAir]', e)
    return { error: 'Failed to save the AIR. Please try again.' }
  }
}

export interface AttachAirState {
  success?: boolean
  error?: string
  /** Set when the attach saved but stocking failed — recover via Stocks sync. */
  stockWarning?: string
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

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'You must be signed in to attach an IAR.' }

  try {
    // Own-data only.
    const ownerAttach = await prisma.delivery.findUnique({
      where: { id: deliveryId },
      select: {
        received_by: true,
        inspections: {
          orderBy: { created_at: 'desc' },
          take: 5,
          select: { id: true, inspector_id: true },
        },
      },
    })
    if (!ownerAttach) return { error: 'Delivery not found.' }
    const mineAttach =
      ownerAttach.received_by === user.id ||
      ownerAttach.inspections.some((i) => i.inspector_id === user.id)
    if (!mineAttach) return { error: 'You can only manage your own deliveries.' }
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
    // Passed/partial + AIR now present → move remaining items to stock.
    let attachWarning: string | undefined
    try {
      const res = await stockInspectionItems(inspectionId)
      if (res.stocked) revalidatePath('/personnel/inventory')
    } catch (e) {
      console.error('[attachIarImage:stock]', e)
      attachWarning =
        'Scan attached, but moving items to stocks failed. Use “Sync from inspections” on the Stocks page.'
    }
    revalidatePath('/personnel/inspections')
    revalidatePath(`/personnel/inspections/${deliveryId}/iar`)
    revalidatePath(`/personnel/inspections/${deliveryId}/receipt`)
    return { success: true, stockWarning: attachWarning }
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

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'You must be signed in to remove an IAR.' }

  try {
    // Own-data only.
    const ownerRemove = await prisma.delivery.findUnique({
      where: { id: deliveryId },
      select: {
        received_by: true,
        inspections: {
          orderBy: { created_at: 'desc' },
          take: 5,
          select: { id: true, inspector_id: true },
        },
      },
    })
    if (!ownerRemove) return { error: 'Delivery not found.' }
    const mineRemove =
      ownerRemove.received_by === user.id ||
      ownerRemove.inspections.some((i) => i.inspector_id === user.id)
    if (!mineRemove) return { error: 'You can only manage your own deliveries.' }
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
  try {
    // Own-data only for personnel; super_admin sees all.
    const scope = await getPersonnelScope()
    if (scope.isEmpty) return []
    if (!scope.isSuperAdmin && scope.userId) {
      const owner = await prisma.delivery.findUnique({
        where: { id: deliveryId },
        select: {
          received_by: true,
          inspections: { select: { inspector_id: true }, take: 10 },
        },
      })
      if (!owner) return []
      const mine =
        owner.received_by === scope.userId ||
        owner.inspections.some((i) => i.inspector_id === scope.userId)
      if (!mine) return []
    }
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
  } catch (e) {
    console.error('[getIarRecords]', e)
    return []
  }
}
