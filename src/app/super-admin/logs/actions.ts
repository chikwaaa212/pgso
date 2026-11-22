'use server'

import prisma from '@/lib/prisma'
import { requireSuperAdmin } from '@/lib/auth-guard'

export interface SystemLogRow {
  id: string
  user_name: string
  action: string
  module: string
  purpose: string | null
  summary: string | null
  reference_id: string | null
  /** Full audit payload — shown in the expanded row detail. */
  details: Record<string, unknown> | null
  created_at: string | null
}

export type LogRange = 'all' | 'today' | '7d' | '30d'
export type LogOrder = 'desc' | 'asc'

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return null
}

function normalizeRange(value: unknown): LogRange {
  return value === 'today' || value === '7d' || value === '30d' ? value : 'all'
}

function normalizeOrder(value: unknown): LogOrder {
  return value === 'asc' ? 'asc' : 'desc'
}

/** Start of the selected window, in Asia/Manila for "today". */
function rangeStart(range: LogRange): Date | null {
  if (range === 'all') return null
  const now = new Date()
  if (range === 'today') {
    const offsetMs = 8 * 60 * 60 * 1000
    const manila = new Date(now.getTime() + offsetMs)
    const startManila = Date.UTC(
      manila.getUTCFullYear(),
      manila.getUTCMonth(),
      manila.getUTCDate()
    )
    return new Date(startManila - offsetMs)
  }
  const days = range === '7d' ? 7 : 30
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
}

function asText(value: unknown): string | null {
  if (typeof value === 'string') {
    const t = value.trim()
    return t === '' ? null : t
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return null
}

export interface LogsPage {
  rows: SystemLogRow[]
  data: SystemLogRow[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/** Distinct audit modules for the filter dropdown (bounded, rarely changes). */
export async function getAdminLogModules(): Promise<string[]> {
  try {
    await requireSuperAdmin()
  } catch {
    return []
  }
  const { withScopedCache } = await import('@/lib/personnel-cache')
  return withScopedCache('super-admin:log-modules', 300, async () => {
    try {
      const rows = await prisma.$queryRaw<Array<{ module: string }>>`
        SELECT DISTINCT module FROM audit_logs WHERE module IS NOT NULL ORDER BY 1 LIMIT 100`
      return rows.map((r) => r.module).filter(Boolean)
    } catch (e) {
      console.error('[getAdminLogModules]', e)
      return []
    }
  })
}

/**
 * Server-paged audit window (PAGE_SIZE = 10) replacing the legacy take-500
 * snapshot + client slice: the DB returns only the window (+ exact total per
 * filter set, cached 30s). Search spans action/module/jsonb detail text plus
 * user names (bounded profile pre-lookup); module filters exactly.
 * Freshness is TTL-bound (30s): audit writes are too frequent to bust on
 * every mutation (see the invalidation map `logs` entry).
 */
export async function getLogsPage(
  opts: {
    page?: number
    q?: string
    module?: string
    range?: LogRange
    order?: LogOrder
  } = {}
): Promise<LogsPage> {
  try {
    await requireSuperAdmin()
  } catch {
    return { rows: [], data: [], total: 0, page: 1, pageSize: 10, totalPages: 1 }
  }
  const { withScopedCache } = await import('@/lib/personnel-cache')
  const { PAGE_SIZE } = await import('@/lib/constants')
  const { parsePage, parseQuery, pageResponse } = await import('@/lib/paged')
  const page = parsePage(opts.page)
  const q = parseQuery(opts.q)
  const mod = (opts.module ?? 'all').trim()
  const range = normalizeRange(opts.range)
  const order = normalizeOrder(opts.order)
  const pageSize = PAGE_SIZE
  return withScopedCache('super-admin:logs-page', 30, async () => {
  try {
    const { Prisma } = await import('@prisma/client')
    const like = q ? `%${q}%` : null
    // user_name lives on profiles: pre-resolve matching ids (bounded) so
    // name search keeps working on a server window.
    let nameIds: string[] = []
    if (like) {
      try {
        const matched = await prisma.profile.findMany({
          where: { full_name: { contains: q, mode: 'insensitive' } },
          take: 50,
          select: { id: true },
        })
        nameIds = matched.map((p) => p.id)
      } catch {
        nameIds = []
      }
    }
    const conds: InstanceType<typeof Prisma.Sql>[] = []
    if (mod !== 'all') conds.push(Prisma.sql`module = ${mod}`)
    const since = rangeStart(range)
    if (since) conds.push(Prisma.sql`created_at >= ${since}`)
    if (like) {
      const textMatch = Prisma.sql`(
        action ILIKE ${like} OR module ILIKE ${like}
        OR details->>'purpose' ILIKE ${like}
        OR details->>'summary' ILIKE ${like}
        OR details->>'description' ILIKE ${like}
        OR details->>'reference_id' ILIKE ${like}
      )`
      conds.push(
        nameIds.length > 0
          ? Prisma.sql`(${textMatch} OR user_id = ANY(${nameIds}::uuid[]))`
          : textMatch
      )
    }
    const whereClause = conds.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conds, ' AND ')}` : Prisma.empty
    const offset = (page - 1) * pageSize
    const direction = Prisma.raw(order === 'asc' ? 'ASC' : 'DESC')
    interface LogDb {
      id: string
      user_id: string
      action: string
      module: string
      details: unknown
      created_at: Date | string | null
    }
    const [countRows, rows] = await Promise.all([
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count FROM audit_logs ${whereClause}`,
      prisma.$queryRaw<LogDb[]>`
        SELECT id::text AS id, user_id::text AS user_id, action, module, details, created_at
        FROM audit_logs ${whereClause}
        ORDER BY created_at ${direction} LIMIT ${pageSize} OFFSET ${offset}`,
    ])
    const total = Number(countRows[0]?.count ?? 0)
    const ids = [...new Set(rows.map((r) => r.user_id))]
    const profiles = ids.length > 0
      ? await prisma.profile
          .findMany({ where: { id: { in: ids } }, select: { id: true, full_name: true } })
          .catch(() => [] as { id: string; full_name: string | null }[])
      : []
    const names = new Map(profiles.map((p) => [p.id, p.full_name ?? 'Unknown']))
    const mapped: SystemLogRow[] = rows.map((r) => {
      const d = asRecord(r.details) ?? {}
      return {
        id: r.id,
        user_name: names.get(r.user_id) ?? 'Unknown',
        action: r.action,
        module: r.module,
        purpose: asText(d.purpose) ?? asText(d.remarks) ?? asText(d.reason),
        summary: asText(d.summary) ?? asText(d.description),
        reference_id: asText(d.reference_id),
        details: d,
        created_at:
          r.created_at instanceof Date
            ? r.created_at.toISOString()
            : typeof r.created_at === 'string'
              ? r.created_at
              : null,
      }
    })
    const e = pageResponse(mapped, total, page, pageSize)
    return { rows: e.rows, data: e.data, total: e.total, page: e.page, pageSize: e.pageSize, totalPages: e.totalPages }
  } catch (e) {
    console.error('[getLogsPage]', e)
    return { rows: [], data: [], total: 0, page: 1, pageSize, totalPages: 1 }
  }
  }, { page, pageSize, q, mod, range, order })
}

