import { createClient } from '@/lib/supabase/server'
import prisma from '@/lib/prisma'
import { resolveApiAccess } from '@/lib/api-guard'

/**
 * Authentication/authorization gate for the report XLSX routes.
 *
 * Fixed guard order: authenticate → authorize by role/status → then the
 * caller may touch a report. Resources never reveal existence first.
 * Row-level isolation is applied later by the scoped reporting queries.
 */
export async function denyReportAccess(
  allowedRoles: readonly string[]
): Promise<Response | null> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const profile = user
      ? await prisma.profile
          .findUnique({ where: { id: user.id }, select: { role: true, status: true } })
          .catch(() => null)
      : null
    const access = resolveApiAccess(
      {
        userId: user?.id ?? null,
        role: profile?.role ?? null,
        status: profile?.status ?? null,
      },
      allowedRoles
    )
    if (access === 401) return new Response('Unauthorized.', { status: 401 })
    if (access === 403) return new Response('Forbidden.', { status: 403 })
    return null
  } catch {
    return new Response('Unauthorized.', { status: 401 })
  }
}
