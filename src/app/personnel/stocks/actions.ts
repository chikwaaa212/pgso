'use server'

import { revalidatePath as nextRevalidatePath } from 'next/cache'

// Every Next.js revalidation also busts the Upstash personnel cache so
// Redis never serves stale lists after a write (fire-and-forget).
// Narrow: stock writes touch inventory/dashboard only.
function revalidatePath(path: string) {
  nextRevalidatePath(path)
  void import('@/lib/personnel-cache')
    .then((m) => m.bustPersonnelScopes(['inventory', 'dashboard', 'documents']))
    .catch(() => {})
}
import { writeAuditLog } from '@/lib/audit'
import { stockInspectionItems } from '@/lib/stock'
import { findCatalogEntry, resolveUnitName } from '@/lib/master-data'
import prisma from '@/lib/prisma'

/** One employee a stock item was issued to (PAR/ICS), newest first. */
export interface InventoryAssignee {
  id: string
  name: string
  doc_type: string | null
  doc_no: string | null
  date: string | null
  /** Stock has no single holder flag — always false, kept for parity. */
  current: boolean
}

export interface InventoryRow {
  id: string
  item_name: string
  account_code: string | null
  /** Whether the lot came from a Stocks or Assets delivery (null = unknown/manual). */
  delivery_kind: string | null
  /** Asset type auto-filled from the account code (Master Data catalog). */
  category: string | null
  /** Account title auto-filled from the account code (display-only; no column). */
  account_title: string | null
  /** Account name auto-filled from the account code (display-only; no column). */
  account_name: string | null
  quantity: number
  unit: string | null
  unit_cost: number | null
  reorder_threshold: number | null
  location: string | null
  /** Employees this stock item was issued to (from issuance records). */
  assignees?: InventoryAssignee[]
}

export interface InventoryState {
  success?: boolean
  error?: string
  /** Created/updated record — lets the client patch cache without refetch. */
  record?: unknown
}

/**
 * Stock write permissions for the inventory UI. Personnel get a read-only
 * table — only Super Admin may edit or delete stock items.
 */
export async function getStockPermissions(): Promise<{ canManage: boolean }> {
  const { getPersonnelScope } = await import('@/lib/personnel-scope')
  const scope = await getPersonnelScope()
  return { canManage: scope.isSuperAdmin }
}

export interface InventoryPageOpts {
  page?: number
  pageSize?: number
  q?: string
  kind?: string
  accountCode?: string
  level?: string
  /**
   * Personnel stock ledger: only rows that a passed inspection feeds.
   * Super Admin keeps the full ledger (oversight), so this defaults to false.
   */
  passedOnly?: boolean
}

/**
 * Restricts inventory rows to items a passed inspection moved into stocks.
 * Inventory is an aggregated ledger keyed by (item_name, unit) — the same
 * pair `stockInspectionItems` matches on — so an EXISTS over the delivery
 * items of passed inspections identifies exactly the rows stocking created.
 */
function passedSourceSql(Prisma: typeof import('@prisma/client').Prisma) {
  return Prisma.sql`EXISTS (
    SELECT 1
    FROM delivery_items di
    JOIN inspections i ON i.delivery_id = di.delivery_id
    WHERE i.result = 'passed'
      AND lower(di.item_name) = lower(inventory.item_name)
      AND di.unit IS NOT DISTINCT FROM inventory.unit
  )`
}

const LEVEL_SQL: Record<string, string> = {
  out: `quantity <= 0`,
  critical: `quantity > 0 AND reorder_threshold IS NOT NULL AND quantity <= FLOOR(reorder_threshold / 2)`,
  low: `quantity > 0 AND reorder_threshold IS NOT NULL AND quantity <= reorder_threshold`,
  ok: `reorder_threshold IS NOT NULL AND quantity > reorder_threshold`,
  none: `quantity > 0 AND reorder_threshold IS NULL`,
}

