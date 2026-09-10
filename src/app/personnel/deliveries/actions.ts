'use server'

import { revalidatePath } from 'next/cache'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import prisma from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { withIdempotency } from '@/lib/idempotency'
import { writeAuditLog } from '@/lib/audit'
import { stockInspectionItems } from '@/lib/stock'
import { findCatalogEntry, getActiveCatalogEntries, resolveUnitName } from '@/lib/master-data'
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
  const accountCode = (formData.get('accountCode') as string)?.trim()
  const dateSupplied = formData.get('dateSupplied') as string
  const supplierName = (formData.get('supplierName') as string)?.trim()
  const poReference = (formData.get('poReference') as string)?.trim()
  const deliveryStatus = (
    formData.get('deliveryStatus') as string
  )?.toLowerCase()
  const recipientRole = (formData.get('recipientRole') as string)?.trim()
  const recipientName = (formData.get('recipientName') as string)?.trim()

  if (!accountCode) {
    return { error: 'Account code is required — pick one from Master Data.' }
  }

  // Strict mode: the catalog is authoritative. Unknown/inactive codes are
  // rejected; type + title always come from the catalog entry.
  const catalogEntry = await findCatalogEntry(accountCode)
  if (!catalogEntry) {
    return { error: `Unknown account code "${accountCode}" — ask your Super Admin to add it to Master Data.` }
  }
  const assetType = catalogEntry.type
  const accountTitle = catalogEntry.title

  if (!dateSupplied || Number.isNaN(Date.parse(dateSupplied))) {
    return { error: 'A valid date received is required.' }
  }

  if (!supplierName) {
    return { error: 'Supplier/payee is required.' }
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
      return { error: 'Every item needs an article.' }
    }
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      return { error: 'Item quantities must be whole numbers above zero.' }
    }
    if (item.costRaw && (Number.isNaN(Number(item.costRaw)) || Number(item.costRaw) < 0)) {
      return { error: 'Unit costs must be zero or more.' }
    }
    if (!item.unit) {
      return { error: `Item "${item.description}" needs a unit — pick one from Master Data.` }
    }
    const canonicalUnit = await resolveUnitName(item.unit)
    if (!canonicalUnit) {
      return { error: `Unknown unit "${item.unit}" for "${item.description}" — ask your Super Admin to add it to Master Data.` }
    }
    item.unit = canonicalUnit
  }

  const supabase = await createClient()
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
            account_title: accountTitle,
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
    await writeAuditLog({
      userId: user.id,
      action: 'delivery:create',
      module: 'deliveries',
      details: {
        purpose: `Log delivery from ${supplierName}`,
        summary: `PO ${poReference} · ${parsedItems.length} item(s) · ${deliveryStatus}`,
        reference_id: outcome.result.deliveryId,
        supplier: supplierName,
        po_reference: poReference,
      },
    })
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

  let supplierChecks: Prisma.InputJsonValue = {}
  let itemChecks: Prisma.InputJsonValue = []

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

  const supabase = await createClient()
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
    await writeAuditLog({
      userId: user.id,
      action: 'inspection:create',
      module: 'inspections',
      details: {
        purpose: `Record ${result} inspection by ${inspectorName}`,
        summary: remarks || `Delivery ${deliveryId.slice(0, 8).toUpperCase()} inspected — ${result}`,
        reference_id: deliveryId,
        result,
      },
    })
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
  account_title: string | null
  recipient_role: string | null
  recipient_name: string | null
  received_by: string | null
  logged_by_name: string | null
  created_at: string | null
  items: DeliveryDetailItem[]
}

export async function getDeliveryDetails(
  deliveryId: string
): Promise<DeliveryDetails> {
  try {
    const delivery = await prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: {
        items: { orderBy: { created_at: 'asc' } },
      },
    })

    if (!delivery) notFound()

    let loggedByName: string | null = null
    try {
      if (delivery.received_by) {
        const profile = await prisma.profile.findUnique({
          where: { id: delivery.received_by },
          select: { full_name: true },
        })
        loggedByName = profile?.full_name ?? null
      }
    } catch {
      loggedByName = null
    }

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
      account_title: delivery.account_title,
      recipient_role: delivery.recipient_role,
      recipient_name: delivery.recipient_name,
      received_by: delivery.received_by ?? null,
      logged_by_name: loggedByName,
      created_at: delivery.created_at?.toISOString() ?? null,
      items: delivery.items.map((item) => ({
        id: item.id,
        item_name: item.item_name,
        unit: item.unit,
        quantity: item.quantity,
        unit_cost: item.unit_cost ? Number(item.unit_cost) : null,
      })),
    }
  } catch (e) {
    console.error('[getDeliveryDetails]', e)
    notFound()
  }
}

export interface DeliveryFormCode {
  code: string
  assetType: string
  accountTitle: string
}

export interface DeliveryFormOptions {
  assetTypes: string[]
  accountTitles: string[]
  codes: DeliveryFormCode[]
}

/**
 * Chart-of-accounts options for the Log delivery form, sourced from the
 * Super Admin–managed account catalog (strict mode). Each account code maps
 * to exactly one asset type + title, so picking a code auto-fills the other
 * two fields. No custom codes — unknown codes must be added in Master Data.
 */
export async function getDeliveryFormOptions(): Promise<DeliveryFormOptions> {
  const empty: DeliveryFormOptions = { assetTypes: [], accountTitles: [], codes: [] }
  try {
    const entries = await getActiveCatalogEntries()
    const codes: DeliveryFormCode[] = entries.map((e) => ({
      code: e.code,
      assetType: e.type,
      accountTitle: e.title,
    }))
    const assetTypes = [...new Set(codes.map((c) => c.assetType).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b)
    )
    const accountTitles = [...new Set(codes.map((c) => c.accountTitle).filter(Boolean))].sort(
      (a, b) => a.localeCompare(b)
    )
    return { assetTypes, accountTitles, codes }
  } catch (e) {
    console.error('[getDeliveryFormOptions]', e)
    return empty
  }
}
