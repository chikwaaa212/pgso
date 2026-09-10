'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import prisma from '@/lib/prisma'
import { writeAuditLog } from '@/lib/audit'
import { generateQrDataUrl } from '@/lib/qrcode'
import { getAllUnifiedAssets } from '../assets/actions'
import {
  REQUEST_STATUSES,
  REQUEST_TYPES,
  type RequestStatus,
  type RequestType,
} from './request-types'

// ─── List ────────────────────────────────────────────────────────────────────

export interface RequestLine {
  id: string
  asset_id: string | null
  description: string
  quantity: number
  unit_cost: number | null
}

export interface RequestRow {
  id: string
  request_type: string
  description: string
  status: string | null
  date_requested: string | null
  date_resolved: string | null
  employee_id: string
  employee_name: string
  recipient_id: string | null
  recipient_name: string | null
  asset_id: string | null
  asset_label: string | null
  /** Structured line items (new) — legacy rows synthesize one from asset_id. */
  lines: RequestLine[]
  item_count: number
}

function assetLabel(a: {
  qr_code: string | null
  account_code: string | null
  article: string | null
  description: string | null
}): string {
  const bits = [
    a.qr_code ?? a.account_code,
    a.article,
    a.description,
  ].filter(Boolean) as string[]
  return bits.length > 0 ? bits.join(' — ').slice(0, 80) : 'Asset'
}

/** Every employee request, newest first, with employee + asset labels.
 * Pass `{ forRecipient: true }` and personnel only see requests sent to them
 * (plus legacy rows filed before recipients existed). Fails closed: without
 * an authenticated user it returns nothing instead of the whole queue. */
export async function getRequests(filter?: {
  forRecipient?: boolean
}): Promise<RequestRow[]> {
  try {
    let recipientId: string | null = null
    if (filter?.forRecipient) {
      try {
        const supabase = await createClient()
        const {
          data: { user },
        } = await supabase.auth.getUser()
        recipientId = user?.id ?? null
      } catch {
        recipientId = null
      }
      // Fail closed — an unauthenticated caller must not fall through to
      // the unfiltered queue and leak other personnel's requests.
      if (recipientId === null) return []
    }
    const [requests, profiles, assets] = await Promise.all([
      prisma.request.findMany({
        where:
          recipientId !== null
            ? { OR: [{ recipient_id: recipientId }, { recipient_id: null }] }
            : undefined,
        orderBy: { date_requested: 'desc' },
      }),
      prisma.profile.findMany({
        select: { id: true, full_name: true },
      }),
      getAllUnifiedAssets(),
    ])

    const names = new Map(profiles.map((p) => [p.id, p.full_name ?? '—']))
    const labels = new Map(assets.map((a) => [a.id, assetLabel(a)]))
    const lineMap = await listRequestLines(requests.map((r) => r.id))

    return await Promise.all(requests.map(async (r) => {
      const stored = lineMap.get(r.id) ?? []
      // Legacy rows (filed before line items existed) synthesize one line
      // from asset_id + the "Qty: N" description line.
      const lines: RequestLine[] =
        stored.length > 0
          ? stored
          : r.asset_id
            ? [
                {
                  id: '',
                  asset_id: r.asset_id,
                  description: '',
                  quantity: await parseQtyLine(r.description),
                  unit_cost: null,
                },
              ]
            : []
      const label =
        lines.length > 1
          ? `${lines.length} items — ${lineLabel(lines[0], labels)}`
          : lines.length === 1
            ? lineLabel(lines[0], labels)
            : r.asset_id
              ? (labels.get(r.asset_id) ?? '—')
              : null
      return {
        id: r.id,
        request_type: r.request_type,
        description: r.description,
        status: r.status,
        date_requested: r.date_requested?.toISOString() ?? null,
        date_resolved: r.date_resolved?.toISOString() ?? null,
        employee_id: r.employee_id,
        employee_name: names.get(r.employee_id) ?? 'Unknown employee',
        recipient_id: r.recipient_id,
        recipient_name: r.recipient_id ? (names.get(r.recipient_id) ?? 'Unknown') : null,
        asset_id: r.asset_id,
        asset_label: label,
        lines,
        item_count: lines.length,
      }
    }))
  } catch (e) {
    console.error('[getRequests]', e)
    return []
  }
}

