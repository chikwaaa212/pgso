'use server'

import { revalidatePath as nextRevalidatePath } from 'next/cache'

// Every Next.js revalidation also busts the Upstash personnel cache so
// Redis never serves stale lists after a write (fire-and-forget).
// Narrow: delivery writes touch deliveries/inspections/dashboard only.
function revalidatePath(path: string) {
  nextRevalidatePath(path)
  void import('@/lib/personnel-cache')
    .then((m) => m.bustPersonnelScopes(['deliveries', 'inspections', 'dashboard', 'documents']))
    .catch(() => {})
}
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import prisma from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { getPersonnelScope } from '@/lib/personnel-scope'
import { withIdempotency } from '@/lib/idempotency'
import { writeAuditLog } from '@/lib/audit'
import { inspectionHref } from '@/lib/inspection-ref'
import { stockInspectionItems } from '@/lib/stock'
import { getActiveCatalogEntries, resolveUnitName } from '@/lib/master-data'
import { ACCOUNT_CODE_PREFIX, nextAccountCode, type AccountCodeKind } from '@/lib/account-code'
import type { SignupState } from '@/types'

const deliveryKinds = ['stock', 'asset'] as const
const inspectionResults = ['passed', 'failed'] as const

interface ItemInput {
  description?: string
  units?: string
  quantity?: string | number
  unitCost?: string | number
}

/**
 * Allocate the next system account code for a delivery kind. New codes follow
 * the AST/STK template; legacy catalog-style codes are ignored by the scan.
 */
export async function generateAccountCode(
  kind: AccountCodeKind
): Promise<{ code: string } | { error: string }> {
  const prefix = ACCOUNT_CODE_PREFIX[kind]
  try {
    const rows = await prisma.delivery.findMany({
      where: { account_code: { startsWith: `${prefix}-`, mode: 'insensitive' } },
      select: { account_code: true },
    })
    return { code: nextAccountCode(kind, rows.map((row) => row.account_code)) }
  } catch (e) {
    console.error('[generateAccountCode]', e)
    return { error: 'Could not generate an account code. Please try again.' }
  }
}

// System-generated PO reference (PGSO-XXXX-XXXX). Personnel never type it.
const PO_REFERENCE_PATTERN = /^PGSO-[A-Z0-9]{4}-[A-Z0-9]{4}$/

function makePoReference(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const block = () =>
    Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  return `PGSO-${block()}-${block()}`
}

/** Calendar day (YYYY-MM-DD) in Manila — date-only columns compare safely. */
function manilaDateKey(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(d)
}

/**
 * Arrival is logged on the day the delivery is recorded, so the arrival date
 * is always the current Manila day. Returned as a UTC-midnight Date so the
 * `@db.Date` column stores that calendar day without shifting.
 */
function todayArrivalDate(): Date {
  return new Date(manilaDateKey(new Date()))
}

