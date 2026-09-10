'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { writeAuditLog } from '@/lib/audit'
import prisma from '@/lib/prisma'
import { getRequestLines, parseQtyLine } from '@/app/personnel/requests/actions'
import {
  resolveDocType,
  type AccountabilityDocType,
} from '@/lib/issuance-rules'

// ─── Raw data layer ──────────────────────────────────────────────────────────
// NOTE: uses $queryRaw/$executeRaw instead of prisma.issuanceRecord so this
// module type-checks and runs even when the generated Prisma client predates
// migration 13 (Windows dev-server locks query_engine, blocking regenerate).
// Run `npx prisma generate` after restarting the dev server to restore the
// typed client; the SQL below keeps working either way.

interface IssuanceDbRow {
  id: string
  doc_type: string
  doc_no: string | null
  doc_date: Date | string | null
  asset_id: string | null
  inventory_id: string | null
  employee_id: string
  request_id: string | null
  quantity: number
  unit_cost: unknown
  total_amount: unknown
  issuance_data: Record<string, string> | null
  image_url: string | null
  created_at: Date | string | null
}

function isoDate(v: Date | string | null): string | null {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(v)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

function isoDateTime(v: Date | string | null): string | null {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(v)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

async function listIssuanceRows(): Promise<IssuanceDbRow[]> {
  try {
    return await prisma.$queryRaw<IssuanceDbRow[]>`
      SELECT id::text AS id, doc_type, doc_no, doc_date,
             asset_id::text AS asset_id, inventory_id::text AS inventory_id,
             employee_id::text AS employee_id, request_id::text AS request_id,
             quantity, unit_cost, total_amount, issuance_data, image_url, created_at
      FROM issuance_records ORDER BY created_at DESC`
  } catch (e) {
    console.error('[listIssuanceRows]', e)
    return []
  }
}

async function getIssuanceRow(id: string): Promise<IssuanceDbRow | null> {
  try {
    const rows = await prisma.$queryRaw<IssuanceDbRow[]>`
      SELECT id::text AS id, doc_type, doc_no, doc_date,
             asset_id::text AS asset_id, inventory_id::text AS inventory_id,
             employee_id::text AS employee_id, request_id::text AS request_id,
             quantity, unit_cost, total_amount, issuance_data, image_url, created_at
      FROM issuance_records WHERE id = ${id}::uuid`
    return rows[0] ?? null
  } catch (e) {
    console.error('[getIssuanceRow]', e)
    return null
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface IssuanceRecordRow {
  id: string
  doc_type: string // 'PAR' | 'ICS'
  doc_no: string | null
  doc_date: string | null
  asset_id: string | null
  inventory_id: string | null
  employee_id: string
  employee_name: string
  request_id: string | null
  quantity: number
  unit_cost: number | null
  total_amount: number | null
  item_label: string
  issuance_data: Record<string, string> | null
  image_url: string | null
  created_at: string | null
}

export interface IssuanceDetail extends IssuanceRecordRow {
  asset_snapshot: {
    qr_code: string | null
    property_number: string | null
    account_code: string | null
    article: string | null
    description: string | null
    unit: string | null
    unit_cost: number | null
    total_cost: number | null
    date_acquired: string | null
  } | null
  inventory_snapshot: {
    item_name: string | null
    account_code: string | null
    unit: string | null
    unit_cost: number | null
  } | null
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function labelFor(asset: {
  qr_code?: string | null
  account_code?: string | null
  article?: string | null
  description?: string | null
  item_name?: string | null
} | null): string {
  if (!asset) return '—'
  const bits = [
    (asset as { qr_code?: string | null }).qr_code ??
      (asset as { account_code?: string | null }).account_code,
    (asset as { article?: string | null }).article ??
      (asset as { item_name?: string | null }).item_name,
    (asset as { description?: string | null }).description,
  ].filter(Boolean) as string[]
  return bits.length > 0 ? bits.join(' — ').slice(0, 80) : 'Item'
}

/**
 * Consolidated (multi-line) docs store every line in issuance_data.lines
 * with null FK columns — label them "N items — first line" so lists stay
 * meaningful. Single-line docs fall back to the asset/stock label.
 */
function consolidatedLabel(
  data: Record<string, unknown> | null,
  fallback: string
): string {
  try {
    const lines = (data as { lines?: unknown } | null)?.lines
    if (Array.isArray(lines) && lines.length > 0) {
      const first = lines[0] as { description?: unknown; label?: unknown }
      const firstText =
        (typeof first?.description === 'string' && first.description.trim()) ||
        (typeof first?.label === 'string' && first.label.trim()) ||
        ''
      if (lines.length > 1)
        return firstText
          ? `${lines.length} items — ${firstText}`.slice(0, 80)
          : `${lines.length} items`
      return firstText ? firstText.slice(0, 80) : fallback
    }
  } catch {
    /* fall through to fallback */
  }
  return fallback
}

function statusLabel(status: string | null | undefined): string {
  const s = (status ?? '').trim()
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * Why an asset can no longer take a NEW assignment (null = assignable).
 * Already-assigned, non-available, or quantity-depleted assets are shown
 * disabled ("Already assigned" / "Out of stock" / status) instead of
 * silently vanishing from the pick lists.
 */
function assetDisabledReason(a: {
  status?: string | null
  quantity?: number | null
  assigned_to?: string | null
}): string | null {
  if (a.assigned_to) return 'Already assigned'
  if (typeof a.quantity === 'number' && a.quantity <= 0) return 'Out of stock'
  const st = (a.status ?? 'available').trim().toLowerCase()
  if (st !== 'available') return statusLabel(a.status) || 'Unavailable'
  return null
}

function stockDisabledReason(quantity: number): string | null {
  return quantity <= 0 ? 'Out of stock' : null
}

/** Human-readable refusal when an asset fails the assignability check. */
function assetRefusal(
  label: string,
  a: { status?: string | null; quantity?: number | null; assigned_to?: string | null }
): string {
  const reason = assetDisabledReason(a)
  if (reason === 'Already assigned')
    return `${label} is already assigned and cannot be assigned again.`
  if (reason === 'Out of stock') return `${label} is out of stock.`
  if (reason) return `${label} is currently ${reason.toLowerCase()} and cannot be assigned.`
  return `${label} cannot be assigned.`
}

const REFUSAL_PREFIX = 'ASSIGN_REFUSAL::'

/** Throws an assignability refusal that survives the transaction catch. */
function throwRefusal(msg: string): never {
  throw new Error(`${REFUSAL_PREFIX}${msg}`)
}

/** Extracts a refusal message from a caught transaction error, if any. */
function refusalMessage(e: unknown): string | null {
  if (
    e instanceof Error &&
    typeof e.message === 'string' &&
    e.message.startsWith(REFUSAL_PREFIX)
  ) {
    return e.message.slice(REFUSAL_PREFIX.length)
  }
  return null
}

// ─── List ────────────────────────────────────────────────────────────────────

async function fetchEmployeeNames(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  try {
    const profiles = await prisma.profile.findMany({
      where: { id: { in: ids } },
      select: { id: true, full_name: true },
    })
    return new Map(profiles.map((p) => [p.id, p.full_name ?? 'Unknown employee']))
  } catch {
    return new Map()
  }
}

/** Every PAR/ICS issuance, newest first. Missing table → [] (run migration 13). */
export async function getIssuances(): Promise<IssuanceRecordRow[]> {
  try {
    const rows = await listIssuanceRows()
    const names = await fetchEmployeeNames([...new Set(rows.map((r) => r.employee_id))])

    const [assets, stocks] = await Promise.all([
      prisma.asset
        .findMany({
          where: { id: { in: rows.map((r) => r.asset_id).filter(Boolean) as string[] } },
          select: { id: true, qr_code: true, account_code: true, article: true, description: true },
        })
        .catch(() => []),
      prisma.inventoryItem
        .findMany({
          where: { id: { in: rows.map((r) => r.inventory_id).filter(Boolean) as string[] } },
          select: { id: true, item_name: true, account_code: true },
        })
        .catch(() => []),
    ])
    const assetMap = new Map(assets.map((a) => [a.id, a]))
    const stockMap = new Map(stocks.map((s) => [s.id, s]))

    return rows.map((r) => {
      const item = r.asset_id
        ? (assetMap.get(r.asset_id) ?? null)
        : r.inventory_id
          ? (stockMap.get(r.inventory_id) ?? null)
          : null
      return {
        id: r.id,
        doc_type: r.doc_type,
        doc_no: r.doc_no,
        doc_date: isoDate(r.doc_date),
        asset_id: r.asset_id,
        inventory_id: r.inventory_id,
        employee_id: r.employee_id,
        employee_name: names.get(r.employee_id) ?? 'Unknown employee',
        request_id: r.request_id,
        quantity: r.quantity,
        unit_cost: num(r.unit_cost),
        total_amount: num(r.total_amount),
        item_label: consolidatedLabel(
          r.issuance_data as Record<string, unknown> | null,
          labelFor(item)
        ),
        issuance_data: (r.issuance_data as Record<string, string> | null) ?? null,
        image_url: r.image_url,
        created_at: isoDateTime(r.created_at),
      }
    })
  } catch (e) {
    console.error('[getIssuances]', e)
    return []
  }
}

export async function getParReports(): Promise<IssuanceRecordRow[]> {
  return (await getIssuances()).filter((r) => r.doc_type === 'PAR')
}

export async function getIcsReports(): Promise<IssuanceRecordRow[]> {
  return (await getIssuances()).filter((r) => r.doc_type === 'ICS')
}

/** Single issuance with live asset/stock snapshots for the sheet. */
export async function getIssuance(id: string): Promise<IssuanceDetail | null> {
  try {
    const r = await getIssuanceRow(id)
    if (!r) return null
    const names = await fetchEmployeeNames([r.employee_id])
    const [asset, stock] = await Promise.all([
      r.asset_id
        ? prisma.asset
            .findUnique({
              where: { id: r.asset_id },
              select: {
                qr_code: true,
                property_number: true,
                account_code: true,
                article: true,
                description: true,
                unit: true,
                unit_cost: true,
                total_cost: true,
                date_acquired: true,
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
    const item = r.asset_id && asset
      ? { qr_code: asset.qr_code, account_code: asset.account_code, article: asset.article, description: asset.description }
      : r.inventory_id && stock
        ? { account_code: stock.account_code, item_name: stock.item_name }
        : null
    return {
      id: r.id,
      doc_type: r.doc_type,
      doc_no: r.doc_no,
      doc_date: isoDate(r.doc_date),
      asset_id: r.asset_id,
      inventory_id: r.inventory_id,
      employee_id: r.employee_id,
      employee_name: names.get(r.employee_id) ?? 'Unknown employee',
      request_id: r.request_id,
      quantity: r.quantity,
      unit_cost: num(r.unit_cost),
      total_amount: num(r.total_amount),
      item_label: consolidatedLabel(
        r.issuance_data as Record<string, unknown> | null,
        labelFor(item)
      ),
      issuance_data: (r.issuance_data as Record<string, string> | null) ?? null,
      image_url: r.image_url,
      created_at: isoDateTime(r.created_at),
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
    console.error('[getIssuance]', e)
    return null
  }
}

// ─── Form options (personnel-initiated direct assignment) ────────────────────

export interface IssuanceEmployeeOption {
  id: string
  full_name: string
  position: string | null
  office: string | null
}

export interface IssuanceAssetOption {
  id: string
  kind: 'asset' | 'stock'
  label: string
  quantity: number | null
  unit: string | null
  unit_cost: number | null
  total_cost: number | null
  account_code: string | null
  /** Null when the item can be newly assigned; otherwise the display
   *  reason ("Already assigned" / "Out of stock" / status) — the UI
   *  renders these options disabled instead of hiding them. */
  disabledReason: string | null
}

/** Employees + assignable items with costs for the ₱50k PAR/ICS decision. */
export async function getIssuanceFormOptions(): Promise<{
  employees: IssuanceEmployeeOption[]
  items: IssuanceAssetOption[]
}> {
  try {
    // Profiles via raw SQL: position/office (migration 14) may postdate the
    // generated client — same pattern as issuance_records / request_items.
    const profRows = await prisma.$queryRaw<
      { id: string; full_name: string | null; position: string | null; office: string | null }[]
    >`
      SELECT id::text AS id, full_name, position, office FROM profiles
      WHERE status = 'active' AND role = 'employee' ORDER BY full_name ASC`
      .catch(() => [] as { id: string; full_name: string | null; position: string | null; office: string | null }[])
    const [assets, stocks] = await Promise.all([
      prisma.asset.findMany({
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          qr_code: true,
          account_code: true,
          article: true,
          description: true,
          quantity: true,
          unit: true,
          unit_cost: true,
          total_cost: true,
          status: true,
          assigned_to: true,
        },
      }),
      prisma.inventoryItem.findMany({
        orderBy: { item_name: 'asc' },
        select: {
          id: true,
          item_name: true,
          account_code: true,
          quantity: true,
          unit: true,
          unit_cost: true,
          total_cost: true,
        },
      }),
    ])
    return {
      employees: profRows.map((p) => ({
        id: p.id,
        full_name: p.full_name ?? 'Unnamed',
        position: p.position,
        office: p.office,
      })),
      items: [
        ...assets.map((a) => ({
          id: a.id,
          kind: 'asset' as const,
          label: labelFor(a),
          quantity: a.quantity,
          unit: a.unit,
          unit_cost: num(a.unit_cost),
          total_cost: num(a.total_cost),
          account_code: a.account_code,
          disabledReason: assetDisabledReason(a),
        })),
        ...stocks.map((s) => ({
          id: s.id,
          kind: 'stock' as const,
          label: labelFor({ account_code: s.account_code, item_name: s.item_name }),
          quantity: s.quantity,
          unit: s.unit,
          unit_cost: num(s.unit_cost),
          total_cost: num(s.total_cost),
          account_code: s.account_code,
          disabledReason: stockDisabledReason(s.quantity),
        })),
      ],
    }
  } catch (e) {
    console.error('[getIssuanceFormOptions]', e)
    return { employees: [], items: [] }
  }
}

// ─── Shared evaluation input ─────────────────────────────────────────────────

export interface EvaluateLineInput {
  assetId?: string
  inventoryId?: string
  quantity?: number
  /**
   * Personnel-entered unit cost, used ONLY when the item has no cost on
   * record — otherwise the on-record cost always wins.
   */
  unitCostOverride?: number | null
  /** Per-line description override (multi-line modal rows). */
  lineDescription?: string
}

export interface EvaluateIssuanceInput {
  employeeId: string
  /** Exactly one of these when isForIssuance is true (single-item paths). */
  assetId?: string
  inventoryId?: string
  quantity?: number
  /**
   * Multi-line approval (request path): one issuance record per line.
   * When present it takes precedence over the single-item fields above.
   */
  lines?: EvaluateLineInput[]
  /** Step 2 — issuance check. False → stays in stock, no doc, no assignment. */
  isForIssuance: boolean
  entity: string
  fundCluster?: string
  docNo?: string
  docDate?: string // ISO yyyy-mm-dd
  description?: string
  propertyNo?: string
  inventoryItemNo?: string
  estUsefulLife?: string
  dateAcquired?: string
  /** Custodian side (PAR "Issued by" / ICS "Received from"). */
  fromName?: string
  fromPosition?: string
  fromDate?: string
  /** End-user side (PAR "Received by" / ICS "Received by"). */
  toName?: string
  toPosition?: string
  toDate?: string
}

export interface IssuanceState {
  success?: boolean
  error?: string
  docType?: AccountabilityDocType
  recordId?: string
  /** Multi-line approvals: every created record + doc (in line order). */
  recordIds?: string[]
  docTypes?: AccountabilityDocType[]
  docNos?: string[]
  /** True when the item was kept in stock (not for issuance). */
  notIssued?: boolean
}

function clean(v: string | undefined): string {
  return v?.trim() ?? ''
}

async function requireUserId(): Promise<string | null> {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    return user?.id ?? null
  } catch {
    return null
  }
}

/**
 * Shared evaluation core (steps 2–4). Validates the issuance check +
 * ₱50k rule, persists the PAR/ICS record, and executes the assignment
 * (asset → assigned_to/end_user, stock → decrement) in one transaction.
 * Pass requestId for the employee-initiated path, null for direct.
 */
async function evaluateAndAssign(
  input: EvaluateIssuanceInput,
  requestId: string | null,
  createdBy: string | null
): Promise<IssuanceState> {
  const employeeId = clean(input.employeeId)
  const assetId = clean(input.assetId) || null
  const inventoryId = clean(input.inventoryId) || null
  const quantity = Math.max(1, Math.floor(Number(input.quantity) || 1))
  const entity = clean(input.entity)
  const docNo = clean(input.docNo)
  const docDate = clean(input.docDate)

  if (!employeeId) return { error: 'Select the employee receiving the item.' }

  let employeeName: string | null = null
  try {
    const employee = await prisma.profile.findUnique({
      where: { id: employeeId },
      select: { id: true, role: true, status: true, full_name: true },
    })
    if (!employee) return { error: 'Selected employee no longer exists.' }
    if (employee.role !== 'employee' || employee.status !== 'active')
      return { error: 'Only active employees can receive items.' }
    employeeName = employee.full_name ?? null
  } catch (e) {
    console.error('[evaluateAndAssign:employee]', e)
    return { error: 'Failed to verify the employee. Please try again.' }
  }

  // Step 2 — issuance check. Not for issuance → stays in stock, end.
  if (!input.isForIssuance) {
    return { success: true, notIssued: true }
  }

  if (!assetId && !inventoryId)
    return { error: 'Select the asset or stock item to issue.' }
  if (assetId && inventoryId)
    return { error: 'Select either an asset or a stock item, not both.' }

  // Snapshot costs for the step-3 value decision.
  let unitCost: number | null = null
  let total: number | null = null
  let description = clean(input.description)
  let unit = ''
  let propertyNo = clean(input.propertyNo)
  let inventoryItemNo = clean(input.inventoryItemNo)
  let dateAcquired = clean(input.dateAcquired)

  try {
    if (assetId) {
      const asset = await prisma.asset.findUnique({
        where: { id: assetId },
        select: {
          id: true,
          qr_code: true,
          property_number: true,
          account_code: true,
          article: true,
          description: true,
          unit: true,
          unit_cost: true,
          total_cost: true,
          date_acquired: true,
          status: true,
          quantity: true,
          assigned_to: true,
        },
      })
      if (!asset) return { error: 'Selected asset no longer exists.' }
      const refusal = assetDisabledReason(asset)
      if (refusal)
        return {
          error: assetRefusal(
            asset.article ?? asset.description ?? 'Selected asset',
            asset
          ),
        }
      unitCost = num(asset.unit_cost)
      total =
        num(asset.total_cost) ??
        (unitCost !== null ? unitCost * 1 : 0)
      if (!description) description = asset.description ?? asset.article ?? ''
      unit = asset.unit ?? ''
      if (!propertyNo)
        propertyNo = asset.qr_code ?? asset.property_number ?? asset.account_code ?? ''
      if (!dateAcquired)
        dateAcquired = asset.date_acquired?.toISOString().slice(0, 10) ?? ''
      if (!inventoryItemNo) inventoryItemNo = asset.account_code ?? ''
    } else if (inventoryId) {
      const stock = await prisma.inventoryItem.findUnique({
        where: { id: inventoryId },
        select: {
          id: true,
          item_name: true,
          account_code: true,
          quantity: true,
          unit: true,
          unit_cost: true,
          total_cost: true,
        },
      })
      if (!stock) return { error: 'Selected stock item no longer exists.' }
      if (!Number.isInteger(quantity) || quantity < 1)
        return { error: 'Enter a quantity of at least 1.' }
      if (stock.quantity <= 0)
        return { error: `${stock.item_name} is out of stock.` }
      if (quantity > stock.quantity)
        return { error: `Only ${stock.quantity} on hand for this stock item.` }
      unitCost = num(stock.unit_cost)
      total = (unitCost ?? 0) * quantity
      if (!description) description = stock.item_name ?? ''
      unit = stock.unit ?? ''
      if (!inventoryItemNo) inventoryItemNo = stock.account_code ?? ''
    }
  } catch (e) {
    console.error('[evaluateAndAssign:snapshot]', e)
    return { error: 'Failed to read the selected item. Please try again.' }
  }

  // Step 3 — value decision is server-side so the ₱50k rule cannot be skipped.
  const docType = resolveDocType(total)

  if (!entity) return { error: 'Entity name is required.' }
  if (!docNo)
    return { error: docType === 'PAR' ? 'PAR No. is required.' : 'ICS No. is required.' }
  if (!docDate || Number.isNaN(Date.parse(docDate)))
    return { error: 'A valid document date is required.' }

  const fromName = clean(input.fromName)
  const toName = clean(input.toName) || employeeName || ''
  if (!fromName) return { error: 'Custodian name is required.' }
  if (!toName) return { error: 'End-user name is required.' }

  const issuanceData = {
    entity,
    fundCluster: clean(input.fundCluster),
    description,
    unit,
    propertyNo,
    inventoryItemNo,
    estUsefulLife: clean(input.estUsefulLife),
    dateAcquired,
    fromName,
    fromPosition: clean(input.fromPosition),
    fromDate: clean(input.fromDate) || docDate,
    toName,
    toPosition: clean(input.toPosition),
    toDate: clean(input.toDate) || docDate,
  }

  try {
    const recordId = await prisma.$transaction(async (tx) => {
      const { randomUUID } = await import('crypto')
      const newId = randomUUID()
      // Raw insert: works with or without a regenerated Prisma client.
      await tx.$executeRaw`
        INSERT INTO issuance_records
          (id, doc_type, doc_no, doc_date, asset_id, inventory_id, employee_id,
           request_id, quantity, unit_cost, total_amount, issuance_data, created_by)
        VALUES (${newId}::uuid, ${docType}, ${docNo || null},
          ${docDate}::date,
          ${assetId}::uuid,
          ${inventoryId}::uuid,
          ${employeeId}::uuid,
          ${requestId}::uuid,
          ${inventoryId ? quantity : 1},
          ${unitCost}, ${total},
          ${JSON.stringify(issuanceData)}::jsonb,
          ${createdBy}::uuid)`

      // Step 4 — assign the item to the employee (end user). Assets lose
      // one unit (or flip to "in use" when unique/depleted) so an assigned
      // asset can never be assigned again; stocks decrement likewise.
      if (assetId) {
        const cur = await tx.asset.findUnique({
          where: { id: assetId },
          select: { quantity: true, status: true, assigned_to: true },
        })
        if (!cur) throwRefusal('Selected asset no longer exists.')
        if (assetDisabledReason(cur))
          throwRefusal(assetRefusal('Selected asset', cur))
        const q = cur?.quantity
        await tx.asset.update({
          where: { id: assetId },
          data: {
            assigned_to: employeeId,
            ...(employeeName ? { end_user: employeeName } : {}),
            ...(q == null
              ? { status: 'in use' }
              : {
                  quantity: Math.max(0, q - 1),
                  ...(q - 1 <= 0 ? { status: 'in use' } : {}),
                }),
          },
        })
      } else if (inventoryId) {
        const stock = await tx.inventoryItem.findUnique({
          where: { id: inventoryId },
          select: { quantity: true },
        })
        if (!stock) throw new Error('Stock item disappeared.')
        const qty = Math.min(quantity, stock.quantity)
        await tx.inventoryItem.update({
          where: { id: inventoryId },
          data: { quantity: stock.quantity - qty },
        })
      }
      return newId
    })

    revalidatePath('/personnel/documents')
    revalidatePath('/personnel/issuances')
    revalidatePath(`/personnel/issuances/${recordId}`)
    revalidatePath('/personnel/assets')
    revalidatePath('/personnel/requests')
    if (createdBy) {
      await writeAuditLog({
        userId: createdBy,
        action: 'issuance:create',
        module: 'issuances',
        details: {
          purpose: description || `Issue ${docType} to ${employeeName ?? employeeId}`,
          summary: `${docType}${docNo ? ` ${docNo}` : ''} → ${employeeName ?? employeeId}${requestId ? ` · request ${requestId.slice(0, 8).toUpperCase()}` : ''}`,
          reference_id: recordId,
          doc_type: docType,
          request_id: requestId,
        },
      })
    }
    return { success: true, docType, recordId }
  } catch (e) {
    console.error('[evaluateAndAssign:tx]', e)
    const refusal = refusalMessage(e)
    if (refusal) return { error: refusal }
    const msg =
      e instanceof Error && /relation "issuance_records" does not exist/i.test(e.message)
        ? 'Issuance table is missing. Apply migration 13_issuance_records, then try again.'
        : 'Failed to save the issuance. Please try again.'
    return { error: msg }
  }
}

// ─── Personnel-initiated direct assignment (no request) ──────────────────────

/** Direct path: skips request/approval, goes straight into shared evaluation. */
export async function createDirectIssuance(
  input: EvaluateIssuanceInput
): Promise<IssuanceState> {
  const createdBy = await requireUserId()
  if (!createdBy) return { error: 'You must be signed in to issue items.' }
  return evaluateAndAssign(input, null, createdBy)
}

// ─── Employee posting (position/office auto-fill) ────────────────────────────

/**
 * Persists the end-user position/office onto the employee profile so the
 * next issuance evaluation auto-fills it. Called from the modal's
 * "save to profile" option.
 */
export async function updateEmployeePosting(
  employeeId: string,
  position: string,
  office: string
): Promise<{ success?: boolean; error?: string }> {
  const me = await requireUserId()
  if (!me) return { error: 'You must be signed in.' }
  if (!employeeId) return { error: 'Employee is required.' }
  try {
    await prisma.$executeRaw`
      UPDATE profiles
      SET position = ${position.trim() || null}, office = ${office.trim() || null}
      WHERE id = ${employeeId}::uuid`
    return { success: true }
  } catch (e) {
    console.error('[updateEmployeePosting]', e)
    return { error: 'Failed to save the employee posting. Please try again.' }
  }
}

// ─── Employee-initiated path (request → approval → shared evaluation) ────────

/** One request line resolved against live asset/stock data. The ₱50k
 *  PAR/ICS decision is made once on the GRAND TOTAL (single document per
 *  approval), not per line. */
interface ResolvedApprovalLine {
  label: string
  assetId: string | null
  inventoryId: string | null
  quantity: number
  unit: string
  description: string
  propertyNo: string
  inventoryItemNo: string
  dateAcquired: string
  estUsefulLife: string
  unitCost: number
  total: number
}

/**
 * Approves a pending new_assignment request THROUGH the shared evaluation.
 * ALWAYS creates exactly ONE PAR/ICS document per approval: line totals are
 * summed to a grand total and a single docType (grand total > ₱50,000 → PAR,
 * else ICS) is issued under the single entered doc number. All lines are
 * still assigned (assets → assigned_to/end_user, stock → decrement) inside
 * the same transaction, and every line is listed on the one document.
 * Denials still go through setRequestStatus(..., 'rejected') and end there.
 * When isForIssuance is false the request is approved with a "remains in
 * stock" note and nothing is assigned; otherwise the single PAR/ICS record
 * is created and the items are assigned in the same step.
 */
export async function approveRequestWithIssuance(
  requestId: string,
  input: EvaluateIssuanceInput,
  remarks: string
): Promise<IssuanceState> {
  const note = remarks?.trim() ?? ''
  if (!note) return { error: 'Enter remarks for this action.' }
  if (!requestId) return { error: 'Request ID is required.' }

  const createdBy = await requireUserId()
  if (!createdBy) return { error: 'You must be signed in to approve requests.' }

  let request: {
    id: string
    employee_id: string
    request_type: string
    asset_id: string | null
    description: string
    status: string | null
  } | null = null
  try {
    request = await prisma.request.findUnique({ where: { id: requestId } })
  } catch (e) {
    console.error('[approveRequestWithIssuance:fetch]', e)
    return { error: 'Failed to read the request. Please try again.' }
  }
  if (!request) return { error: 'Request not found.' }
  if ((request.status ?? 'pending') !== 'pending')
    return { error: `Only pending requests can be approved (now ${request.status}).` }
  if (request.request_type !== 'new_assignment')
    return { error: 'Only new-assignment requests use issuance evaluation.' }

  const employeeId = clean(input.employeeId) || request.employee_id
  let employeeName: string | null = null
  try {
    const employee = await prisma.profile.findUnique({
      where: { id: employeeId },
      select: { id: true, role: true, status: true, full_name: true },
    })
    if (!employee) return { error: 'Selected employee no longer exists.' }
    if (employee.role !== 'employee' || employee.status !== 'active')
      return { error: 'Only active employees can receive items.' }
    employeeName = employee.full_name ?? null
  } catch (e) {
    console.error('[approveRequestWithIssuance:employee]', e)
    return { error: 'Failed to verify the employee. Please try again.' }
  }

  const entity = clean(input.entity)
  const docNoBase = clean(input.docNo)
  const docDate = clean(input.docDate)

  // Not for issuance → approve with a "remains in stock" note, assign nothing.
  if (!input.isForIssuance) {
    try {
      await prisma.request.update({
        where: { id: request.id },
        data: {
          status: 'approved',
          date_resolved: new Date(),
          description: `${request.description}\nNote (approved): ${note}\nIssuance: Not for issuance — remains in stock. No document, no assignment.`,
        },
      })
    } catch (e) {
      console.error('[approveRequestWithIssuance:notIssued]', e)
      return { error: 'Failed to update the request. Please try again.' }
    }
    revalidatePath('/personnel/requests')
    return { success: true, notIssued: true }
  }

  // ── Effective lines: dialog lines win; else stored request lines; else
  //    the legacy single asset_id (+ parsed "Qty: N").
  interface CandidateLine {
    assetId?: string
    inventoryId?: string
    quantity?: number
    unitCostOverride?: number | null
    label?: string
    lineDescription?: string
  }
  let candidates: CandidateLine[]
  if (input.lines && input.lines.length > 0) {
    candidates = input.lines
  } else if (clean(input.assetId) || clean(input.inventoryId)) {
    candidates = [
      {
        assetId: clean(input.assetId) || undefined,
        inventoryId: clean(input.inventoryId) || undefined,
        quantity: input.quantity,
      },
    ]
  } else {
    const stored = await getRequestLines(request.id)
    if (stored.length > 0) {
      candidates = stored.map((l) => ({
        assetId: l.asset_id ?? undefined,
        quantity: l.quantity,
        label: l.description,
        lineDescription: l.description,
        // Snapshot priced at request time — used only when the item has
        // no cost on record (same precedence as a dialog override).
        unitCostOverride: l.unit_cost,
      }))
    } else if (request.asset_id) {
      candidates = [
        { assetId: request.asset_id, quantity: await parseQtyLine(request.description) },
      ]
    } else {
      return { error: 'This request has no items — select the asset or stock item to issue.' }
    }
  }

  // ── Batch snapshots (authoritative costs — the ₱50k rule cannot be skipped).
  const allIds = [
    ...new Set(
      candidates
        .flatMap((l) => [l.assetId, l.inventoryId])
        .filter(Boolean) as string[]
    ),
  ]
  let assetRows: {
    id: string; qr_code: string | null; property_number: string | null
    account_code: string | null; article: string | null; description: string | null
    unit: string | null; unit_cost: unknown; total_cost: unknown
    date_acquired: Date | null; status: string | null
    quantity: number | null; assigned_to: string | null
  }[] = []
  let stockRows: {
    id: string; item_name: string; account_code: string | null; quantity: number
    unit: string | null; unit_cost: unknown; total_cost: unknown
  }[] = []
  try {
    ;[assetRows, stockRows] = await Promise.all([
      allIds.length > 0
        ? prisma.asset.findMany({
            where: { id: { in: allIds } },
            select: {
              id: true, qr_code: true, property_number: true, account_code: true,
              article: true, description: true, unit: true, unit_cost: true,
              total_cost: true, date_acquired: true, status: true,
              quantity: true, assigned_to: true,
            },
          })
        : Promise.resolve([]),
      allIds.length > 0
        ? prisma.inventoryItem.findMany({
            where: { id: { in: allIds } },
            select: {
              id: true, item_name: true, account_code: true, quantity: true,
              unit: true, unit_cost: true, total_cost: true,
            },
          })
        : Promise.resolve([]),
    ])
  } catch (e) {
    console.error('[approveRequestWithIssuance:snapshot]', e)
    return { error: 'Failed to read the selected items. Please try again.' }
  }
  const assetMap = new Map(assetRows.map((a) => [a.id, a]))
  const stockMap = new Map(stockRows.map((s) => [s.id, s]))

  const resolved: ResolvedApprovalLine[] = []
  for (let i = 0; i < candidates.length; i++) {
    const tag = candidates.length > 1 ? `Line ${i + 1}` : 'Item'
    const c = candidates[i]
    const overrideRaw = Number(c.unitCostOverride)
    const override =
      c.unitCostOverride !== null &&
      c.unitCostOverride !== undefined &&
      (c.unitCostOverride as unknown) !== '' &&
      Number.isFinite(overrideRaw) &&
      overrideRaw >= 0
        ? overrideRaw
        : null

    const asset = c.assetId ? (assetMap.get(c.assetId) ?? null) : null
    // A bare asset_id may point at either table — assets win, like createRequest.
    const stock = c.inventoryId
      ? (stockMap.get(c.inventoryId) ?? null)
      : c.assetId
        ? (stockMap.get(c.assetId) ?? null)
        : null

    if (c.inventoryId && !stock)
      return { error: `${tag}: selected stock item no longer exists.` }
    if (!c.inventoryId && !asset && !stock)
      return { error: `${tag}: selected item no longer exists.` }

    if (asset && !c.inventoryId) {
      const assetName = asset.article ?? asset.description ?? 'Asset'
      if (assetDisabledReason(asset))
        return { error: `${tag}: ${assetRefusal(assetName, asset)}` }
      const onRecordUnit = num(asset.unit_cost)
      const onRecordTotal = num(asset.total_cost)
      const effUnit = onRecordUnit ?? override
      const total = onRecordTotal ?? (effUnit !== null ? effUnit * 1 : null)
      if (effUnit === null || total === null)
        return {
          error: `${tag} (${asset.article ?? asset.description ?? 'asset'}): no unit cost on record — enter a cost override.`,
        }
      resolved.push({
        label: asset.article ?? asset.description ?? 'Asset',
        assetId: asset.id,
        inventoryId: null,
        quantity: 1,
        unit: asset.unit ?? '',
        description:
          clean(c.lineDescription) ||
          (candidates.length === 1 ? clean(input.description) : '') ||
          asset.description || asset.article || '',
        propertyNo:
          clean(input.propertyNo) ||
          asset.qr_code || asset.property_number || asset.account_code || '',
        inventoryItemNo: clean(input.inventoryItemNo) || asset.account_code || '',
        dateAcquired:
          clean(input.dateAcquired) || asset.date_acquired?.toISOString().slice(0, 10) || '',
        estUsefulLife: clean(input.estUsefulLife),
        unitCost: effUnit,
        total,
      })
    } else if (stock) {
      const qty = Math.max(1, Math.floor(Number(c.quantity) || 1))
      if (!Number.isInteger(qty) || qty < 1)
        return { error: `${tag}: enter a quantity of at least 1.` }
      if (stock.quantity <= 0)
        return { error: `${tag} (${stock.item_name}) is out of stock.` }
      if (qty > stock.quantity)
        return { error: `${tag} (${stock.item_name}): only ${stock.quantity} on hand.` }
      const effUnit = num(stock.unit_cost) ?? override
      if (effUnit === null)
        return {
          error: `${tag} (${stock.item_name}): no unit cost on record — enter a cost override.`,
        }
      const total = effUnit * qty
      resolved.push({
        label: stock.item_name,
        assetId: null,
        inventoryId: stock.id,
        quantity: qty,
        unit: stock.unit ?? '',
        description:
          clean(c.lineDescription) ||
          (candidates.length === 1 ? clean(input.description) : '') ||
          stock.item_name || '',
        propertyNo: clean(input.propertyNo),
        inventoryItemNo: clean(input.inventoryItemNo) || stock.account_code || '',
        dateAcquired: clean(input.dateAcquired),
        estUsefulLife: clean(input.estUsefulLife),
        unitCost: effUnit,
        total,
      })
    }
  }
  if (resolved.length === 0) return { error: 'No items to issue.' }

  // ── SINGLE document per approval: grand total decides PAR vs ICS. ──
  const grandTotal = resolved.reduce((s, l) => s + l.total, 0)
  const docType = resolveDocType(grandTotal)
  const docNo = docNoBase

  if (!entity) return { error: 'Entity name is required.' }
  if (!docNo)
    return {
      error: docType === 'PAR' ? 'PAR No. is required.' : 'ICS No. is required.',
    }
  if (!docDate || Number.isNaN(Date.parse(docDate)))
    return { error: 'A valid document date is required.' }

  const fromName = clean(input.fromName)
  const toName = clean(input.toName) || employeeName || ''
  if (!fromName) return { error: 'Custodian name is required.' }
  if (!toName) return { error: 'End-user name is required.' }

  const header = {
    entity,
    fundCluster: clean(input.fundCluster),
    fromName,
    fromPosition: clean(input.fromPosition),
    fromDate: clean(input.fromDate) || docDate,
    toName,
    toPosition: clean(input.toPosition),
    toDate: clean(input.toDate) || docDate,
  }

  const isMulti = resolved.length > 1
  const totalQty = resolved.reduce((s, l) => s + l.quantity, 0)
  // First line keeps the FK columns for backward-compatible single-item
  // relations; consolidated (multi-line) docs store every line in
  // issuance_data.lines and leave the FK columns null.
  const singleAssetId = !isMulti ? (resolved[0].assetId ?? null) : null
  const singleInventoryId = !isMulti ? (resolved[0].inventoryId ?? null) : null
  const singleUnitCost = !isMulti ? resolved[0].unitCost : null
  const issuanceData = {
    ...header,
    description: isMulti
      ? resolved.map((l) => l.description).join('; ')
      : resolved[0].description,
    unit: isMulti ? '' : resolved[0].unit,
    propertyNo: isMulti ? clean(input.propertyNo) : resolved[0].propertyNo,
    inventoryItemNo: isMulti
      ? clean(input.inventoryItemNo)
      : resolved[0].inventoryItemNo,
    estUsefulLife: isMulti ? clean(input.estUsefulLife) : resolved[0].estUsefulLife,
    dateAcquired: isMulti ? clean(input.dateAcquired) : resolved[0].dateAcquired,
    lineLabel: isMulti ? `${resolved.length} items` : resolved[0].label,
    grandTotal,
    lineCount: resolved.length,
    lines: resolved.map((l) => ({
      label: l.label,
      description: l.description,
      unit: l.unit,
      quantity: l.quantity,
      unitCost: l.unitCost,
      total: l.total,
      propertyNo: l.propertyNo,
      inventoryItemNo: l.inventoryItemNo,
      dateAcquired: l.dateAcquired,
      estUsefulLife: l.estUsefulLife,
      assetId: l.assetId,
      inventoryId: l.inventoryId,
    })),
  }

  try {
    const newId = await prisma.$transaction(async (tx) => {
      const { randomUUID } = await import('crypto')
      const id = randomUUID()
      await tx.$executeRaw`
        INSERT INTO issuance_records
          (id, doc_type, doc_no, doc_date, asset_id, inventory_id, employee_id,
           request_id, quantity, unit_cost, total_amount, issuance_data, created_by)
        VALUES (${id}::uuid, ${docType}, ${docNo || null},
          ${docDate}::date,
          ${singleAssetId}::uuid,
          ${singleInventoryId}::uuid,
          ${employeeId}::uuid,
          ${request.id}::uuid,
          ${isMulti ? totalQty : singleInventoryId ? resolved[0].quantity : 1},
          ${singleUnitCost}, ${grandTotal},
          ${JSON.stringify(issuanceData)}::jsonb,
          ${createdBy}::uuid)`
      // Step 4 — assign EVERY line even though there is only one document.
      // Assets lose one unit (or flip to "in use" when unique/depleted);
      // stocks decrement. Re-checked here so a race can't double-assign.
      for (const line of resolved) {
        if (line.assetId) {
          const cur = await tx.asset.findUnique({
            where: { id: line.assetId },
            select: { quantity: true, status: true, assigned_to: true },
          })
          if (!cur) throwRefusal('Selected asset no longer exists.')
          if (assetDisabledReason(cur))
            throwRefusal(assetRefusal(line.label || 'Selected asset', cur))
          const q = cur?.quantity
          await tx.asset.update({
            where: { id: line.assetId },
            data: {
              assigned_to: employeeId,
              ...(employeeName ? { end_user: employeeName } : {}),
              ...(q == null
                ? { status: 'in use' }
                : {
                    quantity: Math.max(0, q - 1),
                    ...(q - 1 <= 0 ? { status: 'in use' } : {}),
                  }),
            },
          })
        } else if (line.inventoryId) {
          const stock = await tx.inventoryItem.findUnique({
            where: { id: line.inventoryId },
            select: { quantity: true },
          })
          if (!stock) throw new Error('Stock item disappeared.')
          const qty = Math.min(line.quantity, stock.quantity)
          await tx.inventoryItem.update({
            where: { id: line.inventoryId },
            data: { quantity: stock.quantity - qty },
          })
        }
      }
      return id
    })

    const suffix =
      `${docNo} (${docType}) prepared and signed. ${resolved.length} item${resolved.length === 1 ? '' : 's'} assigned. Grand total ${grandTotal.toFixed(2)}.`
    await prisma.request.update({
      where: { id: request.id },
      data: {
        status: 'approved',
        date_resolved: new Date(),
        description: `${request.description}\nNote (approved): ${note}\nIssuance: ${suffix}`,
      },
    })

    revalidatePath('/personnel/documents')
    revalidatePath('/personnel/issuances')
    revalidatePath(`/personnel/issuances/${newId}`)
    revalidatePath('/personnel/assets')
    revalidatePath('/personnel/requests')
    return {
      success: true,
      docType,
      recordId: newId,
      recordIds: [newId],
      docTypes: [docType],
      docNos: [docNo],
    }
  } catch (e) {
    console.error('[approveRequestWithIssuance:tx]', e)
    const refusal = refusalMessage(e)
    if (refusal) return { error: refusal }
    const msg =
      e instanceof Error && /relation "issuance_records" does not exist/i.test(e.message)
        ? 'Issuance table is missing. Apply migration 13_issuance_records, then try again.'
        : 'Failed to save the issuance. Please try again.'
    return { error: msg }
  }
}

// ─── Signed-scan attach (mirrors IAR attach/remove) ─────────────────────────

export interface IssuanceScanState {
  success?: boolean
  error?: string
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
}

export async function attachIssuanceScan(
  issuanceId: string,
  imageUrl: string
): Promise<IssuanceScanState> {
  const url = imageUrl?.trim() ?? ''
  if (!issuanceId || !isUuid(issuanceId)) return { error: 'Issuance ID is required.' }
  if (!url || !/^https?:\/\//i.test(url))
    return { error: 'A valid image URL is required.' }
  const user = await requireUserId()
  if (!user) return { error: 'You must be signed in to attach a scan.' }
  try {
    const existing = await getIssuanceRow(issuanceId)
    if (!existing) return { error: 'Issuance record not found.' }
    await prisma.$executeRaw`
      UPDATE issuance_records SET image_url = ${url} WHERE id = ${issuanceId}::uuid`
    revalidatePath('/personnel/documents')
    revalidatePath(`/personnel/issuances/${issuanceId}`)
    return { success: true }
  } catch (e) {
    console.error('[attachIssuanceScan]', e)
    return { error: 'Failed to attach the scan. Please try again.' }
  }
}

export async function removeIssuanceScan(
  issuanceId: string
): Promise<IssuanceScanState> {
  if (!issuanceId || !isUuid(issuanceId)) return { error: 'Issuance ID is required.' }
  const user = await requireUserId()
  if (!user) return { error: 'You must be signed in to remove a scan.' }
  try {
    await prisma.$executeRaw`
      UPDATE issuance_records SET image_url = NULL WHERE id = ${issuanceId}::uuid`
    revalidatePath('/personnel/documents')
    revalidatePath(`/personnel/issuances/${issuanceId}`)
    return { success: true }
  } catch (e) {
    console.error('[removeIssuanceScan]', e)
    return { error: 'Failed to remove the scan. Please try again.' }
  }
}