/** Display label for one request line. */
function lineLabel(
  line: RequestLine,
  labels: Map<string, string>
): string {
  if (line.asset_id) {
    const saved = labels.get(line.asset_id)
    if (saved) return line.quantity > 1 ? `${saved} ×${line.quantity}` : saved
  }
  const text = line.description.trim().slice(0, 80) || 'Item'
  return line.quantity > 1 ? `${text} ×${line.quantity}` : text
}

interface RequestItemDbRow {
  id: string
  request_id: string
  asset_id: string | null
  description: string
  quantity: number
  unit_cost: unknown
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Line items for the given requests. Raw SQL (not prisma.requestItem) so
 * this works even when the generated client predates migration 14 —
 * same pattern as issuance_records.
 */
async function listRequestLines(
  requestIds: string[]
): Promise<Map<string, RequestLine[]>> {
  const map = new Map<string, RequestLine[]>()
  if (requestIds.length === 0) return map
  try {
    const rows = await prisma.$queryRaw<RequestItemDbRow[]>`
      SELECT id::text AS id, request_id::text AS request_id,
             asset_id::text AS asset_id, description, quantity, unit_cost
      FROM request_items WHERE request_id = ANY(${requestIds}::uuid[]) ORDER BY created_at ASC`
    for (const row of rows) {
      const list = map.get(row.request_id) ?? []
      list.push({
        id: row.id,
        asset_id: row.asset_id,
        description: row.description ?? '',
        quantity: row.quantity ?? 1,
        unit_cost: num(row.unit_cost),
      })
      map.set(row.request_id, list)
    }
  } catch (e) {
    console.error('[listRequestLines]', e)
  }
  return map
}

/** Line items for one request (shared with the issuance approval flow). */
export async function getRequestLines(requestId: string): Promise<RequestLine[]> {
  const map = await listRequestLines([requestId])
  return map.get(requestId) ?? []
}

// ─── Form options ────────────────────────────────────────────────────────────

export interface EmployeeOption {
  id: string
  full_name: string
  role: string
}

export interface AssetOption {
  id: string
  kind: 'asset' | 'stock'
  label: string
  location: string | null
  status: string | null
  quantity: number | null
  account_code: string | null
  account_title: string | null
  asset_type: string | null
  unit_cost: number | null
  /** Null when the item can be newly assigned; otherwise the display
   *  reason ("Already assigned" / "Out of stock" / status). */
  disabledReason: string | null
}

function assetOptionDisabledReason(a: {
  source: string
  status?: string | null
  quantity?: number | null
  assigned_to?: string | null
}): string | null {
  if (a.source === 'stock') {
    return typeof a.quantity === 'number' && a.quantity <= 0
      ? 'Out of stock'
      : null
  }
  if (a.assigned_to) return 'Already assigned'
  if (typeof a.quantity === 'number' && a.quantity <= 0) return 'Out of stock'
  const st = (a.status ?? 'available').trim().toLowerCase()
  if (st !== 'available') {
    const s = (a.status ?? '').trim()
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Unavailable'
  }
  return null
}

export async function getRequestFormOptions(): Promise<{
  employees: EmployeeOption[]
  assets: AssetOption[]
}> {
  try {
    const [profiles, assets] = await Promise.all([
      // Only employees can file requests — personnel cannot request.
      prisma.profile.findMany({
        where: { status: 'active', role: 'employee' },
        orderBy: { full_name: 'asc' },
        select: { id: true, full_name: true, role: true },
      }),
      getAllUnifiedAssets(),
    ])

    return {
      employees: profiles.map((p) => ({
        id: p.id,
        full_name: p.full_name ?? 'Unnamed',
        role: p.role,
      })),
      assets: assets
        .filter((a) => a.source === 'asset' || a.source === 'stock')
        .map((a) => ({
          id: a.id,
          kind: a.source,
          label: assetLabel(a),
          location: a.location,
          status: a.status,
          quantity: a.quantity,
          account_code: a.account_code,
          account_title: a.account_title ?? a.account_name,
          asset_type: a.category,
          unit_cost: a.unit_cost,
          disabledReason: assetOptionDisabledReason(a),
        })),
    }
  } catch (e) {
    console.error('[getRequestFormOptions]', e)
    return { employees: [], assets: [] }
  }
}

// ─── Create ──────────────────────────────────────────────────────────────────

export interface CreateRequestLineInput {
  assetId?: string
  /** Free-text item description ("Laptop for new hire"). Required per line. */
  description?: string
  quantity?: number
}

export interface CreateRequestInput {
  employeeId: string
  requestType: string
  assetId?: string
  quantity?: number
  transferTo?: string
  newLocation?: string
  itemNeeded?: string
  reason: string
  /** Personnel recipient. Employees must pick one; personnel filing on
   *  behalf default to themselves so the request stays in their inbox. */
  recipientId?: string
  /** New-assignment line items (multi-item requests). Falls back to the
   *  legacy single assetId/itemNeeded/quantity fields when omitted. */
  items?: CreateRequestLineInput[]
}

export interface RequestState {
  success?: boolean
  error?: string
}

export async function createRequest(
  input: CreateRequestInput
): Promise<RequestState> {
  let employeeId = input.employeeId?.trim() ?? ''
  const requestType = input.requestType?.trim() ?? ''
  const assetId = input.assetId?.trim() || null
  const quantity = Math.floor(Number(input.quantity) || 0)
  const transferTo = input.transferTo?.trim() ?? ''
  const newLocation = input.newLocation?.trim() ?? ''
  const itemNeeded = input.itemNeeded?.trim() ?? ''
  const reason = input.reason?.trim() ?? ''

  if (!REQUEST_TYPES.includes(requestType as RequestType))
    return { error: 'Select a valid request type.' }
  if (!reason) return { error: 'A reason is required.' }

  // Recipient: the personnel this request is sent to. An explicit pick must
  // be an active personnel member; otherwise the signed-in filer becomes the
  // recipient so the request lands in their own inbox.
  let recipientId = input.recipientId?.trim() || null
  if (recipientId) {
    const recipient = await prisma.profile.findUnique({
      where: { id: recipientId },
      select: { id: true, role: true, status: true },
    })
    if (!recipient || recipient.role !== 'pgso_personnel' || recipient.status !== 'active')
      return { error: 'Select the personnel to send this request to.' }
  } else {
    try {
      const supabase = await createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      recipientId = user?.id ?? null
    } catch {
      recipientId = null
    }
    // Fail closed — never file a recipient-less row that would be visible
    // to every personnel inbox.
    if (!recipientId) return { error: 'You must be signed in to file a request.' }
  }

  // Stock replenishment is filed BY personnel FOR stocks (add stock /
  // restock low items). Requester defaults to the signed-in personnel user
  // so the admin can see who asked.
  if (requestType === 'stock_replenishment') {
    try {
      const supabase = await createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return { error: 'You must be signed in to file a request.' }
      employeeId = user.id
    } catch {
      return { error: 'You must be signed in to file a request.' }
    }
    if (!assetId) return { error: 'Select the stock item to replenish.' }
    if (!Number.isInteger(quantity) || quantity < 1)
      return { error: 'Enter a quantity of at least 1.' }
    return createStockReplenishment({
      requesterId: employeeId,
      stockId: assetId,
      quantity,
      reason,
    })
  }

  if (!employeeId) return { error: 'Select the requesting employee.' }

  // Resolve whether the picked item is an asset or a stock (inventory) item.
  // (Legacy single-item path — transfer / repair / old clients.)
  // Every delivered item is an asset; "stock" is just its quantity on hand.
  let pickedKind: 'asset' | 'stock' | null = null
  let stockOnHand = 0
  let pickedFromHolder: string | null = null
  if (assetId) {
    const [asset, stock] = await Promise.all([
      prisma.asset.findUnique({
        where: { id: assetId },
        select: { id: true, assigned_to: true, end_user: true, location: true },
      }),
      prisma.inventoryItem.findUnique({
        where: { id: assetId },
        select: { id: true, quantity: true, location: true, item_name: true },
      }),
    ])
    if (!asset && !stock) return { error: 'Selected item no longer exists.' }
    pickedKind = asset ? 'asset' : 'stock'
    stockOnHand = stock?.quantity ?? 0
    if (requestType === 'transfer') {
      if (asset) {
        // Previous holder before this transfer: assigned employee → end_user.
        let holder: string | null = asset.end_user?.trim() || null
        if (asset.assigned_to) {
          try {
            const holderProfile = await prisma.profile.findUnique({
              where: { id: asset.assigned_to },
              select: { full_name: true },
            })
            if (holderProfile?.full_name?.trim()) holder = holderProfile.full_name.trim()
          } catch {
            // best-effort only
          }
        }
        pickedFromHolder = holder
      } else if (stock) {
        pickedFromHolder = stock.location?.trim()
          ? `PGSO stock — ${stock.location.trim()}`
          : 'PGSO stock'
      }
    }
  }

  // New-assignment line items (multi-item). Each line: free-text description
  // + optional asset/stock pick + quantity for stock picks. The live
  // unit cost is snapshotted so issuance evaluation can still price the
  // line even if the stock runs out before approval.
  interface ValidLine {
    assetId: string | null
    kind: 'asset' | 'stock' | null
    description: string
    quantity: number
    unitCost: number | null
  }
  const validLines: ValidLine[] = []
  if (requestType === 'new_assignment') {
    const rawLines: CreateRequestLineInput[] =
      input.items && input.items.length > 0
        ? input.items
        : [
            {
              assetId: input.assetId,
              description: input.itemNeeded,
              quantity: input.quantity,
            },
          ]
    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i]
      const lineNo = `Item ${i + 1}`
      const lineAssetId = line.assetId?.trim() || null
      const lineDesc = line.description?.trim() ?? ''
      if (!lineDesc) return { error: `${lineNo}: describe the item needed.` }
      let kind: 'asset' | 'stock' | null = null
      let onHand = 0
      let snapCost: number | null = null
      let stockName: string | null = null
      if (lineAssetId) {
        const [asset, stock] = await Promise.all([
          prisma.asset.findUnique({
            where: { id: lineAssetId },
            select: {
              id: true,
              article: true,
              description: true,
              unit_cost: true,
              total_cost: true,
              status: true,
              quantity: true,
              assigned_to: true,
            },
          }),
          prisma.inventoryItem.findUnique({
            where: { id: lineAssetId },
            select: { id: true, item_name: true, quantity: true, unit_cost: true },
          }),
        ])
        if (!asset && !stock)
          return { error: `${lineNo}: selected item no longer exists.` }
        kind = asset ? 'asset' : 'stock'
        onHand = stock?.quantity ?? 0
        stockName = stock?.item_name ?? null
        if (asset) {
          const blocked = assetOptionDisabledReason({
            source: 'asset',
            status: asset.status,
            quantity: asset.quantity,
            assigned_to: asset.assigned_to,
          })
          if (blocked) {
            const name = asset.article ?? asset.description ?? 'Selected asset'
            return {
              error:
                blocked === 'Already assigned'
                  ? `${lineNo} (${name}) is already assigned and cannot be assigned again.`
                  : blocked === 'Out of stock'
                    ? `${lineNo} (${name}) is out of stock.`
                    : `${lineNo} (${name}) is currently ${blocked.toLowerCase()} and cannot be assigned.`,
            }
          }
        }
        const rawCost = asset
          ? (asset.unit_cost ?? asset.total_cost)
          : stock?.unit_cost
        const n = rawCost != null ? Number(rawCost) : NaN
        snapCost = Number.isFinite(n) && n >= 0 ? n : null
      }
      let qty = 1
      if (kind === 'stock') {
        qty = Math.floor(Number(line.quantity) || 0)
        if (!Number.isInteger(qty) || qty < 1)
          return { error: `${lineNo}: enter a quantity of at least 1.` }
        if (onHand <= 0)
          return {
            error: `${lineNo}: ${stockName ?? 'this stock item'} is out of stock.`,
          }
        if (qty > onHand)
          return { error: `${lineNo}: only ${onHand} on hand for this stock item.` }
      }
      validLines.push({ assetId: lineAssetId, kind, description: lineDesc, quantity: qty, unitCost: snapCost })
    }
    if (validLines.length === 0) return { error: 'Add at least one item.' }
  }

  let description: string
  if (requestType === 'transfer') {
    // Every delivered item is an asset; "stock" is just its quantity on hand.
    // Transfers accept an assets-table row or an inventory (stock) lot.
    if (!assetId || !pickedKind)
      return { error: 'Select the item to transfer.' }
    if (!transferTo) return { error: 'Enter who the item transfers to.' }
    if (pickedKind === 'stock') {
      if (!Number.isInteger(quantity) || quantity < 1)
        return { error: 'Enter a quantity of at least 1.' }
      if (stockOnHand <= 0) return { error: 'This stock item is out of stock.' }
      if (quantity > stockOnHand)
        return { error: `Only ${stockOnHand} on hand for this stock item.` }
    }
    description =
      `Transfer to ${transferTo}` +
      (newLocation ? ` — ${newLocation}` : '') +
      (pickedFromHolder ? `\nFrom: ${pickedFromHolder}` : '') +
      (pickedKind === 'stock' ? `\nQty: ${quantity}` : '') +
      `\n${reason}`
  } else if (requestType === 'repair') {
    if (!assetId || !pickedKind)
      return { error: 'Select the item needing repair.' }
    description = `Repair needed\n${reason}`
  } else {
    const summary = validLines
      .map((l) => (l.quantity > 1 ? `${l.description} (Qty: ${l.quantity})` : l.description))
      .join('\n')
    description = `${summary}\n${reason}`
  }

  let createdId: string | null = null
  try {
    const employee = await prisma.profile.findUnique({
      where: { id: employeeId },
      select: { id: true, role: true, status: true },
    })
    if (!employee) return { error: 'Selected employee no longer exists.' }
    if (employee.role !== 'employee' || employee.status !== 'active')
      return { error: 'Only active employees can file requests.' }

    // First picked item stays on requests.asset_id for backward compatibility
    // (transfer / repair / legacy approval paths read it directly).
    const firstPicked =
      requestType === 'new_assignment'
        ? (validLines.find((l) => l.assetId)?.assetId ?? null)
        : assetId
    const { randomUUID } = await import('crypto')
    const created = await prisma.request.create({
      data: {
        employee_id: employeeId,
        recipient_id: recipientId,
        request_type: requestType,
        asset_id: firstPicked,
        description,
        status: 'pending',
      },
      select: { id: true },
    })
    createdId = created.id
    if (requestType === 'new_assignment') {
      for (const l of validLines) {
        await prisma.$executeRaw`
          INSERT INTO request_items (id, request_id, asset_id, description, quantity, unit_cost)
          VALUES (${randomUUID()}::uuid, ${created.id}::uuid, ${l.assetId}::uuid, ${l.description}, ${l.quantity}, ${l.unitCost})`
      }
    }
  } catch (e) {
    console.error('[createRequest]', e)
    return { error: 'Failed to submit the request. Please try again.' }
  }

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      await writeAuditLog({
        userId: user.id,
        action: 'request:create',
        module: 'requests',
        details: {
          purpose: reason,
          summary: `${requestType} request for employee ${employeeId}${recipientId ? ` to personnel ${recipientId}` : ''}`,
          reference_id: createdId,
          request_type: requestType,
        },
      })
    }
  } catch {
    // best-effort only
  }

  revalidatePath('/personnel/requests')
  return { success: true }
}

