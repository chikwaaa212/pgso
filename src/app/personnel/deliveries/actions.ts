'use server'

import { revalidatePath } from 'next/cache'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import prisma from '@/lib/prisma'
import { withIdempotency } from '@/lib/idempotency'
import { stockInspectionItems } from '@/lib/stock'
import type { SignupState } from '@/types'

const statuses = ['complete', 'partial'] as const
const inspectionResults = ['passed', 'partial'] as const
const recipientRoles = ['Employee', 'PGSO Personnel'] as const

interface ItemInput {
  description?: string
  units?: string
  quantity?: string | number
  unitCost?: string | number
}

export async function logDelivery(
  _prevState: SignupState,
  formData: FormData
): Promise<SignupState> {
  const assetType = (formData.get('assetType') as string)?.trim()
  const accountCode = (formData.get('accountCode') as string)?.trim()
  const accountType = (formData.get('accountType') as string)?.trim()
  const dateSupplied = formData.get('dateSupplied') as string
  const supplierName = (formData.get('supplierName') as string)?.trim()
  const poReference = (formData.get('poReference') as string)?.trim()
  const deliveryStatus = (
    formData.get('deliveryStatus') as string
  )?.toLowerCase()
  const recipientRole = (formData.get('recipientRole') as string)?.trim()
  const recipientName = (formData.get('recipientName') as string)?.trim()

  if (!assetType || !accountCode || !accountType) {
    return { error: 'Asset type, account code, and account type are required.' }
  }

  if (!dateSupplied || Number.isNaN(Date.parse(dateSupplied))) {
    return { error: 'A valid date supplied is required.' }
  }

  if (!supplierName) {
    return { error: 'Supplier name is required.' }
  }

  if (!poReference) {
    return { error: 'PO reference is required.' }
  }

  if (!statuses.includes(deliveryStatus as (typeof statuses)[number])) {
    return { error: 'Invalid delivery status.' }
  }

  if (!recipientRoles.includes(recipientRole as (typeof recipientRoles)[number])) {
    return { error: 'Recipient must be an Employee or PGSO Personnel.' }
  }

  let items: ItemInput[]
  try {
    items = JSON.parse((formData.get('itemsJson') as string) || '[]')
  } catch {
    return { error: 'Invalid items payload.' }
  }

  if (!Array.isArray(items) || items.length === 0) {
    return { error: 'Add at least one delivered item.' }
  }

  const parsedItems = items.map((item) => {
    const description = String(item.description || '').trim()
    const quantity = Number(item.quantity)
    const unit = String(item.units || '').trim() || null
    const costRaw = String(item.unitCost ?? '').trim()
    return { description, quantity, unit, costRaw }
  })

  for (const item of parsedItems) {
    if (!item.description) {
      return { error: 'Every item needs a description.' }
    }
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      return { error: 'Item quantities must be whole numbers above zero.' }
    }
    if (item.costRaw && (Number.isNaN(Number(item.costRaw)) || Number(item.costRaw) < 0)) {
      return { error: 'Unit costs must be zero or more.' }
    }
  }

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in to log a delivery.' }
  }

  try {
    const outcome = await withIdempotency(
      formData.get('idempotencyKey') as string,
      'delivery:create',
      async () => {
        const delivery = await prisma.delivery.create({
          data: {
            supplier: supplierName,
            po_reference: poReference,
            date_delivered: new Date(dateSupplied),
            delivery_status: deliveryStatus,
            inspection_status: 'pending',
            received_by: user.id,
            recipient_role: recipientRole,
            recipient_name: recipientName || null,
            asset_type: assetType,
            account_code: accountCode,
            account_type: accountType,
            items: {
              create: parsedItems.map((item) => ({
                item_name: item.description,
                unit: item.unit,
                quantity: item.quantity,
                unit_cost: item.costRaw ? item.costRaw : null,
              })),
            },
          },
          select: { id: true },
        })
        return { deliveryId: delivery.id }
      }
    )

    revalidatePath('/personnel/deliveries')
    revalidatePath('/personnel/dashboard')
    return { success: true, deliveryId: outcome.result.deliveryId }
  } catch {
    return { error: 'Failed to save delivery. Please try again.' }
  }
}

export interface InspectionState {
  success?: boolean
  error?: string
  /** Set when the inspection saved but stocking failed — recover via Stocks sync. */
  stockWarning?: string
}

