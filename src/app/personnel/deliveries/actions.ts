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
import { stockInspectionItems } from '@/lib/stock'
import { getActiveCatalogEntries, resolveUnitName } from '@/lib/master-data'
import type { SignupState } from '@/types'

const statuses = ['complete', 'partial', 'awaiting'] as const
const deliveryKinds = ['stock', 'asset'] as const
const inspectionResults = ['passed', 'partial'] as const
const recipientRoles = ['Employee', 'PGSO Personnel'] as const

interface ItemInput {
  description?: string
  units?: string
  quantity?: string | number
  unitCost?: string | number
}

// Server-side fallback for the Generate button (the form normally fills the
// code client-side). Kept so an empty code + explicit auto-generate request
// still yields a provisional unique code.
function makeProvisionalCode(kind: string): string {
  const prefix = kind === 'asset' ? 'AST' : 'STK'
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, '0')
  return `${prefix}-${date}-${rand}`
}

export async function logDelivery(
  _prevState: SignupState,
  formData: FormData
): Promise<SignupState> {
  const accountCodeRaw = (formData.get('accountCode') as string)?.trim()
  const assetTypeRaw = (formData.get('assetType') as string)?.trim()
  const accountTitleRaw = (formData.get('accountTitle') as string)?.trim()
  const deliveryKind = (formData.get('deliveryKind') as string)?.trim()?.toLowerCase()
  const dateSupplied = formData.get('dateSupplied') as string
  const expectedArrival = formData.get('expectedArrival') as string
  const supplierName = (formData.get('supplierName') as string)?.trim()
  const poReference = (formData.get('poReference') as string)?.trim()
  const deliveryStatus = (
    formData.get('deliveryStatus') as string
  )?.toLowerCase()
  const recipientRole = (formData.get('recipientRole') as string)?.trim()
  const recipientName = (formData.get('recipientName') as string)?.trim()

  if (!deliveryKinds.includes(deliveryKind as (typeof deliveryKinds)[number])) {
    return { error: 'Choose whether this delivery is for Stocks or Assets.' }
  }

  // Account code is NOT from the catalog: personnel either types it or presses
  // Generate. Free-form identities per asset/stock (2–60 chars, limited
  // charset). No catalog existence check, no auto-seed.
  let accountCode = accountCodeRaw || ''
  // Empty code + explicit auto-generate request → provisional unique code.
  // The form's Generate button normally fills this client-side; this is the
  // server-side fallback so an empty code never blocks a save.
  if (!accountCode && (formData.get('autoGenerateCode') as string) === '1') {
    accountCode = makeProvisionalCode(deliveryKind)
  }
  if (!accountCode) {
    return { error: 'Account code is required — type a code or press Generate.' }
  }
  if (accountCode.length < 2 || accountCode.length > 60) {
    return { error: 'Account code must be 2–60 characters.' }
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9\-._/\s]*$/.test(accountCode)) {
    return { error: 'Account code may only contain letters, numbers, spaces, and - . _ /' }
  }

  // Asset type + account title ARE from the catalog (Super Admin Master Data):
  // dropdowns in the form, each validated independently here. No pair-match
  // requirement: any catalog-listed type combines with any catalog-listed
  // title. The account code itself is free-form.
  const assetTypeInput = (assetTypeRaw || '').trim()
  const accountTitleInput = (accountTitleRaw || '').trim()
  if (!assetTypeInput) {
    return { error: 'Select an asset type from the catalog.' }
  }
  if (!accountTitleInput) {
    return { error: 'Select an account title from the catalog.' }
  }
  // Catalog convention: titles stored uppercase.
  const accountTitleNorm = accountTitleInput.toUpperCase()
  const catalogEntries = await getActiveCatalogEntries()
  if (catalogEntries.length === 0) {
    return { error: 'No active catalog entries — ask your Super Admin to add them in Master Data.' }
  }
  const typeMatch = catalogEntries.find(
    (e) => e.type.toLowerCase() === assetTypeInput.toLowerCase()
  )
  if (!typeMatch) {
    return { error: 'Unknown asset type — pick one from the catalog.' }
  }
  const titleMatch = catalogEntries.find(
    (e) => e.title.toUpperCase() === accountTitleNorm
  )
  if (!titleMatch) {
    return { error: 'Unknown account title — pick one from the catalog.' }
  }
  // Canonical catalog values for storage.
  const assetTypeCanon = typeMatch.type
  const accountTitleCanon = titleMatch.title

  if (!dateSupplied || Number.isNaN(Date.parse(dateSupplied))) {
    // Waiting-for-arrival logs carry a target date instead of a received date.
    if (deliveryStatus !== 'awaiting') {
      return { error: 'A valid date received is required.' }
    }
  }

  if (deliveryStatus === 'awaiting' && (!expectedArrival || Number.isNaN(Date.parse(expectedArrival)))) {
    return { error: 'A target date of arrival is required for waiting arrivals.' }
  }

  if (expectedArrival && Number.isNaN(Date.parse(expectedArrival))) {
    return { error: 'The target date of arrival is not a valid date.' }
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

  const { getPersonnelScope } = await import('@/lib/personnel-scope')
  const scope = await getPersonnelScope()
  const user = scope.userId ? ({ id: scope.userId } as { id: string }) : null

  if (!user) {
    return { error: 'You must be signed in to log a delivery.' }
  }

  try {
    const outcome = await withIdempotency(
      formData.get('idempotencyKey') as string,
      'delivery:create',
      async () => {
        // No catalog auto-seed: the account code is free-form per delivery and
        // stays on the delivery row only. Asset type + account title were
        // already validated independently above; store canonical catalog
        // values.
        const delivery = await prisma.delivery.create({
          data: {
            supplier: supplierName,
            po_reference: poReference,
            date_delivered: dateSupplied && !Number.isNaN(Date.parse(dateSupplied)) ? new Date(dateSupplied) : null,
            expected_arrival_date: expectedArrival && !Number.isNaN(Date.parse(expectedArrival)) ? new Date(expectedArrival) : null,
            delivery_kind: deliveryKind,
            delivery_status: deliveryStatus,
            inspection_status: 'pending',
            received_by: user.id,
            recipient_role: recipientRole,
            recipient_name: recipientName || null,
            asset_type: assetTypeCanon,
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
    await writeAuditLog({
      userId: user.id,
      action: 'delivery:create',
      module: 'deliveries',
      details: {
        purpose: `Log delivery from ${supplierName}`,
        summary: `PO ${poReference} · ${parsedItems.length} item(s) · ${deliveryStatus} · ${deliveryKind}`,
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
      select: { id: true, inspection_status: true, received_by: true },
    })

    if (!exists) {
      return { error: 'Delivery not found.' }
    }

    // Own-data only: you can only inspect deliveries you logged.
    if (exists.received_by !== user.id) {
      return { error: 'You can only inspect your own logged deliveries.' }
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

export interface DeliveryFormOptions {
  assetTypes: string[]
  accountTitles: string[]
  codes: DeliveryFormCode[]
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
    : 20
  const q = (opts.q ?? '').trim().slice(0, 120)
  const status = (opts.status ?? 'all').trim()
  return withScopedCache('personnel:deliveries-list', 30, async () => {
    try {
      const scope = await getPersonnelScope()
      if (scope.isEmpty || !scope.userId) return { rows: [], total: 0 }
      const where: Record<string, unknown> = scope.isSuperAdmin ? {} : { received_by: scope.userId }
      // UI status terms (Complete/Partial/Awaiting arrival) map to delivery_status.
      if (status !== 'all') {
        const mapped =
          status.toLowerCase() === 'complete'
            ? 'complete'
            : status.toLowerCase() === 'partial'
              ? 'partial'
              : status.toLowerCase().startsWith('awaiting')
                ? 'awaiting'
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
            delivery_kind: true,
            delivery_status: true,
            inspection_status: true,
            _count: { select: { items: true } },
          },
        }),
      ])
      return {
        total,
        rows: deliveries.map((d) => ({
          id: d.id,
          supplier: d.supplier,
          po_reference: d.po_reference,
          date_delivered: d.date_delivered?.toISOString() ?? null,
          expected_arrival_date: d.expected_arrival_date?.toISOString() ?? null,
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
 * catalog. Asset type + account title are strict dropdowns, each validated
 * independently (no pair-match required). The account code is NOT from the
 * catalog — personnel types it or presses Generate. Codes listed here are
 * prior history for reference only.
 */
export async function getDeliveryFormOptions(): Promise<DeliveryFormOptions> {
  const { withCache, cacheKey } = await import('@/lib/personnel-cache')
  return withCache(cacheKey('personnel:delivery-form-options'), 300, async () => {
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
  })
}