export async function getAllLogs(): Promise<SystemLogRow[]> {
  try {
    await requireSuperAdmin()
  } catch {
    return []
  }
  // Same list caching as personnel logs (30s) — the page filters
  // client-side, so one cached fetch serves every search + module.
  const { withScopedCache } = await import('@/lib/personnel-cache')
  return withScopedCache('super-admin:logs-list', 30, async () => {
  try {
    const rows = await prisma.auditLog.findMany({
      orderBy: { created_at: 'desc' },
      take: 500,
      select: { id: true, user_id: true, action: true, module: true, details: true, created_at: true },
    })
    const ids = [...new Set(rows.map((r) => r.user_id))]
    const profiles = await prisma.profile
      .findMany({ where: { id: { in: ids } }, select: { id: true, full_name: true } })
      .catch(() => [] as { id: string; full_name: string | null }[])
    const names = new Map(profiles.map((p) => [p.id, p.full_name ?? 'Unknown']))
    return rows.map((r) => {
      const d = asRecord(r.details) ?? {}
      return {
        id: r.id,
        user_name: names.get(r.user_id) ?? 'Unknown',
        action: r.action,
        module: r.module,
        purpose: asText(d.purpose) ?? asText(d.remarks) ?? asText(d.reason),
        summary: asText(d.summary) ?? asText(d.description),
        reference_id: asText(d.reference_id),
        details: d,
        created_at: r.created_at?.toISOString() ?? null,
      }
    })
  } catch (e) {
    console.error('[getAllLogs]', e)
    return []
  }
  })
}

// ─── System-wide headline counters ─────────────────────────────────────────

export interface AdminLogStats {
  total: number
  users: number
  modules: number
  last7: number
  lastActivity: string | null
  byModule: Array<{ module: string; count: number }>
}

const EMPTY_LOG_STATS: AdminLogStats = {
  total: 0,
  users: 0,
  modules: 0,
  last7: 0,
  lastActivity: null,
  byModule: [],
}

/**
 * Headline counters across every account (cached 60s like the other admin
 * aggregates). One summary query + one bounded per-module breakdown.
 */
export async function getAdminLogStats(): Promise<AdminLogStats> {
  try {
    await requireSuperAdmin()
  } catch {
    return EMPTY_LOG_STATS
  }
  const { withScopedCache } = await import('@/lib/personnel-cache')
  return withScopedCache('super-admin:log-stats', 60, async () => {
    try {
      const [summary, byModule] = await Promise.all([
        prisma.$queryRaw<
          Array<{
            total: bigint
            users: bigint
            modules: bigint
            last7: bigint
            last_activity: Date | string | null
          }>
        >`
          SELECT
            COUNT(*)::bigint AS total,
            COUNT(DISTINCT user_id)::bigint AS users,
            COUNT(DISTINCT module)::bigint AS modules,
            COUNT(*) FILTER (WHERE created_at >= now() - interval '7 days')::bigint AS last7,
            MAX(created_at) AS last_activity
          FROM audit_logs`,
        prisma.$queryRaw<Array<{ module: string; count: bigint }>>`
          SELECT module, COUNT(*)::bigint AS count
          FROM audit_logs
          GROUP BY module
          ORDER BY count DESC, module ASC
          LIMIT 6`,
      ])

      const row = summary[0]
      return {
        total: Number(row?.total ?? 0),
        users: Number(row?.users ?? 0),
        modules: Number(row?.modules ?? 0),
        last7: Number(row?.last7 ?? 0),
        lastActivity:
          row?.last_activity instanceof Date
            ? row.last_activity.toISOString()
            : typeof row?.last_activity === 'string'
              ? row.last_activity
              : null,
        byModule: byModule.map((r) => ({
          module: r.module,
          count: Number(r.count ?? 0),
        })),
      }
    } catch (e) {
      console.error('[getAdminLogStats]', e)
      return EMPTY_LOG_STATS
    }
  })
}