/**
 * Self-healing read path: passed inspections that were recorded before
 * automatic stocking existed (or whose stocking failed) are moved into
 * inventory on the next Stocks read, so the ledger never needs a manual
 * sync. Throttled + per-user single-flight; idempotent via `stocked_qty`.
 */
const AUTO_STOCK_THROTTLE_MS = 15_000
const autoStockRuns = new Map<string, { at: number; done: Promise<void> }>()

async function autoStockPassedInspections(userId: string): Promise<void> {
  const now = Date.now()
  const prev = autoStockRuns.get(userId)
  if (prev && now - prev.at < AUTO_STOCK_THROTTLE_MS) return prev.done
  const done = (async () => {
    try {
      const pending = await prisma.inspection.findMany({
        where: {
          result: 'passed',
          stocked_at: null,
          OR: [
            { inspector_id: userId },
            { delivery: { received_by: userId } },
          ],
        },
        select: { id: true },
        take: 50,
      })
      if (pending.length === 0) return
      let stocked = 0
      for (let i = 0; i < pending.length; i += 5) {
        const chunk = pending.slice(i, i + 5)
        const results = await Promise.all(
          chunk.map((p) =>
            stockInspectionItems(p.id).catch((e) => {
              console.error('[autoStockPassedInspections]', p.id, e)
              return null
            })
          )
        )
        for (const res of results) if (res?.stocked) stocked += 1
      }
      if (stocked > 0) {
        const { bustPersonnelScopes } = await import('@/lib/personnel-cache')
        await bustPersonnelScopes(['inventory', 'dashboard'])
      }
    } catch (e) {
      console.error('[autoStockPassedInspections]', e)
    }
  })()
  autoStockRuns.set(userId, { at: now, done })
  return done
}

