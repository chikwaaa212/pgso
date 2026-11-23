import 'server-only'

import prisma from '@/lib/prisma'

export interface CatalogEntry {
  code: string
  title: string
  type: string
  name?: string | null
}

/**
 * Shared strict-mode validators. The account catalog is authoritative:
 * callers must reject unknown codes/units instead of free-typing them.
 * Catalog lookups only consider `status = 'active'` rows.
 */

export async function getActiveCatalogEntries(): Promise<CatalogEntry[]> {
  const { withCache, cacheKey } = await import('@/lib/personnel-cache')
  return withCache(cacheKey('catalog:entries'), 300, async () => {
    try {
    const rows = await prisma.accountCatalog.findMany({
      where: { status: 'active', deleted_at: null },
      orderBy: { account_code: 'asc' },
      select: { account_code: true, account_title: true, asset_type: true, account_name: true },
    })
    return rows.map((r) => ({
      code: r.account_code,
      title: r.account_title,
      type: r.asset_type,
      name: r.account_name,
    }))
  } catch (e) {
    console.error('[getActiveCatalogEntries]', e)
    return []
  }
  })
}

export async function findCatalogEntry(code: string): Promise<CatalogEntry | null> {
  const c = (code ?? '').trim()
  if (!c) return null
  try {
    const row = await prisma.accountCatalog.findFirst({
      where: { account_code: c, status: 'active', deleted_at: null },
      select: { account_code: true, account_title: true, asset_type: true, account_name: true },
    })
    if (!row) return null
    return { code: row.account_code, title: row.account_title, type: row.asset_type, name: row.account_name }
  } catch (e) {
    console.error('[findCatalogEntry]', e)
    return null
  }
}

export type EnsureCatalogResult =
  | { ok: true; entry: CatalogEntry; created: boolean }
  | { ok: false; error: string }

/**
 * Resolve an account code for a record being saved, adding it to Master Data
 * when it does not exist yet.
 *
 * Existing catalog rows are never modified — the catalog stays authoritative
 * for codes that were already approved. A code that is missing entirely is
 * created from the values the user just submitted, so saving an asset never
 * has to wait for a Super Admin to add it first. Codes that were deactivated
 * or soft-deleted are reported instead of silently re-activated/overwritten.
 *
 * Lookups are case-insensitive so a near-duplicate code (different casing)
 * resolves to the approved row instead of creating a second entry.
 */
