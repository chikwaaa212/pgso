import 'server-only'

import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import prisma from '@/lib/prisma'

export interface SuperAdminSession {
  userId: string
  email: string | null
  profile: {
    id: string
    full_name: string | null
    role: string
    status: string
    position: string | null
    office: string | null
  }
}

/**
 * Throws if the caller is not an active super_admin.
 * Use as the first line of every super-admin server action / page.
 *
 * Per-request memoized via React `cache()` so middleware → layout → page →
 * readers sharing one RSC request only pay for a single Auth + profile
 * lookup instead of N duplicate round-trips.
 */
async function requireSuperAdminUncached(): Promise<SuperAdminSession> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Not authenticated.')
  }

  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { id: true, full_name: true, role: true, status: true, position: true, office: true },
  })

  if (!profile || profile.role !== 'super_admin' || profile.status !== 'active') {
    throw new Error('Forbidden: Super Admin only.')
  }

  return { userId: user.id, email: user.email ?? null, profile }
}

export const requireSuperAdmin = cache(requireSuperAdminUncached)

/** Non-throwing variant for layouts — returns null when not super_admin. */
export async function getSuperAdminSession(): Promise<SuperAdminSession | null> {
  try {
    return await requireSuperAdmin()
  } catch {
    return null
  }
}

export interface EmployeeSession {
  userId: string
  email: string | null
  fullName: string | null
}

/**
 * Throws if the caller is not an active employee.
 * Use as the first line of every employee server action / page.
 */
export async function requireEmployee(): Promise<EmployeeSession> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Not authenticated.')
  }

  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { full_name: true, role: true, status: true },
  })

  // Self-registration is auto-active: legacy `pending` profiles are accepted
  // alongside `active`. Only `inactive` is blocked.
  if (
    !profile ||
    profile.role !== 'employee' ||
    (profile.status !== 'active' && profile.status !== 'pending')
  ) {
    throw new Error('Forbidden: Employee only.')
  }

  return { userId: user.id, email: user.email ?? null, fullName: profile.full_name }
}
