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
      where: { status: 'active' },
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
      where: { account_code: c, status: 'active' },
      select: { account_code: true, account_title: true, asset_type: true, account_name: true },
    })
    if (!row) return null
    return { code: row.account_code, title: row.account_title, type: row.asset_type, name: row.account_name }
  } catch (e) {
    console.error('[findCatalogEntry]', e)
    return null
  }
}

export async function getActiveUnitNames(): Promise<string[]> {
  const { withCache, cacheKey } = await import('@/lib/personnel-cache')
  return withCache(cacheKey('catalog:units'), 300, async () => {
    try {
      const rows = await prisma.unit.findMany({
        where: { status: 'active' },
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
      where: { name: { equals: t, mode: 'insensitive' }, status: 'active' },
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
        where: { status: 'active' },
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
      where: { name: { equals: t, mode: 'insensitive' }, status: 'active' },
      select: { name: true },
    })
    return row?.name ?? null
  } catch (e) {
    console.error('[resolveDepartmentName]', e)
    return null
  }
}