export async function recordInspection(
  _prevState: InspectionState,
  formData: FormData
): Promise<InspectionState> {
  const deliveryId      = (formData.get('deliveryId') as string)?.trim()
  const result          = (formData.get('result') as string)?.toLowerCase()
  const remarks         = (formData.get('remarks') as string)?.trim()
  const inspectorName   = (formData.get('inspectorName') as string)?.trim()
  const inspectionDate  = (formData.get('inspectionDate') as string)?.trim()
  const supplierRaw     = (formData.get('supplierChecks') as string)?.trim()
  const itemsRaw        = (formData.get('itemChecks') as string)?.trim()

  if (!deliveryId) {
    return { error: 'Delivery ID is required.' }
  }

  if (!inspectionResults.includes(result as (typeof inspectionResults)[number])) {
    return { error: 'Invalid inspection result.' }
  }

  if (!inspectorName) {
    return { error: 'Inspector name is required.' }
  }

  if (!inspectionDate || Number.isNaN(Date.parse(inspectionDate))) {
    return { error: 'A valid inspection date is required.' }
  }

  let supplierChecks: Record<string, unknown> = {}
  let itemChecks: unknown[] = []

  try {
    if (supplierRaw) supplierChecks = JSON.parse(supplierRaw)
  } catch {
    return { error: 'Invalid supplier checks payload.' }
  }

  try {
    if (itemsRaw) itemChecks = JSON.parse(itemsRaw)
  } catch {
    return { error: 'Invalid item checks payload.' }
  }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in to record an inspection.' }
  }

  try {
    const exists = await prisma.delivery.findUnique({
      where: { id: deliveryId },
      select: { id: true, inspection_status: true },
    })

    if (!exists) {
      return { error: 'Delivery not found.' }
    }

    if (exists.inspection_status !== 'pending' && exists.inspection_status !== 'partial' && exists.inspection_status !== 'failed') {
      return { error: 'This delivery has already been inspected.' }
    }

    const { stockWarning } = await withIdempotency(
      formData.get('idempotencyKey') as string,
      'inspection:create',
      async () => {
        const inspection = await prisma.inspection.create({
          data: {
            delivery_id:     deliveryId,
            inspector_id:    user.id,
            inspector_name:  inspectorName,
            inspection_date: new Date(inspectionDate),
            result,
            remarks:         remarks || null,
            supplier_checks: supplierChecks,
            item_checks:     itemChecks,
          },
          select: { id: true },
        })

        await prisma.delivery.update({
          where: { id: deliveryId },
          data:  { inspection_status: result },
        })

        return { inspectionId: inspection.id }
      }
    ).then(async (outcome) => {
      // Passed/partial + already has an AIR (e.g. re-inspection) → move the
      // remaining received items to stock. Never fails the save; idempotent.
      let stockWarning: string | undefined
      try {
        const res = await stockInspectionItems(outcome.result.inspectionId)
        if (res.stocked) revalidatePath('/personnel/inventory')
      } catch (e) {
        console.error('[recordInspection:stock]', e)
        stockWarning =
          'Inspection saved, but moving items to stocks failed. Use “Sync from inspections” on the Stocks page.'
      }
      return { stockWarning }
    })

    revalidatePath('/personnel/deliveries')
    revalidatePath('/personnel/inspections')
    revalidatePath(`/personnel/inspections/${deliveryId}`)
    revalidatePath('/personnel/dashboard')
    return { success: true, stockWarning }
  } catch (e) {
    console.error('[recordInspection]', e)
    return { error: 'Failed to record inspection. Please try again.' }
  }
}

// ─── Delivery details for the /personnel/deliveries/[id] page ─────────────────

export interface DeliveryDetailItem {
  id: string
  item_name: string
  unit: string | null
  quantity: number
  unit_cost: number | null
}

export interface DeliveryDetails {
  id: string
  delivery_ref: string
  supplier: string | null
  po_reference: string | null
  date_delivered: string | null
  delivery_status: string | null
  inspection_status: string | null
  asset_type: string | null
  account_code: string | null
  account_type: string | null
  recipient_role: string | null
  recipient_name: string | null
  created_at: string | null
  items: DeliveryDetailItem[]
}

export async function getDeliveryDetails(
  deliveryId: string
): Promise<DeliveryDetails> {
  const delivery = await prisma.delivery.findUnique({
    where: { id: deliveryId },
    include: {
      items: { orderBy: { created_at: 'asc' } },
    },
  })

  if (!delivery) notFound()

  return {
    id: delivery.id,
    delivery_ref: delivery.id.slice(0, 8).toUpperCase(),
    supplier: delivery.supplier,
    po_reference: delivery.po_reference,
    date_delivered: delivery.date_delivered?.toISOString().slice(0, 10) ?? null,
    delivery_status: delivery.delivery_status,
    inspection_status: delivery.inspection_status,
    asset_type: delivery.asset_type,
    account_code: delivery.account_code,
    account_type: delivery.account_type,
    recipient_role: delivery.recipient_role,
    recipient_name: delivery.recipient_name,
    created_at: delivery.created_at?.toISOString() ?? null,
    items: delivery.items.map((item) => ({
      id: item.id,
      item_name: item.item_name,
      unit: item.unit,
      quantity: item.quantity,
      unit_cost: item.unit_cost ? Number(item.unit_cost) : null,
    })),
  }
}
