import { createClient } from '@/lib/supabase/server'
import prisma from '@/lib/prisma'

/**
 * Document download guard for issuance workbooks (layer 2 of 2).
 *
 * Layer 1 (route, runs first): UUID → 401 (anonymous) → 403 (role must be
 * pgso_personnel/super_admin, active). Only authorized callers ever reach
 * the scoped resource lookup, so 404s can never leak existence to them.
 *
 * This guard is layer 2: it re-verifies session + explicit role/status for
 * the download itself (unknown roles and inactive accounts → 403, employees
 * without a matching receiver → 403 — employees have their own
 * /api/employee/issuances/* routes).
 *
 * Row-level isolation is deliberately NOT checked here: it comes from the
 * scoped `getIssuance` lookup (created_by = caller for personnel, all rows
 * for super_admin), which returns null → 404 for foreign records. The guard
 * only answers "may this role download issuance workbooks at all".
 */
export async function denyIssuanceDownload(
  docEmployeeId: string
): Promise<Response | null> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return new Response('Unauthorized.', { status: 401 })
    const profile = await prisma.profile
      .findUnique({ where: { id: user.id }, select: { role: true, status: true } })
      .catch(() => null)
    if (!profile || profile.status !== 'active') {
      return new Response('Forbidden.', { status: 403 })
    }
    if (profile.role === 'pgso_personnel' || profile.role === 'super_admin') {
      return null
    }
    // Defense in depth: employees reaching this guard directly (not via the
    // route-level role gate) may only download their own receiver rows.
    if (profile.role === 'employee' && docEmployeeId === user.id) {
      return null
    }
    return new Response('Forbidden.', { status: 403 })
  } catch {
    return new Response('Unauthorized.', { status: 401 })
  }
}
