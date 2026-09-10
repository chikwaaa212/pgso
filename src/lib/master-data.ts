import 'server-only'

import prisma from '@/lib/prisma'

export interface CatalogEntry {
  code: string
  title: string
  type: string
}

/**
 * Shared strict-mode validators. The account catalog is authoritative:
 * callers must reject unknown codes/units instead of free-typing them.
 * Catalog lookups only consider `status = 'active'` rows.
 */

export async function getActiveCatalogEntries(): Promise<CatalogEntry[]> {
  try {
    const rows = await prisma.accountCatalog.findMany({
      where: { status: 'active' },
      orderBy: { account_code: 'asc' },
      select: { account_code: true, account_title: true, asset_type: true },
    })
    return rows.map((r) => ({
      code: r.account_code,
      title: r.account_title,
      type: r.asset_type,
    }))
  } catch (e) {
    console.error('[getActiveCatalogEntries]', e)
    return []
  }
}

export async function findCatalogEntry(code: string): Promise<CatalogEntry | null> {
  const c = (code ?? '').trim()
  if (!c) return null
  try {
    const row = await prisma.accountCatalog.findFirst({
      where: { account_code: c, status: 'active' },
      select: { account_code: true, account_title: true, asset_type: true },
    })
    if (!row) return null
    return { code: row.account_code, title: row.account_title, type: row.asset_type }
  } catch (e) {
    console.error('[findCatalogEntry]', e)
    return null
  }
}

export async function getActiveUnitNames(): Promise<string[]> {
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