export async function logDelivery(
  _prevState: SignupState,
  formData: FormData
): Promise<SignupState> {
  const assetTypeRaw = (formData.get('assetType') as string)?.trim()
  const stockTypeRaw = (formData.get('stockType') as string)?.trim()
  const accountTitleRaw = (formData.get('accountTitle') as string)?.trim()
  const deliveryKind = (formData.get('deliveryKind') as string)?.trim()?.toLowerCase()
  const dateSupplied = formData.get('dateSupplied') as string
  const supplierName = (formData.get('supplierName') as string)?.trim()
  let poReference = (formData.get('poReference') as string)?.trim()?.toUpperCase() || ''
  if (!PO_REFERENCE_PATTERN.test(poReference)) {
    poReference = makePoReference()
  }
  const recipientRole = (formData.get('recipientRole') as string)?.trim()
  const recipientName = (formData.get('recipientName') as string)?.trim()

  if (!deliveryKinds.includes(deliveryKind as (typeof deliveryKinds)[number])) {
    return { error: 'Choose whether this delivery is for Stocks or Assets.' }
  }

  // Account codes are system-owned: AST-xxx-xx-xx for assets and
  // STK-xxx-xx-xx for stocks. The submitted value is ignored.
  const generatedCode = await generateAccountCode(
    deliveryKind === 'stock' ? 'stock' : 'asset'
  )
  if ('error' in generatedCode) return { error: generatedCode.error }
  const accountCode = generatedCode.code

  // Assets are catalog-driven (title → type); stocks are header-driven
  // (code + title + type all come from Super Admin → Master Data → Stock
  // headers). The server re-derives every value from the matched row so a
  // stale/tampered hidden field can never store a mismatched triple.
  const assetTypeInput = (assetTypeRaw || '').trim()
  const accountTitleInput = (accountTitleRaw || '').trim()
  let accountTitleCanon = ''
  let assetTypeCanon: string | null = null
  let stockTypeCanon: string | null = null

  if (deliveryKind === 'stock') {
    const activeStockHeaders = await prisma.stockType.findMany({
      where: { status: 'active', deleted_at: null },
      select: { name: true, account_code: true, account_title: true, asset_type: true },
    })
    if (activeStockHeaders.length === 0) {
      return { error: 'No active stock headers — ask your Super Admin to add them in Master Data.' }
    }
    if (!stockTypeRaw) {
      return { error: 'Choose a stock type from Master Data.' }
    }
    const titleNorm = accountTitleInput.toLowerCase()
    const typeNorm = stockTypeRaw.trim().toLowerCase()
    // Stock title + type must match one active stock header. The code is
    // owned by that header (canonicalized below).
    const header = activeStockHeaders.find((h) => {
      const hTitle = (h.account_title ?? h.name).trim().toLowerCase()
      const hType = (h.asset_type ?? h.name).trim().toLowerCase()
      return hTitle === titleNorm && hType === typeNorm
    })
    if (!header) {
      return {
        error: 'Pick a stock title and stock type that match a stock header in Master Data.',
      }
    }
    accountTitleCanon = header.account_title ?? header.name
    stockTypeCanon = header.asset_type ?? header.name
  } else {
    if (!accountTitleInput) {
      return { error: 'Select an account title from the catalog.' }
    }
    // Catalog convention: titles stored uppercase.
    const accountTitleNorm = accountTitleInput.toUpperCase()
    const catalogEntries = await getActiveCatalogEntries()
    if (catalogEntries.length === 0) {
      return { error: 'No active catalog entries — ask your Super Admin to add them in Master Data.' }
    }
    const titleMatches = catalogEntries.filter(
      (e) => e.title.toUpperCase() === accountTitleNorm
    )
    if (titleMatches.length === 0) {
      return { error: 'Unknown account title — pick one from the catalog.' }
    }
    accountTitleCanon = titleMatches[0].title

    // A title normally maps to one asset type. If the catalog has it on rows
    // with different types, accept the submitted type only when it is one of
    // them; otherwise fall back to the first (the form auto-selects it).
    const titleTypes = [
      ...new Map(
        titleMatches.map((e) => [e.type.trim().toLowerCase(), e.type.trim()])
      ).values(),
    ].filter(Boolean)
    assetTypeCanon = titleTypes[0] ?? null
    if (assetTypeInput) {
      const submitted = titleTypes.find(
        (t) => t.toLowerCase() === assetTypeInput.toLowerCase()
      )
      if (submitted) assetTypeCanon = submitted
    }
    if (!assetTypeCanon) {
      return { error: 'This account title has no asset type — ask your Super Admin to update Master Data.' }
    }
  }

  // Deliveries are logged as an arrival: the arrival date is the current day
  // in Manila. The inspection verdict is recorded later, not at log time.
  if (!supplierName) {
    return { error: 'Supplier is required.' }
  }

  if (!poReference) {
    return { error: 'PO reference is required.' }
  }

  // Recipient is an active PGSO personnel account picked by name (no free-text
  // role/name entry). Re-check the roster server-side so a tampered field can
  // never credit a non-personnel or inactive account.
  if (recipientRole !== 'PGSO Personnel' || !recipientName) {
    return { error: 'Select an active PGSO personnel account as the recipient.' }
  }
  const recipientProfile = await prisma.profile.findFirst({
    where: {
      status: 'active',
      role: 'pgso_personnel',
      full_name: { equals: recipientName, mode: 'insensitive' },
    },
    select: { full_name: true },
  })
  if (!recipientProfile) {
    return { error: 'Select an active PGSO personnel account as the recipient.' }
  }
  const recipientNameCanon = recipientProfile.full_name ?? recipientName

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

  const { getPersonnelScope } = await import('@/lib/personnel-scope')
  const scope = await getPersonnelScope()
  const user = scope.userId ? ({ id: scope.userId } as { id: string }) : null

  if (!user) {
    return { error: 'You must be signed in to log a delivery.' }
  }

  // Only active personnel and super admins may log deliveries. Employees and
  // inactive accounts fail closed even if they reach the action directly.
  if (!scope.isPersonnel) {
    return { error: 'You do not have permission to log deliveries.' }
  }

  try {
    const outcome = await withIdempotency(
      formData.get('idempotencyKey') as string,
      'delivery:create',
      async () => {
        // No catalog auto-seed: the account code is free-form per delivery and
        // stays on the delivery row only. Asset type was derived from the
        // selected account title above; store canonical catalog values.
        const delivery = await prisma.delivery.create({
          data: {
            supplier: supplierName,
            po_reference: poReference,
            // Logging is an arrival event: when the optional supply date is
            // blank, use the same Manila "today" as expected_arrival_date so
            // the delivery date is never silently lost.
            date_delivered:
              dateSupplied && !Number.isNaN(Date.parse(dateSupplied))
                ? new Date(dateSupplied)
                : todayArrivalDate(),
            expected_arrival_date: todayArrivalDate(),
            delivery_kind: deliveryKind,
            delivery_status: 'arrival',
            inspection_status: 'pending',
            received_by: user.id,
            recipient_role: recipientRole,
            recipient_name: recipientNameCanon,
            asset_type: assetTypeCanon,
            stock_type: stockTypeCanon,
            account_code: accountCode,
            account_title: accountTitleCanon,
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
    if (scope.isSuperAdmin) {
      revalidatePath('/super-admin/deliveries')
      revalidatePath('/super-admin/dashboard')
    }
    await writeAuditLog({
      userId: user.id,
      action: 'delivery:create',
      module: 'deliveries',
      details: {
        purpose: `Log delivery from ${supplierName}`,
        summary: `PO ${poReference} · ${parsedItems.length} item(s) · arrival · ${deliveryKind}`,
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

/**
 * Edit a delivery log while it is still pending (not yet inspected). The log
 * stepper is reused as an edit form, so every field it shows is writable:
 * kind, code/title/type, supplier, PO reference, dates, recipient, and items.
 * Only the owner may edit, and the record locks once an inspection exists —
 * outcomes snapshot the values, so later edits would desync the trail.
 */
export async function updateDelivery(
  _prevState: SignupState,
  formData: FormData
): Promise<SignupState> {
  const deliveryId = (formData.get('deliveryId') as string)?.trim()
  const deliveryKind = (formData.get('deliveryKind') as string)?.trim()?.toLowerCase()
  const assetTypeRaw = (formData.get('assetType') as string)?.trim()
  const stockTypeRaw = (formData.get('stockType') as string)?.trim()
  const accountTitleRaw = (formData.get('accountTitle') as string)?.trim()
  const supplierName = (formData.get('supplierName') as string)?.trim()
  const poReference = (formData.get('poReference') as string)?.trim()?.toUpperCase() || ''
  const dateSupplied = (formData.get('dateSupplied') as string)?.trim()
  const expectedArrival = (formData.get('expectedArrival') as string)?.trim()
  const recipientRole = (formData.get('recipientRole') as string)?.trim()
  const recipientName = (formData.get('recipientName') as string)?.trim()

  if (!deliveryId) {
    return { error: 'Delivery ID is required.' }
  }

  if (!deliveryKinds.includes(deliveryKind as (typeof deliveryKinds)[number])) {
    return { error: 'Choose whether this delivery is for Stocks or Assets.' }
  }

  // Account codes are system-owned and never edited. The stored code is kept
  // as-is; only a legacy row with no code gets a new AST/STK sequence.
  // Re-derive the canonical title/type triple from Master Data so a stale or
  // tampered hidden field can never store a mismatched combination.
  let accountTitleCanon = ''
  let assetTypeCanon: string | null = null
  let stockTypeCanon: string | null = null

  if (deliveryKind === 'stock') {
    const activeStockHeaders = await prisma.stockType.findMany({
      where: { status: 'active', deleted_at: null },
      select: { name: true, account_code: true, account_title: true, asset_type: true },
    })
    if (activeStockHeaders.length === 0) {
      return { error: 'No active stock headers — ask your Super Admin to add them in Master Data.' }
    }
    if (!stockTypeRaw) {
      return { error: 'Choose a stock type from Master Data.' }
    }
    const header = activeStockHeaders.find((h) => {
      const hTitle = (h.account_title ?? h.name).trim().toLowerCase()
      const hType = (h.asset_type ?? h.name).trim().toLowerCase()
      return (
        hTitle === (accountTitleRaw || '').toLowerCase() &&
        hType === stockTypeRaw.toLowerCase()
      )
    })
    if (!header) {
      return {
        error: 'Pick a stock title and stock type that match a stock header in Master Data.',
      }
    }
    accountTitleCanon = header.account_title ?? header.name
    stockTypeCanon = header.asset_type ?? header.name
  } else {
    if (!accountTitleRaw) {
      return { error: 'Select an account title from the catalog.' }
    }
    const accountTitleNorm = accountTitleRaw.toUpperCase()
    const catalogEntries = await getActiveCatalogEntries()
    if (catalogEntries.length === 0) {
      return { error: 'No active catalog entries — ask your Super Admin to add them in Master Data.' }
    }
    const titleMatches = catalogEntries.filter(
      (e) => e.title.toUpperCase() === accountTitleNorm
    )
    if (titleMatches.length === 0) {
      return { error: 'Unknown account title — pick one from the catalog.' }
    }
    accountTitleCanon = titleMatches[0].title

    const titleTypes = [
      ...new Map(
        titleMatches.map((e) => [e.type.trim().toLowerCase(), e.type.trim()])
      ).values(),
    ].filter(Boolean)
    assetTypeCanon = titleTypes[0] ?? null
    if (assetTypeRaw) {
      const submitted = titleTypes.find(
        (t) => t.toLowerCase() === assetTypeRaw.toLowerCase()
      )
      if (submitted) assetTypeCanon = submitted
    }
    if (!assetTypeCanon) {
      return { error: 'This account title has no asset type — ask your Super Admin to update Master Data.' }
    }
  }

  if (!supplierName) {
    return { error: 'Supplier is required.' }
  }

  if (!PO_REFERENCE_PATTERN.test(poReference)) {
    return { error: 'PO reference must look like PGSO-XXXX-XXXX.' }
  }

  // Arrival date has no target/input — it is the day the delivery arrived
  // (today). Legacy rows keep their stored date so history stays accurate.
  const arrivalDate =
    expectedArrival && !Number.isNaN(Date.parse(expectedArrival))
      ? new Date(expectedArrival)
      : todayArrivalDate()

  if (dateSupplied && Number.isNaN(Date.parse(dateSupplied))) {
    return { error: 'Date supplied is not a valid date.' }
  }

  if (recipientRole !== 'PGSO Personnel' || !recipientName) {
    return { error: 'Select an active PGSO personnel account as the recipient.' }
  }
  const recipientProfile = await prisma.profile.findFirst({
    where: {
      status: 'active',
      role: 'pgso_personnel',
      full_name: { equals: recipientName, mode: 'insensitive' },
    },
    select: { full_name: true },
  })
  if (!recipientProfile) {
    return { error: 'Select an active PGSO personnel account as the recipient.' }
  }
  const recipientNameCanon = recipientProfile.full_name ?? recipientName

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

  const scope = await getPersonnelScope()
  const user = scope.userId ? ({ id: scope.userId } as { id: string }) : null

  if (!user) {
    return { error: 'You must be signed in to edit a delivery.' }
  }

  // Super admins have read-only oversight of deliveries.
  if (scope.isSuperAdmin) {
    return { error: 'Super admins have read-only access to deliveries.' }
  }

  try {
    const existing = await prisma.delivery.findUnique({
      where: { id: deliveryId },
      select: { received_by: true, inspection_status: true, account_code: true },
    })

    if (!existing) {
      return { error: 'Delivery not found.' }
    }

    // Own-data only: you can only edit deliveries you logged.
    if (existing.received_by !== user.id) {
      return { error: 'You can only edit your own logged deliveries.' }
    }

    if (existing.inspection_status !== 'pending') {
      return { error: 'Only deliveries still pending inspection can be edited.' }
    }

    // Keep the stored system code. Legacy rows without one get a fresh code
    // for their kind so every delivery traces back to an AST/STK sequence.
    let accountCode = (existing.account_code ?? '').trim()
    if (!accountCode) {
      const generatedCode = await generateAccountCode(
        deliveryKind === 'stock' ? 'stock' : 'asset'
      )
      if ('error' in generatedCode) return { error: generatedCode.error }
      accountCode = generatedCode.code
    }

    await prisma.$transaction(async (tx) => {
      const updated = await tx.delivery.updateMany({
        where: { id: deliveryId, inspection_status: 'pending' },
        data: {
          delivery_kind: deliveryKind,
          account_code: accountCode,
          account_title: accountTitleCanon,
          asset_type: assetTypeCanon,
          stock_type: stockTypeCanon,
          supplier: supplierName,
          po_reference: poReference,
          date_delivered: dateSupplied ? new Date(dateSupplied) : null,
          expected_arrival_date: arrivalDate,
          recipient_role: recipientRole,
          recipient_name: recipientNameCanon,
        },
      })
      if (updated.count === 0) {
        throw new Error('This delivery can no longer be edited.')
      }

      // Replace item lines — pending inspections have no stocked quantities yet.
      await tx.deliveryItem.deleteMany({ where: { delivery_id: deliveryId } })
      await tx.deliveryItem.createMany({
        data: parsedItems.map((item) => ({
          delivery_id: deliveryId,
          item_name: item.description,
          unit: item.unit,
          quantity: item.quantity,
          unit_cost: item.costRaw ? item.costRaw : null,
        })),
      })
    })

    revalidatePath('/personnel/deliveries')
    revalidatePath('/personnel/dashboard')
    // Also drop the per-delivery receipt cache so the next open shows edits.
    const { bustPersonnelScopes } = await import('@/lib/personnel-cache')
    void bustPersonnelScopes(['deliveries'])
    await writeAuditLog({
      userId: user.id,
      action: 'delivery:update',
      module: 'deliveries',
      details: {
        purpose: `Edit pending delivery from ${supplierName}`,
        summary: `PO ${poReference} · ${parsedItems.length} item(s) · ${deliveryKind}`,
        reference_id: deliveryId,
        supplier: supplierName,
        po_reference: poReference,
      },
    })
    return { success: true, deliveryId }
  } catch (e) {
    console.error('[updateDelivery]', e)
    return { error: 'Failed to update delivery. Please try again.' }
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

  // Documentary photos (optional, max 5): uploaded client-side to the same
  // storage bucket as IAR scans; the form submits their public URLs here.
  // URLs must be https storage links from this project — never arbitrary
  // external images (admin renders them).
  const MAX_INSPECTION_PHOTOS = 5
  let photoUrls: string[] = []
  try {
    const photosRaw = (formData.get('photoUrlsJson') as string) || '[]'
    const parsedPhotos: unknown = JSON.parse(photosRaw)
    if (!Array.isArray(parsedPhotos)) {
      return { error: 'Invalid photos payload.' }
    }
    photoUrls = [
      ...new Set(
        parsedPhotos
          .filter((u): u is string => typeof u === 'string')
          .map((u) => u.trim())
          .filter(Boolean)
      ),
    ]
  } catch {
    return { error: 'Invalid photos payload.' }
  }
  if (photoUrls.length > MAX_INSPECTION_PHOTOS) {
    return { error: `Attach at most ${MAX_INSPECTION_PHOTOS} documentary photos.` }
  }
  const supabaseHost = (() => {
    try {
      const raw = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
      return raw ? new URL(raw).hostname : null
    } catch {
      return null
    }
  })()
  for (const url of photoUrls) {
    if (url.length > 2048 || !url.startsWith('https://')) {
      return { error: 'Documentary photos must be uploaded images (https URL).' }
    }
    if (supabaseHost) {
      try {
        if (new URL(url).hostname !== supabaseHost) {
          return { error: 'Documentary photos must come from an upload in this form.' }
        }
      } catch {
        return { error: 'Documentary photos contain an invalid URL.' }
      }
    }
  }

  const { getPersonnelScope: getScopeForInspection } = await import('@/lib/personnel-scope')
  const inspectionScope = await getScopeForInspection()
  const user = inspectionScope.userId ? ({ id: inspectionScope.userId } as { id: string }) : null

  if (!user) {
    return { error: 'You must be signed in to record an inspection.' }
  }

  try {
    const exists = await prisma.delivery.findUnique({
      where: { id: deliveryId },
      select: {
        id: true,
        inspection_status: true,
        received_by: true,
        expected_arrival_date: true,
      },
    })

    if (!exists) {
      return { error: 'Delivery not found.' }
    }

    // Own-data only: you can only inspect deliveries you logged. This applies
    // to super admins too — admin-logged deliveries stay processable by them,
    // while other personnel's records stay read-only in the admin UI.
    if (exists.received_by !== user.id) {
      return { error: 'You can only inspect your own logged deliveries.' }
    }

    // Legacy rows logged with a future target date still gate inspection —
    // today's arrivals are inspectable immediately.
    if (exists.expected_arrival_date) {
      if (manilaDateKey(exists.expected_arrival_date) > manilaDateKey(new Date())) {
        return {
          error:
            'This delivery has not arrived yet — inspect it on or after its arrival date.',
        }
      }
    }

    // Legacy partial rows stay re-inspectable so old deliveries can still be
    // completed; new inspections may only be passed or returned.
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

        // Documentary photos ride along as inspection documents (same table
        // the admin oversight views read) — no catalog or schema change.
        // Runs inside the idempotency closure, so retries never duplicate.
        if (photoUrls.length > 0) {
          const stamp = Date.now().toString(36).toUpperCase()
          await prisma.document.createMany({
            data: photoUrls.map((file_url, i) => ({
              document_type: 'INSPECTION_PHOTO',
              reference_number: `INSP-PHOTO-${inspection.id.slice(0, 8).toUpperCase()}-${stamp}-${i}`,
              related_inspection_id: inspection.id,
              related_delivery_id: deliveryId,
              file_url,
              status: 'attached',
              prepared_by: user.id,
            })),
          })
        }

        return { inspectionId: inspection.id }
      }
    ).then(async (outcome) => {
      // Passed + already has an AIR (e.g. re-inspection) → move the
      // remaining received items to stock. Never fails the save; idempotent.
      let stockWarning: string | undefined
      try {
        const res = await stockInspectionItems(outcome.result.inspectionId)
        if (res.stocked) revalidatePath('/personnel/stocks')
      } catch (e) {
        console.error('[recordInspection:stock]', e)
        stockWarning =
          'Inspection saved, but moving items to stocks failed. Use “Sync from inspections” on the Stocks page.'
      }
      return { stockWarning }
    })

    revalidatePath('/personnel/deliveries')
    revalidatePath('/personnel/inspections')
    revalidatePath(inspectionHref(deliveryId))
    revalidatePath('/personnel/dashboard')
    if (inspectionScope.isSuperAdmin) {
      revalidatePath('/super-admin/deliveries')
      revalidatePath('/super-admin/inspections')
      revalidatePath('/super-admin/dashboard')
    }
    await writeAuditLog({
      userId: user.id,
      action: 'inspection:create',
      module: 'inspections',
      details: {
        purpose: `Record ${result} inspection by ${inspectorName}`,
        summary: remarks || `Delivery ${deliveryId.slice(0, 8).toUpperCase()} inspected — ${result}`,
        reference_id: deliveryId,
        result,
        photos: photoUrls.length,
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
  expected_arrival_date: string | null
  delivery_kind: string | null
  delivery_status: string | null
  inspection_status: string | null
  asset_type: string | null
  stock_type: string | null
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
    // Per-delivery Redis cache (30s, per-user) — receipt revisits are
    // cache hits. Busted automatically by bustPersonnelCache() on writes.
    const { withScopedCache } = await import('@/lib/personnel-cache')
    return await withScopedCache(
      'personnel:delivery-detail',
      30,
      async () => {
    const scope = await getPersonnelScope()
    // Fail closed: signed-out callers see nothing (previously fell through
    // to the unfiltered row, costs included).
    if (scope.isEmpty || !scope.userId) notFound()
    const delivery = await prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: {
        items: { orderBy: { created_at: 'asc' } },
        inspections: { select: { inspector_id: true }, take: 5 },
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
      expected_arrival_date: delivery.expected_arrival_date?.toISOString().slice(0, 10) ?? null,
      delivery_kind: delivery.delivery_kind,
      delivery_status: delivery.delivery_status,
      inspection_status: delivery.inspection_status,
      asset_type: delivery.asset_type,
      stock_type: delivery.stock_type,
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
      },
      { id: deliveryId }
    )
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

/** One active stock header from Super Admin → Master Data. */
export interface DeliveryFormStockHeader {
  code: string
  title: string
  type: string
}

export interface DeliveryFormOptions {
  assetTypes: string[]
  /**
   * Active stock headers. Every stock detail (code, title, type) is picked
   * from these rows — not from the asset catalog.
   */
  stockHeaders: DeliveryFormStockHeader[]
  accountTitles: string[]
  codes: DeliveryFormCode[]
  /**
   * Uppercased account title → distinct catalog asset types. Used by the form
   * to auto-fill Asset Type as soon as an Account Title is picked.
   */
  accountTitleTypes: Record<string, string[]>
}

/** Active PGSO personnel account shown in the Recipient step. */
export interface PersonnelRecipient {
  id: string
  name: string
  position: string | null
  office: string | null
}

/**
 * System accounts that can receive a delivery. Reads the live profile roster so
 * the picker always matches Super Admin → Users (active PGSO personnel only).
 */
export async function getPersonnelRecipients(): Promise<PersonnelRecipient[]> {
  try {
    const scope = await getPersonnelScope()
    if (scope.isEmpty) return []
    const rows = await prisma.profile.findMany({
      where: { status: 'active', role: 'pgso_personnel' },
      orderBy: { full_name: 'asc' },
      select: { id: true, full_name: true, position: true, office: true },
    })
    return rows.flatMap((r) =>
      r.full_name
        ? [
            {
              id: r.id,
              name: r.full_name,
              position: r.position,
              office: r.office,
            },
          ]
        : []
    )
  } catch (e) {
    console.error('[getPersonnelRecipients]', e)
    return []
  }
}

/**
 * Cached deliveries log for /personnel/deliveries.
 * Per-user scoped (own rows only; super_admin sees all) — 30s TTL like the
 * inspections list. Busted automatically by bustPersonnelCache() on any write.
 */
export interface CachedDeliveryRow {
  id: string;
  supplier: string | null;
  po_reference: string | null;
  date_delivered: string | null;
  expected_arrival_date: string | null;
  /** When the delivery record was logged (shown in the log's Date column). */
  logged_at: string | null;
  /** Display name of the account that logged the record (admin lists). */
  logged_by: string | null;
  delivery_kind: string | null;
  delivery_status: string | null;
  inspection_status: string | null;
  item_count: number;
}

export interface DeliveriesPageOpts {
  page?: number
  pageSize?: number
  q?: string
  status?: string
}

export async function getDeliveriesList(): Promise<CachedDeliveryRow[]> {
  const { rows } = await getDeliveriesPage({ page: 1, pageSize: 500 })
  return rows
}

export async function getDeliveriesPage(
  opts: DeliveriesPageOpts = {}
): Promise<{ rows: CachedDeliveryRow[]; total: number }> {
  const { withScopedCache } = await import('@/lib/personnel-cache')
  const page = Math.floor(Number(opts.page)) >= 1 ? Math.min(Math.floor(Number(opts.page)), 1000) : 1
  const pageSize = Number.isFinite(Number(opts.pageSize))
    ? Math.min(Math.max(Math.floor(Number(opts.pageSize)), 1), 100)
    : 10
  const q = (opts.q ?? '').trim().slice(0, 120)
  const status = (opts.status ?? 'all').trim()
  return withScopedCache('personnel:deliveries-list', 30, async () => {
    try {
      const scope = await getPersonnelScope()
      if (scope.isEmpty || !scope.userId) return { rows: [], total: 0 }
      const where: Record<string, unknown> = scope.isSuperAdmin ? {} : { received_by: scope.userId }
      // UI status terms (Arrival/Complete/Partial/Awaiting) map to delivery_status.
      if (status !== 'all') {
        const mapped =
          status.toLowerCase() === 'complete'
            ? 'complete'
            : status.toLowerCase() === 'partial'
              ? 'partial'
              : status.toLowerCase().startsWith('awaiting')
                ? 'awaiting'
                : status.toLowerCase().startsWith('arrival') || status.toLowerCase() === 'arrived'
                  ? 'arrival'
                  : status
        ;(where as Record<string, string>).delivery_status = mapped
      }
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
            expected_arrival_date: true,
            created_at: true,
            received_by: true,
            delivery_kind: true,
            delivery_status: true,
            inspection_status: true,
            _count: { select: { items: true } },
          },
        }),
      ])
      // Super-admin oversight lists attribute each row to the account that
      // logged it. Resolve names in one batch instead of per row.
      let loggedById = new Map<string, string>()
      if (scope.isSuperAdmin) {
        const ids = [
          ...new Set(
            deliveries
              .map((d) => d.received_by)
              .filter((v): v is string => Boolean(v))
          ),
        ]
        if (ids.length > 0) {
          const profiles = await prisma.profile.findMany({
            where: { id: { in: ids } },
            select: { id: true, full_name: true },
          })
          loggedById = new Map(
            profiles.map((p) => [p.id, p.full_name ?? 'Unknown'])
          )
        }
      }
      return {
        total,
        rows: deliveries.map((d) => ({
          id: d.id,
          supplier: d.supplier,
          po_reference: d.po_reference,
          date_delivered: d.date_delivered?.toISOString() ?? null,
          expected_arrival_date: d.expected_arrival_date?.toISOString() ?? null,
          logged_at: d.created_at?.toISOString() ?? null,
          logged_by: d.received_by
            ? (loggedById.get(d.received_by) ?? null)
            : null,
          delivery_kind: d.delivery_kind,
          delivery_status: d.delivery_status,
          inspection_status: d.inspection_status,
          item_count: d._count.items,
        })),
      }
    } catch (e) {
      console.error('[getDeliveriesList]', e)
      return { rows: [], total: 0 }
    }
  }, { page, pageSize, q, status })
}

/**
 * Catalog options for the Log delivery form, sourced from the active account
 * catalog. Account title is a strict dropdown; asset type is auto-filled from
 * the chosen title (accountTitleTypes). Account codes are system-generated
 * (AST/STK) and are not chosen here.
 */
export async function getDeliveryFormOptions(): Promise<DeliveryFormOptions> {
  const { withCache, cacheKey } = await import('@/lib/personnel-cache')
  return withCache(cacheKey('personnel:delivery-form-options'), 300, async () => {
  const empty: DeliveryFormOptions = {
    assetTypes: [],
    stockHeaders: [],
    accountTitles: [],
    codes: [],
    accountTitleTypes: {},
  }
  try {
    const [entries, stockHeaderRows] = await Promise.all([
      getActiveCatalogEntries(),
      prisma.stockType.findMany({
        where: { status: 'active', deleted_at: null },
        select: { name: true, account_code: true, account_title: true, asset_type: true },
        orderBy: { account_code: 'asc' },
      }),
    ])
    const stockHeaders: DeliveryFormStockHeader[] = stockHeaderRows
      .map((s) => ({
        code: (s.account_code ?? s.name).trim(),
        title: (s.account_title ?? s.name).trim(),
        type: (s.asset_type ?? s.name).trim(),
      }))
      .filter((s) => s.code && s.title && s.type)
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
    // Title drives Asset Type. A title can (rarely) appear on more than one
    // catalog row with different types, so keep every distinct type.
    const accountTitleTypes: Record<string, string[]> = {}
    for (const c of codes) {
      const title = c.accountTitle?.trim().toUpperCase()
      const type = c.assetType?.trim()
      if (!title || !type) continue
      const list = accountTitleTypes[title] ?? []
      if (!list.some((t) => t.toLowerCase() === type.toLowerCase())) list.push(type)
      accountTitleTypes[title] = list
    }
    for (const title of Object.keys(accountTitleTypes)) {
      accountTitleTypes[title].sort((a, b) => a.localeCompare(b))
    }
    return { assetTypes, stockHeaders, accountTitles, codes, accountTitleTypes }
  } catch (e) {
    console.error('[getDeliveryFormOptions]', e)
    return empty
  }
  })
}