// ─── Stock replenishment (personnel → admin) ───────────────────────────────
// Personnel files an add-stock / restock request for an inventory item.
// The requester is the personnel user themselves (employee_id = personnel
// id). Admin reviews it on the Requests page; approval is a status change
// only — actual procurement is logged later as a delivery.

export interface StockReplenishmentInput {
  requesterId: string
  stockId: string
  quantity: number
  reason: string
}

export async function createStockReplenishment(
  input: StockReplenishmentInput
): Promise<RequestState> {
  const requesterId = input.requesterId?.trim() ?? ''
  const stockId = input.stockId?.trim() ?? ''
  const quantity = Math.floor(Number(input.quantity) || 0)
  const reason = input.reason?.trim() ?? ''

  if (!requesterId) return { error: 'You must be signed in to file a request.' }
  if (!stockId) return { error: 'Select the stock item to replenish.' }
  if (!Number.isInteger(quantity) || quantity < 1)
    return { error: 'Enter a quantity of at least 1.' }
  if (!reason) return { error: 'A reason is required.' }

  try {
    const [requester, stock] = await Promise.all([
      prisma.profile.findUnique({
        where: { id: requesterId },
        select: { id: true, role: true, status: true },
      }),
      prisma.inventoryItem.findUnique({
        where: { id: stockId },
        select: { id: true, item_name: true, quantity: true, unit: true, unit_cost: true },
      }),
    ])
    if (!requester) return { error: 'Your account was not found.' }
    if (requester.status !== 'active')
      return { error: 'Only active accounts can file requests.' }
    if (requester.role !== 'pgso_personnel' && requester.role !== 'employee')
      return { error: 'Only personnel can file stock requests.' }
    if (!stock) return { error: 'Selected stock item no longer exists.' }

    const unitCost =
      stock.unit_cost != null && Number.isFinite(Number(stock.unit_cost))
        ? Number(stock.unit_cost)
        : null
    const description =
      `Restock request: ${stock.item_name} — Qty: ${quantity}` +
      (stock.unit ? ` ${stock.unit}` : '') +
      ` (on hand: ${stock.quantity})\n${reason}`

    const { randomUUID } = await import('crypto')
    const created = await prisma.request.create({
      data: {
        employee_id: requesterId,
        request_type: 'stock_replenishment',
        asset_id: stockId,
        description,
        status: 'pending',
      },
      select: { id: true },
    })
    try {
      await prisma.$executeRaw`
        INSERT INTO request_items (id, request_id, asset_id, description, quantity, unit_cost)
        VALUES (${randomUUID()}::uuid, ${created.id}::uuid, ${stockId}::uuid, ${stock.item_name}, ${quantity}, ${unitCost})`
    } catch (e) {
      console.error('[createStockReplenishment:line]', e)
    }

    try {
      const supabase = await createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) {
        await writeAuditLog({
          userId: user.id,
          action: 'request:create',
          module: 'requests',
          details: {
            purpose: reason,
            summary: `Stock replenishment: ${stock.item_name} ×${quantity}`,
            reference_id: created.id,
            request_type: 'stock_replenishment',
          },
        })
      }
    } catch {
      // best-effort only
    }

    revalidatePath('/personnel/requests')
    revalidatePath('/personnel/inventory')
    revalidatePath('/super-admin/requests')
    return { success: true }
  } catch (e) {
    console.error('[createStockReplenishment]', e)
    return { error: 'Failed to submit the request. Please try again.' }
  }
}

