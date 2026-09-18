'use server'

import { revalidatePath } from 'next/cache'
import prisma from '@/lib/prisma'
import { requireEmployee } from '@/lib/auth-guard'
import {
  createRequest,
  getRequestFormOptions,
  getRequests,
  type RequestRow,
} from '@/app/personnel/requests/actions'
import type { IssuanceDetail } from '@/app/personnel/issuances/actions'

export interface MyAssetRow {
  id: string
  property_number: string | null
  qr_code: string | null
  account_code: string | null
  article: string | null
  description: string | null
  status: string | null
  condition: string | null
  location: string | null
  /** 'asset' = registry asset · 'stock' = consumable/stock lot from an issuance doc. */
  kind: 'asset' | 'stock'
  /**
   * How the item reached the employee: linked to an issuance doc filed
   * through a request, issued directly by personnel (no request), or a
   * registry assignment with no issuance doc on record.
   */
  source: 'registered' | 'request' | 'direct'
  quantity: number | null
  unit: string | null
  doc_no: string | null
  doc_type: string | null
  doc_date: string | null
}

export interface MyDocRow {
  id: string
  doc_type: string
  doc_no: string | null
  doc_date: string | null
  quantity: number
  asset_label: string | null
  downloadHref: string
}

interface MyIssuanceRaw {
  id: string
  doc_type: string
  doc_no: string | null
  doc_date: Date | string | null
  asset_id: string | null
  inventory_id: string | null
  employee_id?: string | null
  request_id: string | null
  quantity: number
  unit_cost?: unknown
  total_amount?: unknown
  issuance_data: Record<string, unknown> | null
  image_url?: string | null
  created_at: Date | string | null
  created_by?: string | null
}

interface IssuanceLineShape {
  label?: unknown
  description?: unknown
  unit?: unknown
  quantity?: unknown
  propertyNo?: unknown
  inventoryItemNo?: unknown
  assetId?: unknown
  inventoryId?: unknown
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null
}

/**
 * Assets currently assigned to the signed-in employee — PLUS every
 * stock/consumable lot issued to them.
 *
 * Registry assets flip `assigned_to` on issue, but stock issues only
 * decrement inventory (and consolidated multi-line docs null out the FK
 * columns), so a pure `assets WHERE assigned_to = me` query hides most of
 * what the employee actually received — especially direct (request-less)
 * assignments. We therefore union the registry rows with the employee's
 * issuance lines: lines already covered by a registry row are skipped,
 * everything else surfaces as a `stock` row tagged `request`/`direct`.
 */
