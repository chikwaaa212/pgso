'use server'

import prisma from '@/lib/prisma'

export interface LogRow {
  id: string
  action: string
  module: string
  purpose: string | null
  summary: string | null
  reference_id: string | null
  created_at: string | null
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

/**
 * All audit logs created by the currently signed-in user,
 * newest first. Never throws — returns [] on failure.
 *
 * Per-user scoped Redis cache (30s TTL, same as the deliveries list).
 * Busted automatically by bustPersonnelCache() on any write, so the
 * trail stays fresh without hammering the DB on every navigation.
 */
export interface LogsPageOpts {
  page?: number
  pageSize?: number
  q?: string
  module?: string
}

export async function getMyLogs(): Promise<LogRow[]> {
  const { rows } = await getMyLogsPage({ page: 1, pageSize: 500 })
  return rows
}

export async function getMyLogsPage(
  opts: LogsPageOpts = {}
): Promise<{ rows: LogRow[]; total: number }> {
  const { withScopedCache } = await import('@/lib/personnel-cache')
  const page = Math.floor(Number(opts.page)) >= 1 ? Math.min(Math.floor(Number(opts.page)), 1000) : 1
  const pageSize = Number.isFinite(Number(opts.pageSize))
    ? Math.min(Math.max(Math.floor(Number(opts.pageSize)), 1), 100)
    : 20
  const q = (opts.q ?? '').trim().slice(0, 120)
  const mod = (opts.module ?? 'all').trim()
  return withScopedCache('personnel:logs-list', 30, async () => {
  try {
    const { getPersonnelScope } = await import('@/lib/personnel-scope')
    const scope = await getPersonnelScope()
    if (!scope.userId) return { rows: [], total: 0 }
    const user = { id: scope.userId }

    // Server-side text search across action/module + jsonb detail text
    // fields, so paging stays correct while typing.
    const { Prisma } = await import('@prisma/client')
    const like = q ? `%${q}%` : null
    const conds: InstanceType<typeof Prisma.Sql>[] = [
      Prisma.sql`user_id = ${user.id}::uuid`,
    ]
    if (mod !== 'all') conds.push(Prisma.sql`module = ${mod}`)
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
    interface LogDb {
      id: string
      action: string
      module: string
      details: unknown
      created_at: Date | string | null
    }
    const [countRows, rows] = await Promise.all([
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count FROM audit_logs ${whereClause}`,
      prisma.$queryRaw<LogDb[]>`
        SELECT id::text AS id, action, module, details, created_at
        FROM audit_logs ${whereClause}
        ORDER BY created_at DESC LIMIT ${pageSize} OFFSET ${offset}`,
    ])
    const total = Number(countRows[0]?.count ?? 0)

    return {
      total,
      rows: rows.map((r) => {
        const d = asRecord(r.details)
        const purpose =
          asText(d?.purpose) ?? asText(d?.remarks) ?? asText(d?.reason) ?? null
        const summary =
          asText(d?.summary) ??
          asText(d?.description) ??
          (d && !purpose
            ? JSON.stringify(d).slice(0, 160)
            : null)
        return {
          id: r.id,
          action: r.action,
          module: r.module,
          purpose,
          summary,
          reference_id: asText(d?.reference_id),
          created_at:
            r.created_at instanceof Date
              ? r.created_at.toISOString()
              : typeof r.created_at === 'string' && r.created_at
                ? new Date(r.created_at).toISOString()
                : null,
        }
      }),
    }
  } catch (e) {
    console.error('[getMyLogs]', e)
    return { rows: [], total: 0 }
  }
  }, { page, pageSize, module: mod, q })
}

/** Distinct module names for the logs filter dropdown (bounded). */
export async function getLogModules(): Promise<string[]> {
  const { withScopedCache } = await import('@/lib/personnel-cache')
  return withScopedCache('personnel:log-modules', 300, async () => {
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