// ─── Status workflow ─────────────────────────────────────────────────────────

const ALLOWED_TRANSITIONS: Record<string, RequestStatus[]> = {
  pending: ['approved', 'rejected'],
  approved: ['completed'],
  rejected: [],
  completed: [],
}

/** Optional second line for stock picks: "Qty: N". Exported for the issuance approval fallback on legacy rows. */
export async function parseQtyLine(description: string): Promise<number> {
  const m = description.match(/^Qty: (\d+)$/m)
  const n = m ? Number(m[1]) : NaN
  return Number.isInteger(n) && n > 0 ? n : 1
}
/** First line is machine-readable: "Transfer to NAME [— LOCATION]". */
function parseTransferLine(description: string): {
  transferTo: string
  newLocation: string
} {
  const first = description.split('\n')[0] ?? ''
  const m = first.match(/^Transfer to (.+?)(?: — (.+))?$/)
  return {
    transferTo: (m?.[1] ?? '').trim(),
    newLocation: (m?.[2] ?? '').trim(),
  }
}
/** Previous holder line for transfers: "From: NAME". Absent on old rows. */
function parseFromLine(description: string): string | null {
  const m = description.match(/^From: (.+)$/m)
  const s = (m?.[1] ?? '').trim()
  return s ? s : null
}

