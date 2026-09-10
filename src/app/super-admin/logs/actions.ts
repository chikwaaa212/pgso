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
  created_at: string | null
}

function asText(value: unknown): string | null {
  if (typeof value === 'string') {
    const t = value.trim()
    return t === '' ? null : t
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return null
}

export async function getLogModules(): Promise<string[]> {
  try {
    await requireSuperAdmin()
  } catch {
    return []
  }
  try {
    const rows = await prisma.auditLog.findMany({
      distinct: ['module'],
      select: { module: true },
    })
    return rows.map((r) => r.module).sort((a, b) => a.localeCompare(b))
  } catch (e) {
    console.error('[getLogModules]', e)
    return []
  }
}

export async function getAllLogs(filters: {
  module?: string
  q?: string
  limit?: number
}): Promise<SystemLogRow[]> {
  try {
    await requireSuperAdmin()
  } catch {
    return []
  }
  const mod = (filters.module ?? '').trim()
  const q = (filters.q ?? '').trim()
  const limit = Math.min(Math.max(filters.limit ?? 200, 1), 500)
  try {
    const rows = await prisma.auditLog.findMany({
      where: {
        ...(mod && mod !== 'all' ? { module: mod } : {}),
        ...(q
          ? {
              OR: [
                { action: { contains: q, mode: 'insensitive' } },
                { module: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { created_at: 'desc' },
      take: limit,
      select: { id: true, user_id: true, action: true, module: true, details: true, created_at: true },
    })
    const ids = [...new Set(rows.map((r) => r.user_id))]
    const profiles = await prisma.profile
      .findMany({ where: { id: { in: ids } }, select: { id: true, full_name: true } })
      .catch(() => [] as { id: string; full_name: string | null }[])
    const names = new Map(profiles.map((p) => [p.id, p.full_name ?? 'Unknown']))
    return rows.map((r) => {
      const d = ((r.details ?? {}) as Record<string, unknown>) ?? {}
      return {
        id: r.id,
        user_name: names.get(r.user_id) ?? 'Unknown',
        action: r.action,
        module: r.module,
        purpose: asText(d.purpose) ?? asText(d.remarks) ?? asText(d.reason),
        summary: asText(d.summary) ?? asText(d.description),
        reference_id: asText(d.reference_id),
        created_at: r.created_at?.toISOString() ?? null,
      }
    })
  } catch (e) {
    console.error('[getAllLogs]', e)
    return []
  }
}