export async function getMyAssets(): Promise<MyAssetRow[]> {
  let userId = ''
  try {
    ;({ userId } = await requireEmployee())
  } catch {
    return []
  }
  try {
    const [assets, docs] = await Promise.all([
      prisma.asset.findMany({
        where: { assigned_to: userId },
        orderBy: { account_code: 'asc' },
        select: {
          id: true,
          property_number: true,
          qr_code: true,
          account_code: true,
          article: true,
          description: true,
          status: true,
          condition: true,
          location: true,
        },
      }),
      // Raw SQL like the personnel issuance module (works even when the
      // generated client predates the issuance_records migration).
      prisma.$queryRaw<MyIssuanceRaw[]>`
        SELECT id::text AS id, doc_type, doc_no, doc_date,
               asset_id::text AS asset_id, inventory_id::text AS inventory_id,
               request_id::text AS request_id, quantity, issuance_data, created_at
        FROM issuance_records WHERE employee_id = ${userId}::uuid
        ORDER BY created_at DESC`,
    ])

    const assetIds = new Set(assets.map((a) => a.id))
    const docByAsset = new Map<string, MyIssuanceRaw>()
    const inventoryIds = new Set<string>()
    for (const d of docs) {
      if (d.asset_id && !docByAsset.has(d.asset_id)) docByAsset.set(d.asset_id, d)
      if (d.inventory_id) inventoryIds.add(d.inventory_id)
      const data = d.issuance_data as { lines?: unknown } | null
      if (data && Array.isArray(data.lines)) {
        for (const raw of data.lines as IssuanceLineShape[]) {
          if (typeof raw?.inventoryId === 'string' && raw.inventoryId)
            inventoryIds.add(raw.inventoryId)
        }
      }
    }
    const stocks = inventoryIds.size > 0
      ? await prisma.inventoryItem
          .findMany({
            where: { id: { in: [...inventoryIds] } },
            select: { id: true, item_name: true, account_code: true, unit: true },
          })
          .catch(() => [])
      : []
    const stockMap = new Map(stocks.map((s) => [s.id, s]))

    // Docs can reference registry assets that are no longer assigned to
    // this employee (reassigned away, seeded history). Resolve those for
    // labels so the row still reads as the real item, not "Issued item".
    const orphanAssetIds = new Set<string>()
    const lineAssetIdOf = (line: IssuanceLineShape): string | null =>
      typeof line.assetId === 'string' && line.assetId ? line.assetId : null
    for (const d of docs) {
      const data = d.issuance_data as { lines?: unknown } | null
      const rawLines = data && Array.isArray(data.lines) ? (data.lines as IssuanceLineShape[]) : null
      const ids =
        rawLines && rawLines.length > 0
          ? rawLines.map(lineAssetIdOf)
          : [d.asset_id]
      for (const id of ids) {
        if (id && !assetIds.has(id)) orphanAssetIds.add(id)
      }
    }
    const orphanAssets =
      orphanAssetIds.size > 0
        ? await prisma.asset
            .findMany({
              where: { id: { in: [...orphanAssetIds] } },
              select: {
                id: true,
                property_number: true,
                qr_code: true,
                account_code: true,
                article: true,
                description: true,
                unit: true,
              },
            })
            .catch(() => [])
        : []
    const orphanMap = new Map(orphanAssets.map((a) => [a.id, a]))

    const isoDate = (v: Date | string | null): string | null => {
      if (!v) return null
      const d = v instanceof Date ? v : new Date(v)
      if (Number.isNaN(d.getTime())) return null
      return d.toISOString().slice(0, 10)
    }
    const sourceOf = (d: MyIssuanceRaw): 'request' | 'direct' =>
      d.request_id ? 'request' : 'direct'

    const rows: MyAssetRow[] = assets.map((a) => {
      const linked = docByAsset.get(a.id)
      return {
        ...a,
        kind: 'asset' as const,
        source: linked ? sourceOf(linked) : ('registered' as const),
        quantity: null,
        unit: null,
        doc_no: linked?.doc_no ?? null,
        doc_type: linked?.doc_type ?? null,
        doc_date: linked ? isoDate(linked.doc_date) : null,
      }
    })

    // Issuance lines with no registry row: stock lots (+ assets deleted
    // after issue). One row per doc line — each issuance is its own
    // accountability event.
    docs.forEach((d, docIdx) => {
      const data = (d.issuance_data ?? {}) as Record<string, unknown>
      const rawLines = Array.isArray((data as { lines?: unknown }).lines)
        ? ((data as { lines?: unknown[] }).lines as IssuanceLineShape[])
        : null
      const lines: IssuanceLineShape[] =
        rawLines && rawLines.length > 0
          ? rawLines
          : [
              {
                label: data.description ?? data.lineLabel,
                description: data.description,
                unit: data.unit,
                quantity: d.quantity,
                propertyNo: data.propertyNo,
                inventoryItemNo: data.inventoryItemNo,
                assetId: d.asset_id,
                inventoryId: d.inventory_id,
              },
            ]
      lines.forEach((line, lineIdx) => {
        const lineAssetId = lineAssetIdOf(line)
        if (lineAssetId && assetIds.has(lineAssetId)) return // shown above
        const lineInvId =
          typeof line.inventoryId === 'string' && line.inventoryId
            ? line.inventoryId
            : null
        const stock = lineInvId ? stockMap.get(lineInvId) : undefined
        const orphan = lineAssetId ? orphanMap.get(lineAssetId) : undefined
        const qtyRaw = Number(line.quantity)
        rows.push({
          id: `${d.id}:${docIdx}:${lineIdx}`,
          property_number: str(line.propertyNo) ?? orphan?.property_number ?? null,
          qr_code: orphan?.qr_code ?? null,
          account_code: stock?.account_code ?? str(line.inventoryItemNo) ?? orphan?.account_code ?? null,
          article:
            str(line.label) ??
            str(line.description) ??
            stock?.item_name ??
            orphan?.article ??
            orphan?.description ??
            'Issued item',
          description:
            str(line.description) ?? stock?.item_name ?? orphan?.description ?? null,
          status: null,
          condition: null,
          location: null,
          // A registry-asset line whose asset row is gone (deleted /
          // reassigned away) still reads as an asset, not a consumable.
          kind: lineAssetId ? 'asset' : 'stock',
          source: sourceOf(d),
          quantity: Number.isFinite(qtyRaw) && qtyRaw > 0 ? Math.floor(qtyRaw) : d.quantity,
          unit: str(line.unit) ?? stock?.unit ?? orphan?.unit ?? null,
          doc_no: d.doc_no,
          doc_type: d.doc_type,
          doc_date: isoDate(d.doc_date),
        })
      })
    })

    return rows
  } catch (e) {
    console.error('[getMyAssets]', e)
    return []
  }
}