/** Repair descriptions are stored as "Repair needed\n<issue>". */
function parseRepairDescription(description: string): string {
  const lines = description.split('\n')
  if (/^Repair needed$/i.test(lines[0]?.trim() ?? '')) return lines.slice(1).join('\n').trim()
  return description.trim()
}

export async function setRequestStatus(
  id: string,
  status: RequestStatus,
  note?: string
): Promise<RequestState> {
  if (!REQUEST_STATUSES.includes(status))
    return { error: 'Invalid status.' }

  const remarks = note?.trim() ?? ''
  if (!remarks) return { error: 'Enter remarks for this action.' }

  try {
    const supabaseEarly = await createClient()
    const {
      data: { user: actingUser },
    } = await supabaseEarly.auth.getUser()
    const current = await prisma.request.findUnique({ where: { id } })
    if (!current) return { error: 'Request not found.' }

    const allowed = ALLOWED_TRANSITIONS[current.status ?? 'pending'] ?? []
    if (!allowed.includes(status)) {
      return {
        error: `Cannot move a ${current.status ?? 'pending'} request to ${status}.`,
      }
    }

    // New assignments must go through the shared issuance evaluation
    // (issuance check → ₱50k PAR/ICS → sign → assign) so the accountability
    // document can never be skipped. Use "Evaluate & approve".
    if (current.request_type === 'new_assignment' && status === 'approved') {
      return {
        error:
          'New assignments require issuance evaluation — use “Evaluate & approve” to check issuance, prepare the PAR/ICS, and assign.',
      }
    }

    await prisma.request.update({
      where: { id },
      data: {
        status,
        date_resolved: new Date(),
        description: `${current.description}\nNote (${status}): ${remarks}`,
      },
    })

    // Approving executes the transfer / assignment / repair.
    if (status === 'approved' && current.asset_id) {
      if (current.request_type === 'transfer') {
        const { transferTo, newLocation } = parseTransferLine(
          current.description
        )
        const asset = await prisma.asset.findUnique({
          where: { id: current.asset_id },
          select: { id: true },
        })
        if (asset) {
          await prisma.asset.update({
            where: { id: current.asset_id },
            data: {
              ...(transferTo ? { end_user: transferTo } : {}),
              ...(newLocation ? { location: newLocation } : {}),
            },
          })
        } else {
          // Stock (inventory) lot — transfer means issuing the requested
          // quantity out of stock (same convention as new assignments).
          const stock = await prisma.inventoryItem.findUnique({
            where: { id: current.asset_id },
            select: { quantity: true },
          })
          if (stock) {
            const qty = Math.min(
              await parseQtyLine(current.description),
              stock.quantity
            )
            await prisma.inventoryItem.update({
              where: { id: current.asset_id },
              data: { quantity: stock.quantity - qty },
            })
          }
        }
      } else if (current.request_type === 'new_assignment') {
        const employee = await prisma.profile.findUnique({
          where: { id: current.employee_id },
          select: { full_name: true },
        })
        const asset = await prisma.asset.findUnique({
          where: { id: current.asset_id },
          select: { id: true },
        })
        if (asset) {
          await prisma.asset.update({
            where: { id: current.asset_id },
            data: {
              assigned_to: current.employee_id,
              ...(employee?.full_name ? { end_user: employee.full_name } : {}),
            },
          })
        } else {
          // Stock (inventory) pick — issue the requested quantity.
          const stock = await prisma.inventoryItem.findUnique({
            where: { id: current.asset_id },
            select: { quantity: true },
          })
          if (stock) {
            const qty = Math.min(
              await parseQtyLine(current.description),
              stock.quantity
            )
            await prisma.inventoryItem.update({
              where: { id: current.asset_id },
              data: { quantity: stock.quantity - qty },
            })
          }
        }
      } else if (current.request_type === 'repair') {
        const [asset, stock] = await Promise.all([
          prisma.asset.findUnique({
            where: { id: current.asset_id },
            select: { id: true },
          }),
          prisma.inventoryItem.findUnique({
            where: { id: current.asset_id },
            select: { id: true },
          }),
        ])
        if (asset || stock) {
          const repairDesc = parseRepairDescription(current.description)
          // created_by = approver so the auto ticket shows under their own repairs.
          try {
            const { randomUUID } = await import('crypto')
            await prisma.$executeRaw`
              INSERT INTO repairs (id, asset_id, reported_by, repair_date, description, status, created_by)
              VALUES (${randomUUID()}::uuid, ${current.asset_id}::uuid, ${current.employee_id}::uuid, NOW()::date, ${repairDesc}, 'pending', ${actingUser?.id ?? null}::uuid)`
          } catch {
            await prisma.repair.create({
              data: {
                asset_id: current.asset_id,
                reported_by: current.employee_id,
                repair_date: new Date(),
                description: repairDesc,
                status: 'pending',
              },
            })
          }
        }
      }
    }
  } catch (e) {
    console.error('[setRequestStatus]', e)
    return { error: 'Failed to update the request. Please try again.' }
  }

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      await writeAuditLog({
        userId: user.id,
        action: `request:${status}`,
        module: 'requests',
        details: {
          purpose: remarks,
          summary: `Request ${id.slice(0, 8).toUpperCase()} → ${status}`,
          reference_id: id,
          status,
        },
      })
    }
  } catch {
    // best-effort only
  }

  revalidatePath('/personnel/requests')
  revalidatePath('/personnel/repairs')
  return { success: true }
}

