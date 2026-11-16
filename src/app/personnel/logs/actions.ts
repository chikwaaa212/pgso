'use server'

import prisma from '@/lib/prisma'

export interface LogRow {
  id: string
  action: string
  module: string
  purpose: string | null
  summary: string | null
  reference_id: string | null
  details: Record<string, unknown> | null
  created_at: string | null
}

export type LogRange = 'all' | 'today' | '7d' | '30d'
export type LogOrder = 'desc' | 'asc'

export interface LogsPageOpts {
  page?: number
  pageSize?: number
  q?: string
  module?: string
  range?: LogRange
  order?: LogOrder
}

export interface LogStats {
  total: number
  modules: number
  last7: number
  lastActivity: string | null
  byModule: Array<{ module: string; count: number }>
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return null
}

function asText(value: unknown): string | null {
  if (typeof value === 'string') {
    const t = value.trim()
    return t === '' ? null : t
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
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

function toIso(value: Date | string | null): string | null {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string' && value) {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }
  return null
}

interface LogDbRow {
  id: string
  action: string
  module: string
  details: unknown
  created_at: Date | string | null
}

function mapRow(r: LogDbRow): LogRow {
  const d = asRecord(r.details)
  const purpose =
    asText(d?.purpose) ?? asText(d?.remarks) ?? asText(d?.reason) ?? null
  const summary =
    asText(d?.summary) ??
    asText(d?.description) ??
    (d && !purpose ? JSON.stringify(d).slice(0, 160) : null)
  return {
    id: r.id,
    action: r.action,
    module: r.module,
    purpose,
    summary,
    reference_id: asText(d?.reference_id),
    details: d,
    created_at: toIso(r.created_at),
  }
}

/**
 * All audit logs created by the currently signed-in user, newest first.
 * Never throws — returns empty pages on failure.
 */
export async function getMyLogs(): Promise<LogRow[]> {
  const { rows } = await getMyLogsPage({ page: 1, pageSize: 500 })
  return rows
}

/** Shared paged reader for the screen and the CSV export. */
async function readLogs(
  opts: LogsPageOpts,
  maxPageSize: number
): Promise<{ rows: LogRow[]; total: number }> {
  const { withScopedCache } = await import('@/lib/personnel-cache')
  const page =
    Math.floor(Number(opts.page)) >= 1
      ? Math.min(Math.floor(Number(opts.page)), 1000)
      : 1
  const pageSize = Number.isFinite(Number(opts.pageSize))
    ? Math.min(Math.max(Math.floor(Number(opts.pageSize)), 1), maxPageSize)
    : 10
  const q = (opts.q ?? '').trim().slice(0, 120)
  const mod = (opts.module ?? 'all').trim() || 'all'
  const range = normalizeRange(opts.range)
  const order = normalizeOrder(opts.order)

  return withScopedCache(
    'personnel:logs-list',
    30,
    async () => {
      try {
        const { getPersonnelScope } = await import('@/lib/personnel-scope')
        const scope = await getPersonnelScope()
        if (!scope.userId) return { rows: [], total: 0 }

        // Server-side text search across action/module + jsonb detail text
        // fields, so paging stays correct while typing.
        const { Prisma } = await import('@prisma/client')
        const like = q ? `%${q}%` : null
        const conds: InstanceType<typeof Prisma.Sql>[] = [
          Prisma.sql`user_id = ${scope.userId}::uuid`,
        ]
        if (mod !== 'all') conds.push(Prisma.sql`module = ${mod}`)
        const since = rangeStart(range)
        if (since) conds.push(Prisma.sql`created_at >= ${since}`)
        if (like) {
          conds.push(Prisma.sql`(
            action ILIKE ${like} OR module ILIKE ${like}
            OR details->>'purpose' ILIKE ${like}
            OR details->>'summary' ILIKE ${like}
            OR details->>'description' ILIKE ${like}
            OR details->>'reference_id' ILIKE ${like}
            OR details->>'remarks' ILIKE ${like}
            OR details->>'reason' ILIKE ${like}
          )`)
        }
        const whereClause = Prisma.sql`WHERE ${Prisma.join(conds, ' AND ')}`
        const offset = (page - 1) * pageSize
        const direction = Prisma.raw(order === 'asc' ? 'ASC' : 'DESC')

        const [countRows, rows] = await Promise.all([
          prisma.$queryRaw<Array<{ count: bigint }>>`
            SELECT COUNT(*)::bigint AS count FROM audit_logs ${whereClause}`,
          prisma.$queryRaw<LogDbRow[]>`
            SELECT id::text AS id, action, module, details, created_at
            FROM audit_logs ${whereClause}
            ORDER BY created_at ${direction}
            LIMIT ${pageSize} OFFSET ${offset}`,
        ])
        const total = Number(countRows[0]?.count ?? 0)

        return { total, rows: rows.map(mapRow) }
      } catch (e) {
        console.error('[getMyLogs]', e)
        return { rows: [], total: 0 }
      }
    },
    { page, pageSize, module: mod, q, range, order }
  )
}

export async function getMyLogsPage(
  opts: LogsPageOpts = {}
): Promise<{ rows: LogRow[]; total: number }> {
  return readLogs(opts, 100)
}

/**
 * CSV export source — same filters as the screen, bounded to 5 000 rows.
 * Reads through the 30s scoped cache, so an export right after browsing is
 * typically free.
 */
export async function getMyLogsExport(
  opts: LogsPageOpts = {}
): Promise<LogRow[]> {
  const { rows } = await readLogs({ ...opts, page: 1, pageSize: 5000 }, 5000)
  return rows
}

/** Headline counters + per-module breakdown for the summary tiles. */
export async function getMyLogStats(): Promise<LogStats> {
  const { withScopedCache } = await import('@/lib/personnel-cache')
  return withScopedCache('personnel:logs-stats', 30, async () => {
    const empty: LogStats = {
      total: 0,
      modules: 0,
      last7: 0,
      lastActivity: null,
      byModule: [],
    }
    try {
      const { getPersonnelScope } = await import('@/lib/personnel-scope')
      const scope = await getPersonnelScope()
      if (!scope.userId) return empty

      const [summary, byModule] = await Promise.all([
        prisma.$queryRaw<
          Array<{
            total: bigint
            modules: bigint
            last7: bigint
            last_activity: Date | string | null
          }>
        >`
          SELECT
            COUNT(*)::bigint AS total,
            COUNT(DISTINCT module)::bigint AS modules,
            COUNT(*) FILTER (WHERE created_at >= now() - interval '7 days')::bigint AS last7,
            MAX(created_at) AS last_activity
          FROM audit_logs
          WHERE user_id = ${scope.userId}::uuid`,
        prisma.$queryRaw<Array<{ module: string; count: bigint }>>`
          SELECT module, COUNT(*)::bigint AS count
          FROM audit_logs
          WHERE user_id = ${scope.userId}::uuid
          GROUP BY module
          ORDER BY count DESC, module ASC
          LIMIT 8`,
      ])

      const row = summary[0]
      return {
        total: Number(row?.total ?? 0),
        modules: Number(row?.modules ?? 0),
        last7: Number(row?.last7 ?? 0),
        lastActivity: toIso(row?.last_activity ?? null),
        byModule: byModule.map((r) => ({
          module: r.module,
          count: Number(r.count ?? 0),
        })),
      }
    } catch (e) {
      console.error('[getMyLogStats]', e)
      return empty
    }
  })
}

/** Distinct module names for the logs filter dropdown (bounded). */
export async function getLogModules(): Promise<string[]> {
  const { withScopedCache } = await import('@/lib/personnel-cache')
  return withScopedCache('personnel:logs-modules', 300, async () => {
    try {
      const { getPersonnelScope } = await import('@/lib/personnel-scope')
      const scope = await getPersonnelScope()
      if (!scope.userId) return []
      const rows = await prisma.$queryRaw<Array<{ module: string }>>`
        SELECT DISTINCT module FROM audit_logs
        WHERE user_id = ${scope.userId}::uuid ORDER BY 1 LIMIT 100`
      return rows.map((r) => r.module).filter(Boolean)
    } catch (e) {
      console.error('[getLogModules]', e)
      return []
    }
  })
}