/** PAR / ICS documents issued to the signed-in employee, newest first. */
export async function getMyDocs(): Promise<MyDocRow[]> {
  let userId = ''
  try {
    ;({ userId } = await requireEmployee())
  } catch {
    return []
  }
  try {
    const docs = await prisma.issuanceRecord.findMany({
      where: { employee_id: userId },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        doc_type: true,
        doc_no: true,
        doc_date: true,
        quantity: true,
        asset_id: true,
      },
    })
    const assets = await prisma.asset.findMany({
      where: { id: { in: docs.map((d) => d.asset_id).filter((v): v is string => !!v) } },
      select: { id: true, qr_code: true, account_code: true, article: true, description: true },
    })
    const labels = new Map(
      assets.map((a) =>
        [a.id, [a.qr_code ?? a.account_code, a.article, a.description].filter(Boolean).join(' — ').slice(0, 80) || 'Asset'] as const
      )
    )
    return docs.map((d) => ({
      id: d.id,
      doc_type: d.doc_type,
      doc_no: d.doc_no,
      doc_date: d.doc_date?.toISOString().slice(0, 10) ?? null,
      quantity: d.quantity,
      asset_label: d.asset_id ? (labels.get(d.asset_id) ?? null) : null,
      downloadHref:
        d.doc_type === 'ICS'
          ? `/api/personnel/issuances/${d.id}/ics-xlsx`
          : `/api/personnel/issuances/${d.id}/par-xlsx`,
    }))
  } catch (e) {
    console.error('[getMyDocs]', e)
    return []
  }
}

/** Requests filed by the signed-in employee, newest first. */
export async function getMyRequests(): Promise<RequestRow[]> {
  let userId = ''
  try {
    ;({ userId } = await requireEmployee())
  } catch {
    return []
  }
  try {
    const all = await getRequests()
    return all.filter((r) => r.employee_id === userId)
  } catch (e) {
    console.error('[getMyRequests]', e)
    return []
  }
}

/**
 * Full PAR/ICS record for the modal overlay, scoped to the signed-in
 * employee. The personnel `getIssuance` filters by `created_by` (the
 * issuing personnel), so employees can never read through it — this is
 * the employee-side equivalent, filtered by `employee_id` (the receiver).
 * Returns the shared `IssuanceDetail` shape so the same PAR/ICS report
 * sheets render for both roles.
 */