// ─── Completed-request QR ────────────────────────────────────────────────────
// Every request that reaches `completed` (transfer / assignment / repair /
// stock replenishment, asset or stock lot) gets a scannable QR record so
// personnel, the employee, and the admin can verify that transaction.
// Sanitized on purpose: identity + item + dates only — never costs.

export interface CompletedRequestQrLine {
  description: string
  quantity: number
}

export interface CompletedRequestQr {
  success?: boolean
  error?: string
  payload?: string
  dataUrl?: string
  meta?: {
    ref: string
    request_type: string
    employee_name: string
    recipient_name: string | null
    asset_label: string | null
    item_count: number
    /** Total quantity (sum of lines; single-item qty otherwise). */
    quantity: number
    /** Transfer target ("Transfer to …"). Null unless transfer. */
    transfer_to: string | null
    /** Previous holder before a transfer ("From: …"). Null otherwise/unknown. */
    from_holder: string | null
    lines: CompletedRequestQrLine[]
    date_requested: string | null
    date_resolved: string | null
  }
}

export async function getCompletedRequestQr(
  requestId: string
): Promise<CompletedRequestQr> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'You must be signed in to view this QR.' }

    const current = await prisma.request.findUnique({
      where: { id: requestId },
    })
    if (!current) return { error: 'Request not found.' }
    if ((current.status ?? 'pending') !== 'completed')
      return { error: 'QR is available only for completed requests.' }

    const [profiles, assets] = await Promise.all([
      prisma.profile.findMany({ select: { id: true, full_name: true } }),
      getAllUnifiedAssets(),
    ])
    const names = new Map(profiles.map((p) => [p.id, p.full_name ?? '—']))
    const labels = new Map(assets.map((a) => [a.id, assetLabel(a)]))
    const lineMap = await listRequestLines([current.id])
    const stored = lineMap.get(current.id) ?? []
    const lines: RequestLine[] =
      stored.length > 0
        ? stored
        : current.asset_id
          ? [
              {
                id: '',
                asset_id: current.asset_id,
                description: '',
                quantity: await parseQtyLine(current.description),
                unit_cost: null,
              },
            ]
          : []
    const asset_label =
      lines.length > 1
        ? `${lines.length} items — ${lineLabel(lines[0], labels)}`
        : lines.length === 1
          ? lineLabel(lines[0], labels)
          : current.asset_id
            ? (labels.get(current.asset_id) ?? '—')
            : null

    const employee_name = names.get(current.employee_id) ?? 'Unknown employee'
    const recipient_name = current.recipient_id
      ? (names.get(current.recipient_id) ?? 'Unknown')
      : null
    const ref = current.id.slice(0, 8).toUpperCase()
    // Quantity + transfer parties. Transfers store "Transfer to …" on the
    // first line, "From: …" (previous holder) and "Qty: N" (stock lots) below.
    const { transferTo } = parseTransferLine(current.description)
    const transfer_to =
      current.request_type === 'transfer' && transferTo ? transferTo : null
    const from_holder =
      current.request_type === 'transfer'
        ? parseFromLine(current.description)
        : null
    const qrLines: CompletedRequestQrLine[] = lines.map((l) => ({
      description: l.description.trim() || lineLabel(l, labels),
      quantity: l.quantity ?? 1,
    }))
    const quantity =
      qrLines.length > 0
        ? qrLines.reduce((sum, l) => sum + (l.quantity || 0), 0)
        : await parseQtyLine(current.description)
    const payload = JSON.stringify({
      v: 1,
      kind: 'PGSO-REQUEST',
      ref,
      id: current.id,
      type: current.request_type,
      employee: employee_name,
      recipient: recipient_name,
      item: asset_label,
      items: lines.length,
      qty: quantity,
      from: from_holder,
      to: transfer_to,
      lines: qrLines,
      requested: current.date_requested?.toISOString() ?? null,
      resolved: current.date_resolved?.toISOString() ?? null,
      status: 'completed',
    })
    const dataUrl = await generateQrDataUrl(payload)
    if (!dataUrl) return { error: 'Failed to generate the QR. Please try again.' }
    return {
      success: true,
      payload,
      dataUrl,
      meta: {
        ref,
        request_type: current.request_type,
        employee_name,
        recipient_name,
        asset_label,
        item_count: lines.length,
        quantity,
        transfer_to,
        from_holder,
        lines: qrLines,
        date_requested: current.date_requested?.toISOString() ?? null,
        date_resolved: current.date_resolved?.toISOString() ?? null,
      },
    }
  } catch (e) {
    console.error('[getCompletedRequestQr]', e)
    return { error: 'Failed to generate the QR. Please try again.' }
  }
}
