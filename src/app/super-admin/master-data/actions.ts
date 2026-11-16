'use server'

import { revalidatePath as nextRevalidatePath } from 'next/cache'
import ExcelJS from 'exceljs'
import prisma from '@/lib/prisma'
import { writeAuditLog } from '@/lib/audit'
import { requireSuperAdmin } from '@/lib/auth-guard'
import { archiveCutoff } from '@/lib/master-data-archive'
import {
  CATALOG_EXCEL_HEADERS,
  CATALOG_LEGACY_SHEET,
  CATALOG_TEMPLATE_SHEET,
} from '@/lib/account-catalog-excel'

export interface UnitRow {
  id: string
  name: string
  abbreviation: string | null
  status: string
  usage: number
  created_at: string | null
  deleted_at: string | null
}

export interface DepartmentRow {
  id: string
  name: string
  description: string | null
  status: string
  usage: number
  created_at: string | null
  deleted_at: string | null
}

export interface StockTypeRow {
  id: string
  name: string
  account_code: string | null
  asset_type: string | null
  account_title: string | null
  account_name: string | null
  description: string | null
  status: string
  usage: number
  created_at: string | null
  deleted_at: string | null
}

export interface CatalogRow {
  id: string
  account_code: string
  account_title: string
  account_name: string | null
  asset_type: string
  description: string | null
  status: string
  usage: number
  created_at: string | null
  deleted_at: string | null
}

/** Soft-deleted rows grouped by list, for the "Deleted" overlays. */
export interface DeletedMasterData {
  units: UnitRow[]
  catalog: CatalogRow[]
  departments: DepartmentRow[]
  stockTypes: StockTypeRow[]
}

function revalidatePath(path: string) {
  nextRevalidatePath(path)
  void import('@/lib/personnel-cache')
    .then((m) => m.bustSuperAdminScopes(['master-data']))
    .catch(() => {})
}

function revalidate() {
  revalidatePath('/super-admin/master-data')
  revalidatePath('/super-admin/dashboard')
}

async function unitUsage(name: string): Promise<number> {
  try {
    const [a, s, d] = await Promise.all([
      prisma.asset.count({ where: { unit: { equals: name, mode: 'insensitive' } } }),
      prisma.inventoryItem.count({ where: { unit: { equals: name, mode: 'insensitive' } } }),
      prisma.deliveryItem.count({ where: { unit: { equals: name, mode: 'insensitive' } } }),
    ])
    return a + s + d
  } catch {
    return 0
  }
}

async function catalogUsage(code: string): Promise<number> {
  try {
    const [a, d] = await Promise.all([
      prisma.asset.count({ where: { account_code: code } }),
      prisma.delivery.count({ where: { account_code: code } }),
    ])
    return a + d
  } catch {
    return 0
  }
}

// Prisma client regenerates on `postinstall` / `prisma generate`. The dev
// server locks the query-engine DLL, so right after the Department model is
// added the running client may not have the delegate yet — guard so reads
// degrade to [] and writes explain the fix instead of crashing.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function departmentsTable(): any | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = (prisma as any).department ?? null
  return d
}

async function departmentUsage(name: string): Promise<number> {
  try {
    return await prisma.profile.count({
      where: { office: { equals: name, mode: 'insensitive' } },
    })
  } catch {
    return 0
  }
}

export async function getUnits(): Promise<UnitRow[]> {
  try {
    await requireSuperAdmin()
  } catch {
    return []
  }
  // Same list caching as the other admin pages (60s) — auth stays
  // outside the cache so failure fallbacks are never stored. Writes
  // bust via revalidate() below.
  const { withScopedCache } = await import('@/lib/personnel-cache')
  return withScopedCache('super-admin:master-units', 60, async () => {
  try {
    const rows = await prisma.unit.findMany({
      where: { deleted_at: null },
      orderBy: { name: 'asc' },
    })
    return await Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        name: r.name,
        abbreviation: r.abbreviation,
        status: r.status,
        usage: await unitUsage(r.name),
        created_at: r.created_at?.toISOString() ?? null,
        deleted_at: r.deleted_at?.toISOString() ?? null,
      }))
    )
  } catch (e) {
    console.error('[getUnits]', e)
    return []
  }
  })
}

export async function getCatalog(): Promise<CatalogRow[]> {
  try {
    await requireSuperAdmin()
  } catch {
    return []
  }
  const { withScopedCache } = await import('@/lib/personnel-cache')
  return withScopedCache('super-admin:master-catalog', 60, async () => {
    try {
      const rows = await prisma.accountCatalog.findMany({
        where: { deleted_at: null },
        orderBy: { account_code: 'asc' },
      })
      const out: CatalogRow[] = []
      for (const r of rows) {
        out.push({
          id: r.id,
          account_code: r.account_code,
          account_title: r.account_title,
          account_name: r.account_name,
          asset_type: r.asset_type,
          description: r.description,
          status: r.status,
          usage: await catalogUsage(r.account_code),
          created_at: r.created_at?.toISOString() ?? null,
          deleted_at: r.deleted_at?.toISOString() ?? null,
        })
      }
      return out
    } catch (e) {
      console.error('[getCatalog]', e)
      return []
    }
  })
}

