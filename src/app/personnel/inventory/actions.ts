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
  quantity: number
  unit: string | null
  unit_cost: number | null
  reorder_threshold: number | null
  location: string | null
}

export interface InventoryState {
  success?: boolean
  error?: string
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
}

const LEVEL_SQL: Record<string, string> = {
  out: `quantity <= 0`,
  critical: `quantity > 0 AND reorder_threshold IS NOT NULL AND quantity <= FLOOR(reorder_threshold / 2)`,
  low: `quantity > 0 AND reorder_threshold IS NOT NULL AND quantity <= reorder_threshold`,
  ok: `reorder_threshold IS NOT NULL AND quantity > reorder_threshold`,
  none: `quantity > 0 AND reorder_threshold IS NULL`,
}

/** Global stock stats for the header cards (no row payload). */
export async function getInventoryStats(): Promise<{
  skus: number
  units: number
  low: number
  critical: number
  out: number
}> {
  const { withCache, cacheKey } = await import('@/lib/personnel-cache')
  return withCache(cacheKey('personnel:inventory-stats'), 60, async () => {
    const zeros = { skus: 0, units: 0, low: 0, critical: 0, out: 0 }
    try {
      const [skus, units, low, critical, out] = await Promise.all([
        prisma.inventoryItem.count().catch(() => 0),
        prisma.inventoryItem
          .aggregate({ _sum: { quantity: true } })
          .then((r) => r._sum.quantity ?? 0)
          .catch(() => 0),
        prisma.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(*)::bigint AS count FROM inventory
          WHERE quantity > 0 AND reorder_threshold IS NOT NULL AND quantity <= reorder_threshold`
          .then((r) => Number(r[0]?.count ?? 0))
          .catch(() => 0),
        prisma.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(*)::bigint AS count FROM inventory
          WHERE quantity > 0 AND reorder_threshold IS NOT NULL AND quantity <= FLOOR(reorder_threshold / 2)`
          .then((r) => Number(r[0]?.count ?? 0))
          .catch(() => 0),
        prisma.inventoryItem.count({ where: { quantity: { lte: 0 } } }).catch(() => 0),
      ])
      return { skus, units, low, critical, out }
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
): Promise<{ rows: InventoryRow[]; total: number }> {
  const { withCache, cacheKey } = await import('@/lib/personnel-cache')
  const page = Math.floor(Number(opts.page)) >= 1 ? Math.min(Math.floor(Number(opts.page)), 1000) : 1
  const pageSize = Number.isFinite(Number(opts.pageSize))
    ? Math.min(Math.max(Math.floor(Number(opts.pageSize)), 1), 100)
    : 20
  const q = (opts.q ?? '').trim().slice(0, 120)
  const kind = (opts.kind ?? 'all').trim()
  const accountCode = (opts.accountCode ?? 'all').trim()
  const level = (opts.level ?? 'all').trim()
  // Shared stock pool — global key.
  return withCache(cacheKey('personnel:inventory-items', { page, pageSize, q, kind, accountCode, level }), 60, async () => {
  try {
    const { Prisma } = await import('@prisma/client')
    const like = q ? `%${q}%` : null
    const conds: InstanceType<typeof Prisma.Sql>[] = []
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
    if (rows.length === 0) return { rows: [], total }
    // Account title is display-only (no inventory column) — resolve it from
    // the active catalog so the UI can show it next to the code.
    let titleByCode = new Map<string, string>()
    try {
      const { getActiveCatalogEntries } = await import('@/lib/master-data')
      const entries = await getActiveCatalogEntries()
      titleByCode = new Map(entries.map((e) => [e.code, e.title]))
    } catch {
      titleByCode = new Map()
    }
    return {
      total,
      rows: rows.map((r) => ({
        ...r,
        account_title: r.account_code
          ? (titleByCode.get(r.account_code) ?? null)
          : null,
        unit_cost: r.unit_cost != null ? Number(r.unit_cost) : null,
      })),
    }
  } catch (e) {
    console.error('[getInventoryItems]', e)
    return { rows: [], total: 0 }
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

  const user = await requireUser()
  if (!user) return { error: 'You must be signed in to manage stocks.' }

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
      await prisma.inventoryItem.update({ where: { id: input.id }, data })
    } else {
      // New items start without a threshold until Super Admin sets one.
      await prisma.inventoryItem.create({ data: { ...data, reorder_threshold: null } })
    }
    await writeAuditLog({
      userId: user.id,
      action: input.id ? 'inventory:update' : 'inventory:create',
      module: 'inventory',
      details: {
        purpose: `${input.id ? 'Update' : 'Add'} stock item ${name}`,
        summary: `${name} · Qty ${input.quantity}${input.unit ? ` ${input.unit}` : ''}`,
        reference_id: input.id ?? null,
      },
    })
    revalidatePath('/personnel/inventory')
    return { success: true }
  } catch (e) {
    console.error('[saveInventoryItem]', e)
    return { error: 'Failed to save the stock item. Please try again.' }
  }
}

export async function deleteInventoryItem(id: string): Promise<InventoryState> {
  if (!id) return { error: 'Stock item ID is required.' }

  const user = await requireUser()
  if (!user) return { error: 'You must be signed in to manage stocks.' }

  // Personnel cannot delete stock — Super Admin only.
  const { getPersonnelScope } = await import('@/lib/personnel-scope')
  const scope = await getPersonnelScope()
  if (!scope.isSuperAdmin) {
    return { error: 'Only Super Admin can delete stock items.' }
  }

  try {
    await prisma.inventoryItem.delete({ where: { id } })
    await writeAuditLog({
      userId: user.id,
      action: 'inventory:delete',
      module: 'inventory',
      details: {
        purpose: 'Remove stock item',
        summary: `Deleted stock ${id.slice(0, 8).toUpperCase()}`,
        reference_id: id,
      },
    })
    revalidatePath('/personnel/inventory')
    return { success: true }
  } catch (e) {
    console.error('[deleteInventoryItem]', e)
    return { error: 'Failed to delete the stock item. Please try again.' }
  }
}

export interface SyncState extends InventoryState {
  stocked?: number
  skipped?: number
  costsFixed?: number
}

/**
 * Stocks every passed/partial inspection that has an AIR but still has
 * unstocked received quantities (e.g. completed before auto-stocking),
 * and backfills stock unit costs from delivery items for rows that were
 * stocked before costs were copied over. Idempotent — quantities are
 * never counted twice.
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
            result: { in: ['passed', 'partial'] },
            iar_records: { some: {} },
          }
        : {
            result: { in: ['passed', 'partial'] },
            iar_records: { some: {} },
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

    revalidatePath('/personnel/inventory')
    revalidatePath('/personnel/inspections')
    return { success: true, stocked, skipped: pending.length - stocked, costsFixed }
  } catch (e) {
    console.error('[syncUnstockedInspections]', e)
    return { error: 'Failed to sync inspections. Please try again.' }
  }
}
