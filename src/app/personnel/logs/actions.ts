'use server'

import { createClient } from '@/lib/supabase/server'
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
 */
export async function getMyLogs(): Promise<LogRow[]> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return []

    const rows = await prisma.auditLog.findMany({
      where: { user_id: user.id },
      orderBy: { created_at: 'desc' },
      take: 500,
      select: {
        id: true,
        action: true,
        module: true,
        details: true,
        created_at: true,
      },
    })

    return rows.map((r) => {
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
        created_at: r.created_at?.toISOString() ?? null,
      }
    })
  } catch (e) {
    console.error('[getMyLogs]', e)
    return []
  }
}
