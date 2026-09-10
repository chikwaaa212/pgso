'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import prisma from '@/lib/prisma'
import { writeAuditLog } from '@/lib/audit'
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

/** Every employee request, newest first, with employee + asset labels. */
export async function getRequests(): Promise<RequestRow[]> {
  try {
    const [requests, profiles, assets] = await Promise.all([
      prisma.request.findMany({ orderBy: { date_requested: 'desc' } }),
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
  const employeeId = input.employeeId?.trim() ?? ''
  const requestType = input.requestType?.trim() ?? ''
  const assetId = input.assetId?.trim() || null
  const quantity = Math.floor(Number(input.quantity) || 0)
  const transferTo = input.transferTo?.trim() ?? ''
  const newLocation = input.newLocation?.trim() ?? ''
  const itemNeeded = input.itemNeeded?.trim() ?? ''
  const reason = input.reason?.trim() ?? ''

  if (!employeeId) return { error: 'Select the requesting employee.' }
  if (!REQUEST_TYPES.includes(requestType as RequestType))
    return { error: 'Select a valid request type.' }
  if (!reason) return { error: 'A reason is required.' }

  // Resolve whether the picked item is an asset or a stock (inventory) item.
  // (Legacy single-item path — transfer / repair / old clients.)
  let pickedKind: 'asset' | 'stock' | null = null
  let stockOnHand = 0
  if (assetId) {
    const [asset, stock] = await Promise.all([
      prisma.asset.findUnique({
        where: { id: assetId },
        select: { id: true },
      }),
      prisma.inventoryItem.findUnique({
        where: { id: assetId },
        select: { id: true, quantity: true },
      }),
    ])
    if (!asset && !stock) return { error: 'Selected item no longer exists.' }
    pickedKind = asset ? 'asset' : 'stock'
    stockOnHand = stock?.quantity ?? 0
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
    if (!assetId || pickedKind !== 'asset')
      return { error: 'Select the asset to transfer.' }
    if (!transferTo) return { error: 'Enter who the asset transfers to.' }
    description =
      `Transfer to ${transferTo}` +
      (newLocation ? ` — ${newLocation}` : '') +
      `\n${reason}`
  } else if (requestType === 'repair') {
    if (!assetId || pickedKind !== 'asset')
      return { error: 'Select the asset needing repair.' }
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
          summary: `${requestType} request for employee ${employeeId}`,
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
        await prisma.asset.update({
          where: { id: current.asset_id },
          data: {
            ...(transferTo ? { end_user: transferTo } : {}),
            ...(newLocation ? { location: newLocation } : {}),
          },
        })
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
        const asset = await prisma.asset.findUnique({
          where: { id: current.asset_id },
          select: { id: true },
        })
        if (asset) {
          await prisma.repair.create({
            data: {
              asset_id: current.asset_id,
              reported_by: current.employee_id,
              repair_date: new Date(),
              description: parseRepairDescription(current.description),
              status: 'pending',
            },
          })
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