export async function getMyIssuanceDetail(id: string): Promise<IssuanceDetail | null> {
  let userId = ''
  try {
    ;({ userId } = await requireEmployee())
  } catch {
    return null
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    return null
  try {
    // Raw SQL like the personnel issuance module (works even when the
    // generated client predates the issuance_records migration).
    const rows = await prisma.$queryRaw<MyIssuanceRaw[]>`
      SELECT id::text AS id, doc_type, doc_no, doc_date,
             asset_id::text AS asset_id, inventory_id::text AS inventory_id,
             employee_id::text AS employee_id, request_id::text AS request_id,
             quantity, unit_cost, total_amount, issuance_data, image_url,
             created_at, created_by::text AS created_by
      FROM issuance_records WHERE id = ${id}::uuid AND employee_id = ${userId}::uuid`
    const r = rows[0]
    if (!r) return null
    const receiverId = r.employee_id ?? userId

    const num = (v: unknown): number | null => {
      if (v === null || v === undefined) return null
      const n = Number(v)
      return Number.isFinite(n) ? n : null
    }
    const isoDay = (v: Date | string | null): string | null => {
      if (!v) return null
      const d = v instanceof Date ? v : new Date(v)
      if (Number.isNaN(d.getTime())) return null
      return d.toISOString().slice(0, 10)
    }
    const isoFull = (v: Date | string | null): string | null => {
      if (!v) return null
      const d = v instanceof Date ? v : new Date(v)
      if (Number.isNaN(d.getTime())) return null
      return d.toISOString()
    }

    const [profile, asset, stock] = await Promise.all([
      prisma.profile
        .findUnique({ where: { id: receiverId }, select: { full_name: true } })
        .catch(() => null),
      r.asset_id
        ? prisma.asset
            .findUnique({
              where: { id: r.asset_id },
              select: {
                qr_code: true, property_number: true, account_code: true,
                article: true, description: true, unit: true,
                unit_cost: true, total_cost: true, date_acquired: true,
              },
            })
            .catch(() => null)
        : Promise.resolve(null),
      r.inventory_id
        ? prisma.inventoryItem
            .findUnique({
              where: { id: r.inventory_id },
              select: { item_name: true, account_code: true, unit: true, unit_cost: true },
            })
            .catch(() => null)
        : Promise.resolve(null),
    ])

    const fallbackItem = r.asset_id && asset
      ? { qr_code: asset.qr_code, account_code: asset.account_code, article: asset.article, description: asset.description }
      : r.inventory_id && stock
        ? { account_code: stock.account_code, item_name: stock.item_name }
        : null
    const bits = fallbackItem
      ? ([
          (fallbackItem as { qr_code?: string | null }).qr_code ??
            (fallbackItem as { account_code?: string | null }).account_code,
          (fallbackItem as { article?: string | null }).article ??
            (fallbackItem as { item_name?: string | null }).item_name,
          (fallbackItem as { description?: string | null }).description,
        ].filter(Boolean) as string[])
      : []
    let itemLabel = bits.length > 0 ? bits.join(' — ').slice(0, 80) : 'Item'
    try {
      const lines = (r.issuance_data as { lines?: unknown } | null)?.lines
      if (Array.isArray(lines) && lines.length > 0) {
        const first = lines[0] as { description?: unknown; label?: unknown }
        const firstText =
          (typeof first?.description === 'string' && first.description.trim()) ||
          (typeof first?.label === 'string' && first.label.trim()) ||
          ''
        itemLabel =
          lines.length > 1
            ? firstText
              ? `${lines.length} items — ${firstText}`.slice(0, 80)
              : `${lines.length} items`
            : firstText
              ? firstText.slice(0, 80)
              : itemLabel
      }
    } catch {
      /* keep fallback label */
    }

    return {
      id: r.id,
      doc_type: r.doc_type,
      doc_no: r.doc_no,
      doc_date: isoDay(r.doc_date),
      asset_id: r.asset_id,
      inventory_id: r.inventory_id,
      employee_id: receiverId,
      employee_name: profile?.full_name ?? 'Unknown employee',
      request_id: r.request_id,
      quantity: r.quantity,
      unit_cost: num(r.unit_cost),
      total_amount: num(r.total_amount),
      item_label: itemLabel,
      issuance_data: (r.issuance_data as Record<string, string> | null) ?? null,
      image_url: r.image_url ?? null,
      created_at: isoFull(r.created_at),
      created_by: r.created_by ?? null,
      asset_snapshot: asset
        ? {
            qr_code: asset.qr_code,
            property_number: asset.property_number,
            account_code: asset.account_code,
            article: asset.article,
            description: asset.description,
            unit: asset.unit,
            unit_cost: num(asset.unit_cost),
            total_cost: num(asset.total_cost),
            date_acquired: asset.date_acquired?.toISOString().slice(0, 10) ?? null,
          }
        : null,
      inventory_snapshot: stock
        ? {
            item_name: stock.item_name,
            account_code: stock.account_code,
            unit: stock.unit,
            unit_cost: num(stock.unit_cost),
          }
        : null,
    }
  } catch (e) {
    console.error('[getMyIssuanceDetail]', e)
    return null
  }
}

export interface MyAssetRequestRow extends RequestRow {
  /** 'mine' = filed by me · 'incoming' = transfer addressed to my name. */
  direction: 'mine' | 'incoming'
}

/** First line is machine-readable: "Transfer to NAME [— LOCATION]". */
function parseTransferTarget(description: string): string {
  const first = description.split('\n')[0] ?? ''
  const m = first.match(/^Transfer to (.+?)(?: — (.+))?$/)
  return (m?.[1] ?? '').trim()
}

/**
 * Requests to surface on My Assets: everything I filed (new assignments,
 * transfers, repairs, stock) plus transfers filed by others addressed to my
 * name. Newest first.
 */
export async function getMyAssetRequests(): Promise<MyAssetRequestRow[]> {
  let userId = ''
  try {
    ;({ userId } = await requireEmployee())
  } catch {
    return []
  }
  try {
    const [profile, all] = await Promise.all([
      prisma.profile.findUnique({
        where: { id: userId },
        select: { full_name: true },
      }),
      getRequests(),
    ])
    const myName = (profile?.full_name ?? '').trim().toLowerCase()
    const rows: MyAssetRequestRow[] = []
    for (const r of all) {
      if (r.employee_id === userId) {
        rows.push({ ...r, direction: 'mine' })
      } else if (r.request_type === 'transfer' && myName) {
        // Exact match only — substring matching leaked transfers to
        // uninvolved employees on name collisions (e.g. "Ann" vs "Annalise").
        const target = parseTransferTarget(r.description).toLowerCase()
        if (target && target === myName) {
          rows.push({ ...r, direction: 'incoming' })
        }
      }
    }
    return rows
  } catch (e) {
    console.error('[getMyAssetRequests]', e)
    return []
  }
}

export interface MyRequestOptions {
  assets: {
    id: string
    label: string
    disabledReason: string | null
    kind: 'asset' | 'stock'
    quantity: number | null
    /** True when this asset is currently assigned to the signed-in employee. */
    heldByMe: boolean
  }[]
  personnel: { id: string; label: string }[]
}

/** Asset + personnel picker options for the employee request form (requester is always self). */
export async function getMyRequestOptions(): Promise<MyRequestOptions> {
  let userId = ''
  try {
    ;({ userId } = await requireEmployee())
  } catch {
    return { assets: [], personnel: [] }
  }
  try {
    // Each branch degrades independently: a transient pooler blip (P1001
    // can't-reach-database, P1017, P2024) on one query must not wipe out the
    // branches that succeeded — e.g. the personnel picker still works when
    // the asset catalog fetch fails. The outer catch stays as the final
    // guard so this action never throws and never crashes the page.
    const [{ assets }, staff, mine] = await Promise.all([
      getRequestFormOptions().catch(() => ({ assets: [] as never[] })),
      prisma.profile
        .findMany({
          where: { status: 'active', role: 'pgso_personnel' },
          orderBy: { full_name: 'asc' },
          select: { id: true, full_name: true, position: true, office: true },
        })
        .catch(() => []),
      prisma.asset
        .findMany({
          where: { assigned_to: userId },
          select: { id: true },
        })
        .catch(() => []),
    ])
    const heldIds = new Set(mine.map((m) => m.id))
    return {
      assets: assets.map((a) => ({
        id: a.id,
        label: `${a.label} · ${a.kind === 'stock' ? 'Stock' : 'Asset'}`,
        disabledReason: a.disabledReason,
        kind: a.kind,
        quantity: a.quantity,
        heldByMe: a.kind === 'asset' && heldIds.has(a.id),
      })),
      personnel: staff.map((p) => ({
        id: p.id,
        label: [p.full_name ?? 'Unnamed', [p.position, p.office].filter(Boolean).join(' · ') || null]
          .filter(Boolean)
          .join(' — '),
      })),
    }
  } catch (e) {
    console.error('[getMyRequestOptions]', e)
    return { assets: [], personnel: [] }
  }
}

export interface CreateMyRequestInput {
  requestType: string
  recipientId: string
  assetId?: string
  quantity?: number
  transferTo?: string
  newLocation?: string
  itemNeeded?: string
  reason: string
}

/** File a request as the signed-in employee (requester cannot be spoofed). */
export async function createMyRequest(
  input: CreateMyRequestInput
): Promise<{ success?: boolean; error?: string }> {
  let userId = ''
  try {
    ;({ userId } = await requireEmployee())
  } catch {
    return { error: 'You must be signed in as an employee to file a request.' }
  }
  if (input.requestType === 'stock_replenishment') {
    return { error: 'Stock replenishment is filed by PGSO personnel.' }
  }
  if (!input.recipientId?.trim()) {
    return { error: 'Select the personnel to send this request to.' }
  }
  // Transfers move custody and repairs act on items in hand — the employee
  // may only transfer or report repair for an asset that is currently
  // assigned to them (in their hand). Stock lots live in PGSO central stock,
  // not in anyone's hand, so they cannot be transferred or repaired away.
  // (The form only offers held items, but the assetId can be spoofed, so the
  // ownership check must live here, not just in the UI.)
  if (input.requestType === 'transfer' || input.requestType === 'repair') {
    const pickedId = input.assetId?.trim() || null
    if (!pickedId) {
      return {
        error:
          input.requestType === 'transfer'
            ? 'Select one of your assigned items to transfer.'
            : 'Select one of your assigned items to repair.',
      }
    }
    try {
      const picked = await prisma.asset.findUnique({
        where: { id: pickedId },
        select: { id: true, assigned_to: true },
      })
      if (!picked || picked.assigned_to !== userId) {
        return {
          error:
            input.requestType === 'transfer'
              ? 'You can only transfer items currently assigned to you.'
              : 'You can only request repair for items currently assigned to you.',
        }
      }
    } catch (e) {
      console.error('[createMyRequest:held-check]', e)
      return { error: 'Could not verify the selected item. Please try again.' }
    }
  }
  const res = await createRequest({
    employeeId: userId,
    requestType: input.requestType,
    recipientId: input.recipientId,
    assetId: input.assetId,
    quantity: input.quantity,
    transferTo: input.transferTo,
    newLocation: input.newLocation,
    itemNeeded: input.itemNeeded,
    reason: input.reason,
  })
  if (res.success) revalidatePath('/employee/requests')
  return res
}