async function stockTypeUsage(name: string): Promise<number> {
  try {
    return await prisma.delivery.count({
      where: { stock_type: { equals: name, mode: 'insensitive' } },
    })
  } catch {
    return 0
  }
}

export async function getStockTypes(): Promise<StockTypeRow[]> {
  try {
    await requireSuperAdmin()
  } catch {
    return []
  }
  const { withScopedCache } = await import('@/lib/personnel-cache')
  return withScopedCache('super-admin:master-stock-types', 60, async () => {
    try {
      const rows = await prisma.stockType.findMany({
        where: { deleted_at: null },
        orderBy: { name: 'asc' },
      })
      return await Promise.all(
        rows.map(async (r) => ({
          id: r.id,
          name: r.name,
          account_code: r.account_code,
          asset_type: r.asset_type,
          account_title: r.account_title,
          account_name: r.account_name,
          description: r.description,
          status: r.status,
          usage: await stockTypeUsage(r.name),
          created_at: r.created_at?.toISOString() ?? null,
          deleted_at: r.deleted_at?.toISOString() ?? null,
        }))
      )
    } catch (e) {
      console.error('[getStockTypes]', e)
      return []
    }
  })
}

export async function createStockType(
  _prev: { ok: boolean; error?: string },
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  let actorId = ''
  try {
    ;({ userId: actorId } = await requireSuperAdmin())
    const field = (key: string) => (((formData.get(key) as string) ?? '').trim())
    const account_code = field('account_code') || null
    const asset_type = field('asset_type') || null
    const account_title = field('account_title') || null
    const account_name = field('account_name') || null
    // Stock headers mirror asset headers; the name stays the label used by
    // deliveries, defaulting to the account title.
    const name = field('name') || account_title
    const description = field('description') || null
    if (!account_code) throw new Error('Account code is required.')
    if (!asset_type) throw new Error('Stock type is required.')
    if (!name) throw new Error('Account title is required.')
    if (name.length > 120) throw new Error('Stock header name must be 120 characters or fewer.')
    const existing = await prisma.stockType.findFirst({
      where: {
        OR: [
          { name: { equals: name, mode: 'insensitive' } },
          ...(account_code ? [{ account_code }] : []),
        ],
      },
    })
    if (existing) {
      if (existing.deleted_at) {
        throw new Error(
          `A deleted stock header with this ${existing.account_code === account_code ? 'account code' : 'name'} already exists — restore it from Deleted records instead.`
        )
      }
      throw new Error(
        existing.account_code === account_code && existing.name.toLowerCase() !== name.toLowerCase()
          ? `Account code "${account_code}" already exists.`
          : `Stock header "${name}" already exists.`
      )
    }
    const row = await prisma.stockType.create({
      data: {
        name,
        account_code,
        asset_type,
        account_title: account_title ?? name,
        account_name,
        description,
        status: 'active',
        created_by: actorId,
      },
    })
    void writeAuditLog({
      userId: actorId,
      action: 'master-data:create_stock_type',
      module: 'master-data',
      details: { purpose: 'Create stock header', summary: `Added stock header "${name}"`, reference_id: row.id },
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to add stock header.' }
  }
  revalidate()
  return { ok: true }
}

export async function setStockTypeStatus(
  id: string,
  status: 'active' | 'inactive'
): Promise<{ ok: boolean; error?: string }> {
  let actorId = ''
  try {
    ;({ userId: actorId } = await requireSuperAdmin())
    const row = await prisma.stockType.findUnique({ where: { id } })
    if (!row) throw new Error('Stock type not found.')
    if (status === 'inactive' && (await stockTypeUsage(row.name)) > 0) {
      throw new Error(`"${row.name}" is used by deliveries and cannot be deactivated.`)
    }
    await prisma.stockType.update({ where: { id }, data: { status } })
    void writeAuditLog({
      userId: actorId,
      action: status === 'active' ? 'master-data:reactivate_stock_type' : 'master-data:deactivate_stock_type',
      module: 'master-data',
      details: { purpose: 'Toggle stock type', summary: `${status} stock type "${row.name}"`, reference_id: id },
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Update failed.' }
  }
  revalidate()
  return { ok: true }
}

export async function createUnit(
  _prev: { ok: boolean; error?: string },
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  let actorId = ''
  try {
    ;({ userId: actorId } = await requireSuperAdmin())
    const name = ((formData.get('name') as string) ?? '').trim().toLowerCase()
    const abbreviation = ((formData.get('abbreviation') as string) ?? '').trim() || null
    if (!name) throw new Error('Unit name is required.')
    if (!/^[a-z0-9 .\-/]+$/.test(name)) {
      throw new Error('Use letters, numbers, spaces, dots, dashes only.')
    }
    const existing = await prisma.unit.findUnique({ where: { name } })
    if (existing) {
      throw new Error(
        existing.deleted_at
          ? `Unit "${name}" was deleted — restore it from Deleted records instead of adding it again.`
          : `Unit "${name}" already exists.`
      )
    }
    const row = await prisma.unit.create({
      data: { name, abbreviation, status: 'active', created_by: actorId },
    })
    // Fire-and-forget: audit is best-effort — don't hold the dialog spinner
    // for it on slow networks (each DB hop currently costs seconds).
    void writeAuditLog({
      userId: actorId,
      action: 'master-data:create_unit',
      module: 'master-data',
      details: { purpose: 'Create unit', summary: `Added unit "${name}"`, reference_id: row.id },
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to add unit.' }
  }
  revalidate()
  return { ok: true }
}

export async function setUnitStatus(
  id: string,
  status: 'active' | 'inactive'
): Promise<{ ok: boolean; error?: string }> {
  let actorId = ''
  try {
    ;({ userId: actorId } = await requireSuperAdmin())
    const row = await prisma.unit.findUnique({ where: { id } })
    if (!row) throw new Error('Unit not found.')
    if (status === 'inactive' && (await unitUsage(row.name)) > 0) {
      throw new Error(`"${row.name}" is in use and cannot be deactivated.`)
    }
    await prisma.unit.update({ where: { id }, data: { status } })
    // Fire-and-forget (see createUnit): audit must not gate the UI.
    void writeAuditLog({
      userId: actorId,
      action: status === 'active' ? 'master-data:reactivate_unit' : 'master-data:deactivate_unit',
      module: 'master-data',
      details: { purpose: 'Toggle unit', summary: `${status} unit "${row.name}"`, reference_id: id },
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Update failed.' }
  }
  revalidate()
  return { ok: true }
}

export async function getDepartments(): Promise<DepartmentRow[]> {
  try {
    await requireSuperAdmin()
  } catch {
    return []
  }
  const { withScopedCache } = await import('@/lib/personnel-cache')
  return withScopedCache('super-admin:master-departments', 60, async () => {
    try {
      const table = departmentsTable()
      if (!table) return []
      const rows = await table.findMany({
        where: { deleted_at: null },
        orderBy: { name: 'asc' },
      })
      return await Promise.all(
        rows.map(
          async (r: {
            id: string
            name: string
            description: string | null
            status: string
            created_at?: Date | null
            deleted_at?: Date | null
          }) => ({
            id: r.id,
            name: r.name,
            description: r.description,
            status: r.status,
            usage: await departmentUsage(r.name),
            created_at: r.created_at?.toISOString() ?? null,
            deleted_at: r.deleted_at?.toISOString() ?? null,
          })
        )
      )
    } catch (e) {
      console.error('[getDepartments]', e)
      return []
    }
  })
}

export async function createDepartment(
  _prev: { ok: boolean; error?: string },
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  let actorId = ''
  try {
    ;({ userId: actorId } = await requireSuperAdmin())
    const table = departmentsTable()
    if (!table) {
      throw new Error(
        'Departments table is not ready yet — restart the dev server (regenerates the Prisma client), then run `npx prisma db push`.'
      )
    }
    const name = ((formData.get('name') as string) ?? '').trim()
    const description = ((formData.get('description') as string) ?? '').trim() || null
    if (!name) throw new Error('Department name is required.')
    if (name.length > 120) throw new Error('Department name must be 120 characters or fewer.')
    const existing = await table.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
    })
    if (existing) {
      throw new Error(
        existing.deleted_at
          ? `Department "${name}" was deleted — restore it from Deleted records instead of adding it again.`
          : `Department "${name}" already exists.`
      )
    }
    const row = await table.create({
      data: { name, description, status: 'active', created_by: actorId },
    })
    // Fire-and-forget: audit is best-effort and each DB hop currently costs
    // seconds on this network — don't hold the dialog spinner for it.
    void writeAuditLog({
      userId: actorId,
      action: 'master-data:create_department',
      module: 'master-data',
      details: { purpose: 'Create department', summary: `Added department "${name}"`, reference_id: row.id },
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to add department.' }
  }
  revalidate()
  return { ok: true }
}

export async function setDepartmentStatus(
  id: string,
  status: 'active' | 'inactive'
): Promise<{ ok: boolean; error?: string }> {
  let actorId = ''
  try {
    ;({ userId: actorId } = await requireSuperAdmin())
    const table = departmentsTable()
    if (!table) throw new Error('Departments table is not ready yet — restart the dev server.')
    const row = await table.findUnique({ where: { id } })
    if (!row) throw new Error('Department not found.')
    if (status === 'inactive' && (await departmentUsage(row.name)) > 0) {
      throw new Error(`"${row.name}" is assigned to personnel and cannot be deactivated.`)
    }
    await table.update({ where: { id }, data: { status } })
    // Fire-and-forget (see createDepartment): audit must not gate the UI.
    void writeAuditLog({
      userId: actorId,
      action: status === 'active' ? 'master-data:reactivate_department' : 'master-data:deactivate_department',
      module: 'master-data',
      details: { purpose: 'Toggle department', summary: `${status} department "${row.name}"`, reference_id: id },
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Update failed.' }
  }
  revalidate()
  return { ok: true }
}

export async function createCatalogEntry(
  _prev: { ok: boolean; error?: string },
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  let actorId = ''
  try {
    ;({ userId: actorId } = await requireSuperAdmin())
    const account_code = ((formData.get('account_code') as string) ?? '').trim()
    const account_title = (((formData.get('account_title') as string) ?? '').trim() || 'GENERAL').toUpperCase()
    const account_name = ((formData.get('account_name') as string) ?? '').trim() || null
    const asset_type = ((formData.get('asset_type') as string) ?? '').trim() || 'General'
    const description = ((formData.get('description') as string) ?? '').trim() || null
    if (!account_code) throw new Error('Account code is required.')
    const existing = await prisma.accountCatalog.findUnique({ where: { account_code } })
    if (existing) {
      throw new Error(
        existing.deleted_at
          ? `Code "${account_code}" was deleted — restore it from Deleted records instead of adding it again.`
          : `Code "${account_code}" already exists.`
      )
    }
    const row = await prisma.accountCatalog.create({
      data: { account_code, account_title, account_name, asset_type, description, status: 'active', created_by: actorId },
    })
    // Fire-and-forget (see createUnit): audit must not gate the UI.
    void writeAuditLog({
      userId: actorId,
      action: 'master-data:create_catalog',
      module: 'master-data',
      details: {
        purpose: 'Create account catalog entry',
        summary: `Added ${account_code} · ${account_title} · ${asset_type}`,
        reference_id: row.id,
      },
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to add entry.' }
  }
  revalidate()
  return { ok: true }
}

export async function updateCatalogEntry(
  id: string,
  input: { account_title: string; account_name?: string | null; asset_type: string; description: string | null }
): Promise<{ ok: boolean; error?: string }> {
  let actorId = ''
  try {
    ;({ userId: actorId } = await requireSuperAdmin())
    const row = await prisma.accountCatalog.findUnique({ where: { id } })
    if (!row) throw new Error('Entry not found.')
    const account_title = (input.account_title ?? '').trim().toUpperCase()
    const account_name = (input.account_name ?? '').trim() || null
    const asset_type = (input.asset_type ?? '').trim()
    if (!account_title || !asset_type) throw new Error('Title and asset type are required.')
    await prisma.accountCatalog.update({
      where: { id },
      data: { account_title, account_name, asset_type, description: (input.description ?? '').trim() || null },
    })
    // Fire-and-forget (see createUnit): audit must not gate the UI.
    void writeAuditLog({
      userId: actorId,
      action: 'master-data:update_catalog',
      module: 'master-data',
      details: { purpose: 'Update catalog entry', summary: `Updated ${row.account_code}`, reference_id: id },
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Update failed.' }
  }
  revalidate()
  return { ok: true }
}

export async function setCatalogStatus(
  id: string,
  status: 'active' | 'inactive'
): Promise<{ ok: boolean; error?: string }> {
  let actorId = ''
  try {
    ;({ userId: actorId } = await requireSuperAdmin())
    const row = await prisma.accountCatalog.findUnique({ where: { id } })
    if (!row) throw new Error('Entry not found.')
    if (status === 'inactive' && (await catalogUsage(row.account_code)) > 0) {
      throw new Error(`Code "${row.account_code}" is in use and cannot be deactivated.`)
    }
    await prisma.accountCatalog.update({ where: { id }, data: { status } })
    // Fire-and-forget (see createUnit): audit must not gate the UI.
    void writeAuditLog({
      userId: actorId,
      action: status === 'active' ? 'master-data:reactivate_catalog' : 'master-data:deactivate_catalog',
      module: 'master-data',
      details: { purpose: 'Toggle catalog entry', summary: `${status} ${row.account_code}`, reference_id: id },
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Update failed.' }
  }
  revalidate()
  return { ok: true }
}

/**
 * Permanently remove soft-deleted rows that have passed the archive retention
 * window. Runs lazily whenever the archive is read (no scheduler needed); a
 * row whose delete is still blocked by usage simply stays until it is cleared.
 */
async function purgeExpiredMasterData(actorId: string): Promise<number> {
  const where = { deleted_at: { not: null, lte: archiveCutoff() } }
  const results = await Promise.allSettled([
    prisma.unit.deleteMany({ where }),
    prisma.accountCatalog.deleteMany({ where }),
    prisma.stockType.deleteMany({ where }),
    (async () => {
      const table = departmentsTable()
      return table ? table.deleteMany({ where }) : { count: 0 }
    })(),
  ])
  let removed = 0
  for (const result of results) {
    if (result.status === 'fulfilled') {
      removed += result.value.count ?? 0
    } else {
      // Most likely a foreign-key guard: keep the row and try again next read.
      console.error('[purgeExpiredMasterData]', result.reason)
    }
  }
  if (removed > 0) {
    void writeAuditLog({
      userId: actorId,
      action: 'master-data:purge_expired',
      module: 'master-data',
      details: {
        purpose: 'Auto-delete expired archived records',
        summary: `Permanently deleted ${removed} archived record${removed === 1 ? '' : 's'} past the retention window`,
      },
    })
  }
  return removed
}

export async function getDeletedMasterData(): Promise<DeletedMasterData> {
  let actorId = ''
  try {
    ;({ userId: actorId } = await requireSuperAdmin())
  } catch {
    return { units: [], catalog: [], departments: [], stockTypes: [] }
  }
  const { withScopedCache } = await import('@/lib/personnel-cache')
  return withScopedCache('super-admin:master-deleted', 60, async () => {
    await purgeExpiredMasterData(actorId)
    try {
      const [unitRows, catalogRows, stockTypeRows] = await Promise.all([
        prisma.unit.findMany({
          where: { deleted_at: { not: null } },
          orderBy: { name: 'asc' },
        }),
        prisma.accountCatalog.findMany({
          where: { deleted_at: { not: null } },
          orderBy: { account_code: 'asc' },
        }),
        prisma.stockType.findMany({
          where: { deleted_at: { not: null } },
          orderBy: { name: 'asc' },
        }),
      ])

      const table = departmentsTable()
      const departmentRows: Array<{
        id: string
        name: string
        description: string | null
        status: string
        created_at?: Date | null
        deleted_at?: Date | null
      }> = table
        ? await table.findMany({
            where: { deleted_at: { not: null } },
            orderBy: { name: 'asc' },
          })
        : []

      return {
        units: unitRows.map((r) => ({
          id: r.id,
          name: r.name,
          abbreviation: r.abbreviation,
          status: r.status,
          usage: 0,
          created_at: r.created_at?.toISOString() ?? null,
          deleted_at: r.deleted_at?.toISOString() ?? null,
        })),
        catalog: catalogRows.map((r) => ({
          id: r.id,
          account_code: r.account_code,
          account_title: r.account_title,
          account_name: r.account_name,
          asset_type: r.asset_type,
          description: r.description,
          status: r.status,
          usage: 0,
          created_at: r.created_at?.toISOString() ?? null,
          deleted_at: r.deleted_at?.toISOString() ?? null,
        })),
        stockTypes: stockTypeRows.map((r) => ({
          id: r.id,
          name: r.name,
          account_code: r.account_code,
          asset_type: r.asset_type,
          account_title: r.account_title,
          account_name: r.account_name,
          description: r.description,
          status: r.status,
          usage: 0,
          created_at: r.created_at?.toISOString() ?? null,
          deleted_at: r.deleted_at?.toISOString() ?? null,
        })),
        departments: departmentRows.map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          status: r.status,
          usage: 0,
          created_at: r.created_at?.toISOString() ?? null,
          deleted_at: r.deleted_at?.toISOString() ?? null,
        })),
      }
    } catch (e) {
      console.error('[getDeletedMasterData]', e)
      return { units: [], catalog: [], departments: [], stockTypes: [] }
    }
  })
}

/**
 * Soft delete / restore for the four master-data lists. Deleting only stamps
 * `deleted_at` (rows stay in the DB so history keeps resolving); restoring
 * clears it. Deleting is blocked while the record is still in use, exactly
 * like deactivation.
 */
export type MasterDataKind = 'unit' | 'department' | 'stock_type' | 'catalog'

export interface RestoreSelection {
  kind: MasterDataKind
  id: string
}

/** Restore many soft-deleted rows in one round-trip. */
export async function restoreMasterData(
  items: RestoreSelection[]
): Promise<{ ok: boolean; error?: string; restored?: number }> {
  let actorId = ''
  try {
    ;({ userId: actorId } = await requireSuperAdmin())
    const byKind = (kind: MasterDataKind) =>
      items.filter((i) => i.kind === kind).map((i) => i.id)
    const unitIds = byKind('unit')
    const catalogIds = byKind('catalog')
    const stockTypeIds = byKind('stock_type')
    const departmentIds = byKind('department')
    if (!unitIds.length && !catalogIds.length && !stockTypeIds.length && !departmentIds.length) {
      throw new Error('Select at least one record to restore.')
    }

    let restored = 0
    if (unitIds.length) {
      const r = await prisma.unit.updateMany({
        where: { id: { in: unitIds }, deleted_at: { not: null } },
        data: { deleted_at: null },
      })
      restored += r.count
    }
    if (catalogIds.length) {
      const r = await prisma.accountCatalog.updateMany({
        where: { id: { in: catalogIds }, deleted_at: { not: null } },
        data: { deleted_at: null },
      })
      restored += r.count
    }
    if (stockTypeIds.length) {
      const r = await prisma.stockType.updateMany({
        where: { id: { in: stockTypeIds }, deleted_at: { not: null } },
        data: { deleted_at: null },
      })
      restored += r.count
    }
    if (departmentIds.length) {
      const table = departmentsTable()
      if (!table) throw new Error('Departments table is not ready yet — restart the dev server.')
      const r = await table.updateMany({
        where: { id: { in: departmentIds }, deleted_at: { not: null } },
        data: { deleted_at: null },
      })
      restored += r.count
    }

    void writeAuditLog({
      userId: actorId,
      action: 'master-data:restore_records',
      module: 'master-data',
      details: {
        purpose: 'Bulk restore master data',
        summary: `Restored ${restored} deleted record${restored === 1 ? '' : 's'}`,
      },
    })
    revalidate()
    return { ok: true, restored }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Restore failed.' }
  }
}

/**
 * Permanently delete archived rows (hard delete). This is only allowed for
 * records that are already soft-deleted and no longer referenced anywhere;
 * the same usage guards as soft delete apply, so history cannot be broken.
 */
export async function deleteMasterDataPermanently(
  items: RestoreSelection[]
): Promise<{ ok: boolean; error?: string; deleted?: number }> {
  let actorId = ''
  try {
    ;({ userId: actorId } = await requireSuperAdmin())
    const byKind = (kind: MasterDataKind) =>
      items.filter((i) => i.kind === kind).map((i) => i.id)
    const unitIds = byKind('unit')
    const catalogIds = byKind('catalog')
    const stockTypeIds = byKind('stock_type')
    const departmentIds = byKind('department')
    if (!unitIds.length && !catalogIds.length && !stockTypeIds.length && !departmentIds.length) {
      throw new Error('Select at least one record to delete.')
    }

    // Validate every record up front so a bulk delete is all-or-nothing for
    // usage violations (no partial surprise removals).
    if (unitIds.length) {
      const rows = await prisma.unit.findMany({
        where: { id: { in: unitIds }, deleted_at: { not: null } },
        select: { name: true },
      })
      for (const row of rows) {
        if ((await unitUsage(row.name)) > 0) {
          throw new Error(`"${row.name}" is in use and cannot be permanently deleted.`)
        }
      }
    }
    if (catalogIds.length) {
      const rows = await prisma.accountCatalog.findMany({
        where: { id: { in: catalogIds }, deleted_at: { not: null } },
        select: { account_code: true },
      })
      for (const row of rows) {
        if ((await catalogUsage(row.account_code)) > 0) {
          throw new Error(`Code "${row.account_code}" is in use and cannot be permanently deleted.`)
        }
      }
    }
    if (stockTypeIds.length) {
      const rows = await prisma.stockType.findMany({
        where: { id: { in: stockTypeIds }, deleted_at: { not: null } },
        select: { name: true },
      })
      for (const row of rows) {
        if ((await stockTypeUsage(row.name)) > 0) {
          throw new Error(`"${row.name}" is used by deliveries and cannot be permanently deleted.`)
        }
      }
    }
    if (departmentIds.length) {
      const table = departmentsTable()
      if (!table) throw new Error('Departments table is not ready yet — restart the dev server.')
      const rows = await table.findMany({
        where: { id: { in: departmentIds }, deleted_at: { not: null } },
        select: { name: true },
      })
      for (const row of rows) {
        if ((await departmentUsage(row.name)) > 0) {
          throw new Error(`"${row.name}" is assigned to personnel and cannot be permanently deleted.`)
        }
      }
    }

    const whereDeleted = (ids: string[]) => ({
      id: { in: ids },
      deleted_at: { not: null },
    })
    let deleted = 0
    if (unitIds.length) {
      deleted += (await prisma.unit.deleteMany({ where: whereDeleted(unitIds) })).count
    }
    if (catalogIds.length) {
      deleted += (await prisma.accountCatalog.deleteMany({ where: whereDeleted(catalogIds) })).count
    }
    if (stockTypeIds.length) {
      deleted += (await prisma.stockType.deleteMany({ where: whereDeleted(stockTypeIds) })).count
    }
    if (departmentIds.length) {
      const table = departmentsTable()
      if (!table) throw new Error('Departments table is not ready yet — restart the dev server.')
      deleted += (await table.deleteMany({ where: whereDeleted(departmentIds) })).count
    }

    void writeAuditLog({
      userId: actorId,
      action: 'master-data:permanently_delete_records',
      module: 'master-data',
      details: {
        purpose: 'Permanently delete archived master data',
        summary: `Permanently deleted ${deleted} archived record${deleted === 1 ? '' : 's'}`,
      },
    })
    revalidate()
    return { ok: true, deleted }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Permanent delete failed.' }
  }
}

export async function setUnitDeleted(
  id: string,
  deleted: boolean
): Promise<{ ok: boolean; error?: string }> {
  let actorId = ''
  try {
    ;({ userId: actorId } = await requireSuperAdmin())
    const row = await prisma.unit.findUnique({ where: { id } })
    if (!row) throw new Error('Unit not found.')
    if (deleted && (await unitUsage(row.name)) > 0) {
      throw new Error(`"${row.name}" is in use and cannot be deleted.`)
    }
    await prisma.unit.update({ where: { id }, data: { deleted_at: deleted ? new Date() : null } })
    void writeAuditLog({
      userId: actorId,
      action: deleted ? 'master-data:delete_unit' : 'master-data:restore_unit',
      module: 'master-data',
      details: {
        purpose: deleted ? 'Soft delete unit' : 'Restore unit',
        summary: `${deleted ? 'Deleted' : 'Restored'} unit "${row.name}"`,
        reference_id: id,
      },
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Delete failed.' }
  }
  revalidate()
  return { ok: true }
}

export async function setDepartmentDeleted(
  id: string,
  deleted: boolean
): Promise<{ ok: boolean; error?: string }> {
  let actorId = ''
  try {
    ;({ userId: actorId } = await requireSuperAdmin())
    const table = departmentsTable()
    if (!table) throw new Error('Departments table is not ready yet — restart the dev server.')
    const row = await table.findUnique({ where: { id } })
    if (!row) throw new Error('Department not found.')
    if (deleted && (await departmentUsage(row.name)) > 0) {
      throw new Error(`"${row.name}" is assigned to personnel and cannot be deleted.`)
    }
    await table.update({ where: { id }, data: { deleted_at: deleted ? new Date() : null } })
    void writeAuditLog({
      userId: actorId,
      action: deleted ? 'master-data:delete_department' : 'master-data:restore_department',
      module: 'master-data',
      details: {
        purpose: deleted ? 'Soft delete department' : 'Restore department',
        summary: `${deleted ? 'Deleted' : 'Restored'} department "${row.name}"`,
        reference_id: id,
      },
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Delete failed.' }
  }
  revalidate()
  return { ok: true }
}

export async function setStockTypeDeleted(
  id: string,
  deleted: boolean
): Promise<{ ok: boolean; error?: string }> {
  let actorId = ''
  try {
    ;({ userId: actorId } = await requireSuperAdmin())
    const row = await prisma.stockType.findUnique({ where: { id } })
    if (!row) throw new Error('Stock header not found.')
    if (deleted && (await stockTypeUsage(row.name)) > 0) {
      throw new Error(`"${row.name}" is used by deliveries and cannot be deleted.`)
    }
    await prisma.stockType.update({ where: { id }, data: { deleted_at: deleted ? new Date() : null } })
    void writeAuditLog({
      userId: actorId,
      action: deleted ? 'master-data:delete_stock_type' : 'master-data:restore_stock_type',
      module: 'master-data',
      details: {
        purpose: deleted ? 'Soft delete stock header' : 'Restore stock header',
        summary: `${deleted ? 'Deleted' : 'Restored'} stock header "${row.name}"`,
        reference_id: id,
      },
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Delete failed.' }
  }
  revalidate()
  return { ok: true }
}

export async function setCatalogDeleted(
  id: string,
  deleted: boolean
): Promise<{ ok: boolean; error?: string }> {
  let actorId = ''
  try {
    ;({ userId: actorId } = await requireSuperAdmin())
    const row = await prisma.accountCatalog.findUnique({ where: { id } })
    if (!row) throw new Error('Entry not found.')
    if (deleted && (await catalogUsage(row.account_code)) > 0) {
      throw new Error(`Code "${row.account_code}" is in use and cannot be deleted.`)
    }
    await prisma.accountCatalog.update({
      where: { id },
      data: { deleted_at: deleted ? new Date() : null },
    })
    void writeAuditLog({
      userId: actorId,
      action: deleted ? 'master-data:delete_catalog' : 'master-data:restore_catalog',
      module: 'master-data',
      details: {
        purpose: deleted ? 'Soft delete catalog entry' : 'Restore catalog entry',
        summary: `${deleted ? 'Deleted' : 'Restored'} ${row.account_code}`,
        reference_id: id,
      },
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Delete failed.' }
  }
  revalidate()
  return { ok: true }
}


// Only columns whose header matches one of CATALOG_EXCEL_HEADERS
// (case-insensitive, trimmed, any order — extra columns are ignored).
// Each row is handled independently: duplicates (repeated in the file or
// already in the catalog) are skipped with a message; only new codes are
// added. Existing records are never overwritten by an import.

export interface ImportCatalogState {
  ok?: boolean
  success?: boolean
  error?: string
  created?: number
  skipped?: number
  errors?: string[]
  /** Rows omitted from `errors` when the per-row list exceeds the cap. */
  omitted?: number
  matched?: string[]
}

/** Max per-row messages returned to the client (the result modal scrolls). */
const MAX_IMPORT_MESSAGES = 200

function capMessages(messages: string[]): Pick<ImportCatalogState, 'errors' | 'omitted'> {
  return {
    errors: messages.slice(0, MAX_IMPORT_MESSAGES),
    omitted: Math.max(0, messages.length - MAX_IMPORT_MESSAGES),
  }
}

function cellToValue(value: unknown): unknown {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return value
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>
    if ('result' in v && v.result !== undefined && v.result !== null) return v.result
    if ('text' in v && typeof v.text === 'string') return v.text
    if ('richText' in v && Array.isArray(v.richText))
      return (v.richText as Array<{ text?: string }>).map((r) => r.text ?? '').join('')
    if ('hyperlink' in v && typeof v.hyperlink === 'string') return v.hyperlink
  }
  return String(value)
}

function strVal(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (v instanceof Date) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

function pickWorksheet(wb: ExcelJS.Workbook): ExcelJS.Worksheet | undefined {
  const named =
    wb.getWorksheet(CATALOG_TEMPLATE_SHEET) ?? wb.getWorksheet(CATALOG_LEGACY_SHEET)
  if (named) return named
  // Fall back to the first sheet whose header row contains ACCOUNT CODE
  // (covers re-saved client files with a renamed tab).
  for (const ws of wb.worksheets) {
    let found = false
    ws.getRow(1).eachCell({ includeEmpty: true }, (cell) => {
      const raw = cellToValue(cell.value)
      if (raw !== null && String(raw).trim().toUpperCase() === 'ACCOUNT CODE') found = true
    })
    if (found) return ws
  }
  return wb.worksheets[0]
}

export async function importCatalogFromExcel(
  _prev: ImportCatalogState,
  formData: FormData
): Promise<ImportCatalogState> {
  let actorId = ''
  try {
    ;({ userId: actorId } = await requireSuperAdmin())
  } catch {
    return { ok: false, success: false, error: 'Unauthorized.' }
  }

  const file = formData.get('file')
  if (!file || !(file instanceof File) || file.size === 0)
    return { ok: false, success: false, error: 'Choose an .xlsx file to import.' }
  if (file.size > 10 * 1024 * 1024)
    return { ok: false, success: false, error: 'File is too large (max 10 MB).' }

  let wb: ExcelJS.Workbook
  try {
    wb = new ExcelJS.Workbook()
    const buf = await file.arrayBuffer()
    await wb.xlsx.load(buf)
  } catch (e) {
    console.error('[importCatalogFromExcel] load', e)
    return {
      ok: false,
      success: false,
      error: 'Could not read that Excel file. Use the downloaded template (.xlsx).',
    }
  }

  const ws = pickWorksheet(wb)
  if (!ws) return { ok: false, success: false, error: 'No worksheet found in that file.' }

  // Map normalized (trimmed, uppercased) header -> column index.
  // Only the 4 known headers are picked up — extra columns in the client's
  // own file are ignored, and column order does not matter.
  const colByHeader = new Map<string, number>()
  const foundHeaders: string[] = []
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
    const raw = cellToValue(cell.value)
    const key = raw === null ? '' : String(raw).trim().toUpperCase()
    if (key) {
      foundHeaders.push(String(raw).trim())
      if (CATALOG_EXCEL_HEADERS.includes(key) && !colByHeader.has(key)) {
        colByHeader.set(key, col)
      }
    }
  })

  if (!colByHeader.has('ACCOUNT CODE'))
    return {
      ok: false,
      success: false,
      error: `No "ACCOUNT CODE" column found — the import reads only columns matching ${CATALOG_EXCEL_HEADERS.join(', ')}. Columns seen: ${foundHeaders.join(', ') || '(none)'}.`,
    }

  const matched = CATALOG_EXCEL_HEADERS.filter((h) => colByHeader.has(h))

  const at = (row: ExcelJS.Row, header: string): unknown => {
    const col = colByHeader.get(header)
    if (!col) return null
    return cellToValue(row.getCell(col).value)
  }

  let created = 0
  let skipped = 0
  const messages: string[] = []
  const seenInFile = new Set<string>()

  // Load existing codes once so every row can be duplicate-checked. Codes of
  // soft-deleted rows still exist in the DB (unique constraint), so we track
  // them separately to point the user at "restore" instead of re-importing.
  let existingCodes = new Set<string>()
  const deletedCodes = new Set<string>()
  try {
    const rows = await prisma.accountCatalog.findMany({
      select: { account_code: true, deleted_at: true },
    })
    existingCodes = new Set(rows.map((r) => r.account_code))
    for (const r of rows) if (r.deleted_at) deletedCodes.add(r.account_code)
  } catch (e) {
    console.error('[importCatalogFromExcel] preload codes', e)
    return { ok: false, success: false, error: 'Could not read the current catalog. Try again.' }
  }

  const last = ws.lastRow?.number ?? ws.rowCount
  for (let i = 2; i <= last; i++) {
    const row = ws.getRow(i)
    const account_code = strVal(at(row, 'ACCOUNT CODE'))
    if (!account_code) {
      let hasAny = false
      row.eachCell({ includeEmpty: false }, () => {
        hasAny = true
      })
      if (hasAny) skipped++
      continue
    }

    // Duplicate inside this file → message + skip (first occurrence wins).
    if (seenInFile.has(account_code)) {
      skipped++
      messages.push(`Row ${i} (${account_code}): duplicate code in this file — skipped.`)
      continue
    }
    seenInFile.add(account_code)

    // Already in the catalog → message + skip (imports never overwrite).
    if (existingCodes.has(account_code)) {
      skipped++
      messages.push(
        deletedCodes.has(account_code)
          ? `Row ${i} (${account_code}): already exists but was deleted — restore it in Master Data instead.`
          : `Row ${i} (${account_code}): already exists — skipped.`
      )
      continue
    }

    const asset_type = strVal(at(row, 'ASSET TYPE')) || 'General'
    const account_title = (strVal(at(row, 'ACCOUNT TITLE')) || 'GENERAL').toUpperCase()
    const account_name = strVal(at(row, 'ACCOUNT NAME'))

    try {
      await prisma.accountCatalog.create({
        data: {
          account_code,
          account_title,
          account_name,
          asset_type,
          status: 'active',
          created_by: actorId,
        },
      })
      existingCodes.add(account_code)
      created++
    } catch (e) {
      console.error(`[importCatalogFromExcel] row ${i}`, e)
      skipped++
      messages.push(
        `Row ${i} (${account_code}): could not save (${e instanceof Error ? e.message.slice(0, 120) : 'unknown error'}).`
      )
    }
  }

  if (created === 0)
    return {
      ok: false,
      success: false,
      error: 'No new rows added — every ACCOUNT CODE was already in the catalog or duplicated in the file.',
      skipped,
      ...capMessages(messages),
      matched,
    }

  // Fire-and-forget (see createUnit): audit is best-effort and must neither
  // fail the import nor hold its response on slow networks.
  void writeAuditLog({
    userId: actorId,
    action: 'master-data:import_catalog',
    module: 'master-data',
    details: {
      purpose: 'Bulk import account catalog',
      summary: `Catalog import: ${created} added · ${skipped} skipped (duplicates)`,
    },
  })

  revalidate()
  return { ok: true, success: true, created, skipped, ...capMessages(messages), matched }
}