export async function ensureCatalogEntry(input: {
  code: string
  title?: string | null
  type?: string | null
  name?: string | null
  createdBy?: string | null
}): Promise<EnsureCatalogResult> {
  const code = (input.code ?? '').trim()
  if (!code) return { ok: false, error: 'Account code is required.' }
  try {
    const active = await prisma.accountCatalog.findFirst({
      where: {
        account_code: { equals: code, mode: 'insensitive' },
        status: 'active',
        deleted_at: null,
      },
      select: { account_code: true, account_title: true, asset_type: true, account_name: true },
    })
    if (active) {
      return {
        ok: true,
        entry: {
          code: active.account_code,
          title: active.account_title,
          type: active.asset_type,
          name: active.account_name,
        },
        created: false,
      }
    }

    // A code that exists but is inactive/deleted must be restored explicitly —
    // an asset edit must not revive or overwrite previously retired master data.
    const existing = await prisma.accountCatalog.findFirst({
      where: { account_code: { equals: code, mode: 'insensitive' } },
      select: { deleted_at: true },
    })
    if (existing) {
      return {
        ok: false,
        error: existing.deleted_at
          ? `Account code "${code}" is in the deleted Master Data records — ask your Super Admin to restore it.`
          : `Account code "${code}" is inactive in Master Data — ask your Super Admin to reactivate it.`,
      }
    }

    const title = (input.title ?? '').trim().toUpperCase() || 'GENERAL'
    const type = (input.type ?? '').trim() || 'General'
    const name = (input.name ?? '').trim() || null
    try {
      const created = await prisma.accountCatalog.create({
        data: {
          account_code: code,
          account_title: title,
          account_name: name,
          asset_type: type,
          status: 'active',
          created_by: input.createdBy ?? null,
        },
        select: { account_code: true, account_title: true, asset_type: true, account_name: true },
      })
      // Pick-lists are cached separately (`catalog:` for server readers,
      // `master-data:` for the /api/master-data dropdown feed). Refresh both so
      // the new code/type is selectable immediately (best-effort, never gates
      // the save).
      void import('@/lib/personnel-cache')
        .then((m) => m.bustCachePrefixes(['catalog:', 'master-data:']))
        .catch(() => {})
      return {
        ok: true,
        entry: {
          code: created.account_code,
          title: created.account_title,
          type: created.asset_type,
          name: created.account_name,
        },
        created: true,
      }
    } catch (e) {
      // Another write raced the same new code — the winner is authoritative.
      const raced = await prisma.accountCatalog.findFirst({
        where: { account_code: { equals: code, mode: 'insensitive' } },
        select: { account_code: true, account_title: true, asset_type: true, account_name: true, status: true, deleted_at: true },
      })
      if (raced && raced.status === 'active' && !raced.deleted_at) {
        return {
          ok: true,
          entry: {
            code: raced.account_code,
            title: raced.account_title,
            type: raced.asset_type,
            name: raced.account_name,
          },
          created: false,
        }
      }
      console.error('[ensureCatalogEntry]', e)
      return { ok: false, error: `Could not save account code "${code}" to Master Data. Please try again.` }
    }
  } catch (e) {
    console.error('[ensureCatalogEntry]', e)
    return { ok: false, error: `Could not save account code "${code}" to Master Data. Please try again.` }
  }
}


export async function getActiveUnitNames(): Promise<string[]> {
  const { withCache, cacheKey } = await import('@/lib/personnel-cache')
  return withCache(cacheKey('catalog:units'), 300, async () => {
    try {
      const rows = await prisma.unit.findMany({
        where: { status: 'active', deleted_at: null },
        orderBy: { name: 'asc' },
        select: { name: true },
      })
      return rows.map((r) => r.name)
    } catch (e) {
      console.error('[getActiveUnitNames]', e)
      return []
    }
  })
}

/** Case-insensitive active-unit check. Returns the canonical name or null. */
export async function resolveUnitName(raw: string | null | undefined): Promise<string | null> {
  const t = (raw ?? '').trim()
  if (!t) return null
  try {
    const row = await prisma.unit.findFirst({
      where: { name: { equals: t, mode: 'insensitive' }, status: 'active', deleted_at: null },
      select: { name: true },
    })
    return row?.name ?? null
  } catch (e) {
    console.error('[resolveUnitName]', e)
    return null
  }
}

export interface DepartmentEntry {
  id: string
  name: string
}

/**
 * Active departments for pick-lists (personnel department selector, office
 * fields). Empty until the `departments` table exists — see migration 24.
 */
export async function getActiveDepartments(): Promise<DepartmentEntry[]> {
  const { withCache, cacheKey } = await import('@/lib/personnel-cache')
  return withCache(cacheKey('catalog:departments'), 300, async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const table = (prisma as any).department ?? null
      if (!table) return []
      const rows = await table.findMany({
        where: { status: 'active', deleted_at: null },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      })
      return rows as DepartmentEntry[]
    } catch (e) {
      console.error('[getActiveDepartments]', e)
      return []
    }
  })
}

/** Case-insensitive active-department check. Returns the canonical name or null. */
export async function resolveDepartmentName(
  raw: string | null | undefined
): Promise<string | null> {
  const t = (raw ?? '').trim()
  if (!t) return null
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const table = (prisma as any).department ?? null
    if (!table) return null
    const row = await table.findFirst({
      where: { name: { equals: t, mode: 'insensitive' }, status: 'active', deleted_at: null },
      select: { name: true },
    })
    return row?.name ?? null
  } catch (e) {
    console.error('[resolveDepartmentName]', e)
    return null
  }
}