/** Global stock stats for the header cards (no row payload). */
export async function getInventoryStats(
  opts: { passedOnly?: boolean; kind?: string } = {}
): Promise<{
  skus: number
  units: number
  low: number
  critical: number
  out: number
  /** Items with no reorder threshold (super-admin oversight banner). */
  none: number
}> {
  const { withCache, cacheKey } = await import('@/lib/personnel-cache')
  const passedOnly = opts.passedOnly === true
  const kind = (opts.kind ?? 'all').trim() || 'all'
  if (passedOnly) {
    try {
      const { getPersonnelScope } = await import('@/lib/personnel-scope')
      const scope = await getPersonnelScope()
      if (scope.userId && !scope.isSuperAdmin) {
        await autoStockPassedInspections(scope.userId)
      }
    } catch {
      /* best-effort self-heal */
    }
  }
  return withCache(cacheKey('personnel:inventory-stats', { passedOnly, kind }), 60, async () => {
    const zeros = { skus: 0, units: 0, low: 0, critical: 0, out: 0, none: 0 }
    try {
      const { Prisma } = await import('@prisma/client')
      const conds: InstanceType<typeof Prisma.Sql>[] = []
      if (passedOnly) conds.push(passedSourceSql(Prisma))
      if (kind !== 'all') conds.push(Prisma.sql`delivery_kind = ${kind}`)
      const where =
        conds.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conds, ' AND ')}` : Prisma.empty
      const rows = await prisma.$queryRaw<
        Array<{
          skus: bigint
          units: bigint | null
          low: bigint
          critical: bigint
          out: bigint
          none: bigint
        }>
      >`
        SELECT
          COUNT(*)::bigint AS skus,
          COALESCE(SUM(quantity), 0)::bigint AS units,
          COUNT(*) FILTER (
            WHERE quantity > 0 AND reorder_threshold IS NOT NULL
              AND quantity <= reorder_threshold
          )::bigint AS low,
          COUNT(*) FILTER (
            WHERE quantity > 0 AND reorder_threshold IS NOT NULL
              AND quantity <= FLOOR(reorder_threshold / 2)
          )::bigint AS critical,
          COUNT(*) FILTER (WHERE quantity <= 0)::bigint AS out,
          COUNT(*) FILTER (
            WHERE quantity > 0 AND reorder_threshold IS NULL
          )::bigint AS none
        FROM inventory ${where}`
      const r = rows[0]
      return {
        skus: Number(r?.skus ?? 0),
        units: Number(r?.units ?? 0),
        low: Number(r?.low ?? 0),
        critical: Number(r?.critical ?? 0),
        out: Number(r?.out ?? 0),
        none: Number(r?.none ?? 0),
      }
    } catch (e) {
      console.error('[getInventoryStats]', e)
      return zeros
    }
  })
}

/** Distinct filter options for kind + account code dropdowns (bounded). */
export async function getInventoryFilterOptions(): Promise<{ kinds: string[]; accountCodes: string[] }> {
  const { withCache, cacheKey } = await import('@/lib/personnel-cache')
  return withCache(cacheKey('personnel:inventory-filter-options'), 300, async () => {
    try {
      const [kinds, codes] = await Promise.all([
        prisma.$queryRaw<Array<{ delivery_kind: string | null }>>`
          SELECT DISTINCT delivery_kind FROM inventory WHERE delivery_kind IS NOT NULL ORDER BY 1 LIMIT 50`
          .catch(() => []),
        prisma.$queryRaw<Array<{ account_code: string | null }>>`
          SELECT DISTINCT account_code FROM inventory WHERE account_code IS NOT NULL ORDER BY 1 LIMIT 500`
          .catch(() => []),
      ])
      return {
        kinds: kinds.map((r) => r.delivery_kind).filter((v): v is string => !!v),
        accountCodes: codes.map((r) => r.account_code).filter((v): v is string => !!v),
      }
    } catch (e) {
      console.error('[getInventoryFilterOptions]', e)
      return { kinds: [], accountCodes: [] }
    }
  })
}

export async function getInventoryItems(): Promise<InventoryRow[]> {
  const { rows } = await getInventoryPage({ page: 1, pageSize: 500 })
  return rows
}

export async function getInventoryPage(
  opts: InventoryPageOpts = {}
): Promise<{ rows: InventoryRow[]; data: InventoryRow[]; total: number; page: number; pageSize: number; totalPages: number }> {
  const { withCache, cacheKey } = await import('@/lib/personnel-cache')
  const { PAGE_SIZE } = await import('@/lib/constants')
  const { parsePage, parseQuery, clampPage, totalPagesFor } = await import('@/lib/paged')
  const page = parsePage(opts.page)
  // Honor caller pageSize (legacy full-list wrappers pass 500, the personnel
  // ledger loads its whole stock window for instant local search); UI lists
  // pass/omit to PAGE_SIZE. Clamped to keep windows bounded.
  const rawSize = Math.floor(Number(opts.pageSize))
  const pageSize = Number.isFinite(rawSize) ? Math.min(Math.max(rawSize, 1), 1000) : PAGE_SIZE
  const q = parseQuery(opts.q)
  const kind = (opts.kind ?? 'all').trim()
  const accountCode = (opts.accountCode ?? 'all').trim()
  const level = (opts.level ?? 'all').trim()
  const passedOnly = opts.passedOnly === true
  // Fail-closed before cache so employee/anon never hit the shared pool cache.
  let scopeForHeal: { userId: string | null; isSuperAdmin: boolean } | null = null
  try {
    const { getPersonnelScope } = await import('@/lib/personnel-scope')
    const scope = await getPersonnelScope()
    if (scope.isEmpty || !scope.isPersonnel) return { rows: [], data: [], total: 0, page: 1, pageSize, totalPages: 1 }
    scopeForHeal = { userId: scope.userId, isSuperAdmin: scope.isSuperAdmin }
  } catch {
    return { rows: [], data: [], total: 0, page: 1, pageSize, totalPages: 1 }
  }
  // Passed inspections feed stocks on their own — heal any that were never
  // stocked before querying so the ledger is complete without a manual sync.
  if (passedOnly && scopeForHeal?.userId && !scopeForHeal.isSuperAdmin) {
    await autoStockPassedInspections(scopeForHeal.userId)
  }
  // Shared stock pool — global key (same data for all personnel).
  return withCache(cacheKey('personnel:inventory-items', { page, pageSize, q, kind, accountCode, level, passedOnly }), 60, async () => {
  try {
    const { Prisma } = await import('@prisma/client')
    const like = q ? `%${q}%` : null
    const conds: InstanceType<typeof Prisma.Sql>[] = []
    if (passedOnly) conds.push(passedSourceSql(Prisma))
    if (kind !== 'all') conds.push(Prisma.sql`delivery_kind = ${kind}`)
    if (accountCode !== 'all') conds.push(Prisma.sql`account_code = ${accountCode}`)
    if (like) {
      conds.push(
        Prisma.sql`(item_name ILIKE ${like} OR account_code ILIKE ${like} OR category ILIKE ${like} OR location ILIKE ${like} OR unit ILIKE ${like})`
      )
    }
    const levelFrag = LEVEL_SQL[level]
    if (levelFrag) conds.push(Prisma.sql([levelFrag]))
    const whereClause = conds.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conds, ' AND ')}` : Prisma.empty
    const offset = (page - 1) * pageSize
    interface StockDb {
      id: string
      item_name: string
      account_code: string | null
      delivery_kind: string | null
      category: string | null
      quantity: number
      unit: string | null
      unit_cost: unknown
      reorder_threshold: number | null
      location: string | null
    }
    const [countRows, rows] = await Promise.all([
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count FROM inventory ${whereClause}`,
      prisma.$queryRaw<StockDb[]>`
        SELECT id::text AS id, item_name, account_code, delivery_kind, category,
               quantity, unit, unit_cost, reorder_threshold, location
        FROM inventory ${whereClause}
        ORDER BY item_name ASC LIMIT ${pageSize} OFFSET ${offset}`,
    ])
    const total = Number(countRows[0]?.count ?? 0)
    const safePage = clampPage(page, Math.max(1, total))
    if (rows.length === 0) return { rows: [], data: [], total, page: safePage, pageSize, totalPages: totalPagesFor(total, pageSize) }
    // Account title/name are display-only (no inventory columns) — resolve
    // them from the active catalog so the UI can show them next to the code.
    let labelsByCode = new Map<string, { title: string; name: string | null }>()
    try {
      const { getActiveCatalogEntries } = await import('@/lib/master-data')
      const entries = await getActiveCatalogEntries()
      labelsByCode = new Map(
        entries.map((e) => [e.code, { title: e.title, name: e.name ?? null }])
      )
    } catch {
      labelsByCode = new Map()
    }
    const mapped: InventoryRow[] = rows.map((r) => {
      const label = r.account_code ? labelsByCode.get(r.account_code) : undefined
      return {
        ...r,
        account_title: label?.title ?? null,
        account_name: label?.name ?? null,
        unit_cost: r.unit_cost != null ? Number(r.unit_cost) : null,
      }
    })
    // Assigned employees — everyone a PAR/ICS was issued this stock item to.
    // Two extra queries for the whole window (same pattern as the assets
    // registry), so the list can show and open the assignment history.
    let enriched = mapped
    try {
      const ids = mapped.map((row) => row.id)
      const idList = Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))
      const issued = await prisma.$queryRaw<
        Array<{
          inventory_id: string | null
          employee_id: string
          doc_type: string | null
          doc_no: string | null
          doc_date: Date | string | null
        }>
      >`SELECT inventory_id::text AS inventory_id, employee_id::text AS employee_id,
               doc_type, doc_no, doc_date
          FROM issuance_records
          WHERE inventory_id IN (${idList})
          ORDER BY created_at DESC`.catch(() => [])
      const need = new Set<string>()
      for (const r of issued) if (r.employee_id) need.add(r.employee_id)
      const names = new Map<string, string>()
      if (need.size > 0) {
        const profiles = await prisma.profile
          .findMany({
            where: { id: { in: [...need] } },
            select: { id: true, full_name: true },
          })
          .catch(() => [])
        for (const p of profiles) names.set(p.id, p.full_name ?? 'Unknown employee')
      }
      const isoDay = (v: Date | string | null): string | null => {
        if (!v) return null
        const d = v instanceof Date ? v : new Date(v)
        return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
      }
      const byItem = new Map<string, InventoryAssignee[]>()
      for (const r of issued) {
        if (!r.inventory_id) continue
        const list = byItem.get(r.inventory_id) ?? []
        if (list.some((a) => a.id === r.employee_id)) continue
        list.push({
          id: r.employee_id,
          name: names.get(r.employee_id) ?? 'Unknown employee',
          doc_type: r.doc_type,
          doc_no: r.doc_no,
          date: isoDay(r.doc_date),
          current: false,
        })
        byItem.set(r.inventory_id, list)
      }
      enriched = mapped.map((row) => ({ ...row, assignees: byItem.get(row.id) ?? [] }))
    } catch {
      /* keep rows without assignee detail */
    }
    return {
      total,
      rows: enriched,
      data: enriched,
      page: safePage,
      pageSize,
      totalPages: totalPagesFor(total, pageSize),
    }
  } catch (e) {
    console.error('[getInventoryItems]', e)
    return { rows: [], data: [], total: 0, page: 1, pageSize, totalPages: 1 }
  }
  })
}

export interface SaveItemInput {
  id?: string
  item_name: string
  account_code: string
  quantity: number
  unit: string
  unit_cost: number | null
  location: string
}

async function requireUser() {
  const { getPersonnelScope } = await import('@/lib/personnel-scope')
  const scope = await getPersonnelScope()
  return scope.userId ? ({ id: scope.userId } as { id: string }) : null
}

/** Creates a new stock item or updates an existing one. */
export async function saveInventoryItem(
  input: SaveItemInput
): Promise<InventoryState> {
  const name = input.item_name?.trim() ?? ''
  if (!name) return { error: 'Item name is required.' }
  if (!Number.isInteger(input.quantity) || input.quantity < 0) {
    return { error: 'Quantity must be a whole number of zero or more.' }
  }
  if (
    input.unit_cost != null &&
    (!Number.isFinite(input.unit_cost) || input.unit_cost < 0)
  ) {
    return { error: 'Unit cost must be zero or more.' }
  }

  let user: { id: string }
  try {
    const { requirePersonnelScope } = await import('@/lib/personnel-scope')
    const scope = await requirePersonnelScope()
    user = { id: scope.userId! }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Not authenticated.'
    return { error: msg.startsWith('Forbidden') ? 'Forbidden: Personnel only.' : 'You must be signed in to manage stocks.' }
  }

  // Strict mode: codes and units must come from Master Data.
  // The account code drives the asset type — same as the delivery modal:
  // picking a code snaps the stock's category to the catalog entry's type.
  const codeRaw = input.account_code?.trim() || null
  let account_code: string | null = null
  let category: string | null = null
  if (codeRaw) {
    const hit = await findCatalogEntry(codeRaw)
    if (!hit) {
      return { error: `Unknown account code "${codeRaw}" — ask your Super Admin to add it to Master Data.` }
    }
    account_code = hit.code
    category = hit.type
  }
  const unitRaw = input.unit?.trim() || null
  let unit: string | null = null
  if (unitRaw) {
    const canonical = await resolveUnitName(unitRaw)
    if (!canonical) {
      return { error: `Unknown unit "${unitRaw}" — ask your Super Admin to add it to Master Data.` }
    }
    unit = canonical
  }

  const data = {
    item_name: name,
    account_code,
    category,
    quantity: input.quantity,
    unit,
    unit_cost: input.unit_cost,
    location: input.location?.trim() || null,
  }

  try {
    // Saved-row echo (list display fields) — lets the client patch the
    // cached window without a refetch.
    const recordSelect = {
      id: true,
      item_name: true,
      account_code: true,
      quantity: true,
      unit: true,
      unit_cost: true,
      location: true,
    } as const
    let record: {
      id: string
      item_name: string
      account_code: string | null
      quantity: number
      unit: string | null
      unit_cost: unknown
      location: string | null
    } | null = null
    if (input.id) {
      // Personnel cannot edit stock — updates are Super Admin only.
      const { getPersonnelScope } = await import('@/lib/personnel-scope')
      const scope = await getPersonnelScope()
      if (!scope.isSuperAdmin) {
        return { error: 'Only Super Admin can edit stock items.' }
      }
      const exists = await prisma.inventoryItem.findUnique({
        where: { id: input.id },
        select: { id: true },
      })
      if (!exists) return { error: 'Stock item not found.' }
      // Personnel cannot change the reorder threshold — only Super Admin sets
      // it. Omit it here so any existing value is preserved untouched.
      record = await prisma.inventoryItem.update({
        where: { id: input.id },
        data,
        select: { ...recordSelect },
      })
    } else {
      // New items start without a threshold until Super Admin sets one.
      record = await prisma.inventoryItem.create({
        data: { ...data, reorder_threshold: null },
        select: { ...recordSelect },
      })
    }
    await writeAuditLog({
      userId: user.id,
      action: input.id ? 'inventory:update' : 'inventory:create',
      module: 'inventory',
      details: {
        purpose: `${input.id ? 'Update' : 'Add'} stock item ${name}`,
        summary: `${name} · Qty ${input.quantity}${input.unit ? ` ${input.unit}` : ''}`,
        reference_id: record?.id ?? input.id ?? undefined,
        after: record,
      },
    })
    revalidatePath('/personnel/stocks')
    return { success: true, record }
  } catch (e) {
    console.error('[saveInventoryItem]', e)
    return { error: 'Failed to save the stock item. Please try again.' }
  }
}

export interface SyncState extends InventoryState {
  stocked?: number
  skipped?: number
  costsFixed?: number
}

/**
 * Stocks every passed inspection that still has unstocked received
 * quantities (e.g. completed before auto-stocking existed), and backfills
 * stock unit costs from delivery items for rows that were stocked before
 * costs were copied over. Idempotent — quantities are never counted twice.
 */
export async function syncUnstockedInspections(): Promise<SyncState> {
  const user = await requireUser()
  if (!user) return { error: 'You must be signed in to manage stocks.' }

  try {
    // Own-data only for personnel; super_admin syncs all.
    const { getPersonnelScope } = await import('@/lib/personnel-scope')
    const scope = await getPersonnelScope()
    const pending = await prisma.inspection.findMany({
      where: scope.isSuperAdmin
        ? {
            result: { in: ['passed'] },
          }
        : {
            result: { in: ['passed'] },
            OR: [
              { inspector_id: user.id },
              { delivery: { received_by: user.id } },
            ],
          },
      select: { id: true },
    })

    // Bounded + concurrent (was unbounded serial for...of): cap the batch
    // and run with limited concurrency so one sync can't stall the pooler.
    const batch = pending.slice(0, 50)
    let stocked = 0
    let costsFixed = 0
    const CONCURRENCY = 5
    for (let i = 0; i < batch.length; i += CONCURRENCY) {
      const chunk = batch.slice(i, i + CONCURRENCY)
      const results = await Promise.all(
        chunk.map((p) =>
          stockInspectionItems(p.id).catch((e) => {
            console.error('[syncUnstockedInspections]', p.id, e)
            return null
          })
        )
      )
      for (const res of results) {
        if (!res) continue
        if (res.stocked) stocked += 1
        costsFixed += res.costsFixed ?? 0
      }
    }

    revalidatePath('/personnel/stocks')
    revalidatePath('/personnel/inspections')
    return { success: true, stocked, skipped: pending.length - stocked, costsFixed }
  } catch (e) {
    console.error('[syncUnstockedInspections]', e)
    return { error: 'Failed to sync inspections. Please try again.' }
  }
}
