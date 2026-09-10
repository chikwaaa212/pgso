import { createClient } from '@/lib/supabase/server'
import prisma from '@/lib/prisma'

/**
 * Document download guard for issuance workbooks.
 * Personnel / super admins may download any record; employees may only
 * download documents issued to themselves. Returns a 403 Response when
 * denied, or null when allowed.
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
      .findUnique({ where: { id: user.id }, select: { role: true } })
      .catch(() => null)
    if (profile?.role === 'employee' && docEmployeeId !== user.id) {
      return new Response('Forbidden.', { status: 403 })
    }
    return null
  } catch {
    return new Response('Unauthorized.', { status: 401 })
  }
}
