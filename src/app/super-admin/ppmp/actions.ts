'use server'

import prisma from '@/lib/prisma'
import { requireSuperAdmin } from '@/lib/auth-guard'
import type { Prisma } from '@prisma/client'
import type { PagedResult } from '@/lib/paged'

export interface AdminPpmpFileRow {
  id: string
  filename: string
  fiscal_year: number | null
  fiscal_year_source: string | null
  row_count: number | null
  file_size: number | null
  status: string | null
  file_hash: string | null
  created_by: string
  uploader_name: string | null
  created_at: string | null
}

export type AdminPpmpFilesPage = PagedResult<AdminPpmpFileRow>

export interface AdminPpmpSummary {
  files: number
  rows: number
  bytes: number
  uploaders: number
  fiscalYears: number[]
}

const EMPTY_PAGE: AdminPpmpFilesPage = {
  rows: [],
  data: [],
  total: 0,
  page: 1,
  pageSize: 15,
  totalPages: 1,
}

/** Uploader display names for a bounded set of profile ids. Never throws. */
async function uploaderNames(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return new Map()
  try {
    const rows = await prisma.profile.findMany({
      where: { id: { in: unique } },
      select: { id: true, full_name: true },
    })
    return new Map(rows.map((r) => [r.id, (r.full_name ?? '').trim() || 'Unnamed user']))
  } catch {
    return new Map()
  }
}

/**
 * System-wide PPMP workbook registry (super-admin only): every uploaded
 * workbook, who uploaded it, when, its fiscal year/rows/size, and a bounded
 * server window with exact totals. Search covers filename, uploader name,
 * and a 4-digit fiscal year. Fail-closed for non-admins.
 */
export async function getPpmpFilesPage(
  opts: { page?: number; q?: string; fiscalYear?: number | null } = {}
): Promise<AdminPpmpFilesPage> {
  try {
    await requireSuperAdmin()
  } catch {
    return EMPTY_PAGE
  }
  const { withScopedCache } = await import('@/lib/personnel-cache')
  const { PAGE_SIZE } = await import('@/lib/constants')
  const { parsePage, parseQuery, pageResponse } = await import('@/lib/paged')
  const page = parsePage(opts.page)
  const q = parseQuery(opts.q)
  const fiscalYear =
    opts.fiscalYear === null || opts.fiscalYear === undefined ? null : opts.fiscalYear
  // Named under `ppmp:` so upload/delete busts (bustCachePrefixes(["ppmp:"]))
  // also clear this admin registry window.
  return withScopedCache('ppmp:admin-files-page', 30, async () => {
    try {
      const and: Prisma.PpmpFileWhereInput[] = []
      if (fiscalYear !== null) and.push({ fiscal_year: fiscalYear })
      if (q) {
        const or: Prisma.PpmpFileWhereInput[] = [
          { filename: { contains: q, mode: 'insensitive' } },
        ]
        try {
          const matched = await prisma.profile.findMany({
            where: { full_name: { contains: q, mode: 'insensitive' } },
            take: 50,
            select: { id: true },
          })
          if (matched.length > 0) {
            or.push({ created_by: { in: matched.map((m) => m.id) } })
          }
        } catch {
          /* name search is best-effort */
        }
        const year = Number(q)
        if (Number.isInteger(year) && year >= 1990 && year <= 2100) {
          or.push({ fiscal_year: year })
        }
        and.push({ OR: or })
      }
      const where: Prisma.PpmpFileWhereInput = and.length > 0 ? { AND: and } : {};

      const [total, rows] = await Promise.all([
        prisma.ppmpFile.count({ where }),
        prisma.ppmpFile.findMany({
          where,
          orderBy: { created_at: 'desc' },
          skip: (page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
          select: {
            id: true,
            filename: true,
            fiscal_year: true,
            fiscal_year_source: true,
            row_count: true,
            file_size: true,
            status: true,
            file_hash: true,
            created_by: true,
            created_at: true,
          },
        }),
      ])
      const names = await uploaderNames(rows.map((r) => r.created_by))
      const mapped: AdminPpmpFileRow[] = rows.map((r) => ({
        ...r,
        uploader_name: names.get(r.created_by) ?? null,
        created_at: r.created_at?.toISOString() ?? null,
      }))
      return pageResponse(mapped, total, page, PAGE_SIZE)
    } catch {
      // Pre-migration DB fallback: legacy columns only.
      try {
        const where = q ? { filename: { contains: q, mode: 'insensitive' as const } } : {}
        const [total, rows] = await Promise.all([
          prisma.ppmpFile.count({ where }),
          prisma.ppmpFile.findMany({
            where,
            orderBy: { created_at: 'desc' },
            skip: (page - 1) * PAGE_SIZE,
            take: PAGE_SIZE,
            select: {
              id: true,
              filename: true,
              file_size: true,
              created_by: true,
              created_at: true,
            },
          }),
        ])
        const names = await uploaderNames(rows.map((r) => r.created_by))
        const mapped: AdminPpmpFileRow[] = rows.map((r) => ({
          ...r,
          fiscal_year: null,
          fiscal_year_source: null,
          row_count: null,
          status: null,
          file_hash: null,
          uploader_name: names.get(r.created_by) ?? null,
          created_at: r.created_at?.toISOString() ?? null,
        }))
        return pageResponse(mapped, total, page, PAGE_SIZE)
      } catch (e) {
        console.error('[getPpmpFilesPage]', e)
        return EMPTY_PAGE
      }
    }
  })
}

/** Registry totals for the admin header cards (30s cache). Never throws. */
export async function getPpmpFilesSummary(): Promise<AdminPpmpSummary> {
  const empty: AdminPpmpSummary = { files: 0, rows: 0, bytes: 0, uploaders: 0, fiscalYears: [] }
  try {
    await requireSuperAdmin()
  } catch {
    return empty
  }
  const { withScopedCache } = await import('@/lib/personnel-cache')
  return withScopedCache('ppmp:admin-files-summary', 30, async () => {
    try {
      const [agg, uploaders, years] = await Promise.all([
        prisma.ppmpFile.aggregate({
          _count: { _all: true },
          _sum: { file_size: true, row_count: true },
        }),
        prisma.ppmpFile.groupBy({ by: ['created_by'] }),
        prisma.ppmpFile.groupBy({
          by: ['fiscal_year'],
          orderBy: { fiscal_year: 'desc' },
        }),
      ])
      return {
        files: agg._count._all,
        rows: agg._sum.row_count ?? 0,
        bytes: agg._sum.file_size ?? 0,
        uploaders: uploaders.length,
        fiscalYears: years
          .map((y) => y.fiscal_year)
          .filter((y): y is number => typeof y === 'number'),
      }
    } catch {
      try {
        const total = await prisma.ppmpFile.count()
        return { ...empty, files: total }
      } catch (e) {
        console.error('[getPpmpFilesSummary]', e)
        return empty
      }
    }
  })
}
