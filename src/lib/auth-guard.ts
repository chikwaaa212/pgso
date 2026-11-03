import 'server-only'

import { cache } from 'react'
import { getCachedProfileRow, getSessionIdentity } from '@/lib/personnel-scope'
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
 * lookup instead of N duplicate round-trips. The profile row itself comes
 * from the 60s in-memory role cache (busted on role/status writes), so warm
 * navigations skip the remote DB entirely.
 */
async function requireSuperAdminUncached(): Promise<SuperAdminSession> {
  const { userId, email } = await getSessionIdentity()

  if (!userId) {
    throw new Error('Not authenticated.')
  }

  const profile = await getCachedProfileRow(userId)

  if (!profile.role || profile.role !== 'super_admin' || profile.status !== 'active') {
    throw new Error('Forbidden: Super Admin only.')
  }

  return {
    userId,
    email,
    profile: {
      id: userId,
      full_name: profile.full_name,
      role: profile.role,
      status: profile.status,
      position: profile.position,
      office: profile.office,
    },
  }
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
  const { userId, email } = await getSessionIdentity()

  if (!userId) {
    throw new Error('Not authenticated.')
  }

  const profile = await getCachedProfileRow(userId)

  // Self-registration requires Super Admin approval: only `active`
  // employees may act. `pending` waits for approval, `inactive` is blocked.
  if (
    !profile.role ||
    profile.role !== 'employee' ||
    profile.status !== 'active'
  ) {
    throw new Error('Forbidden: Employee only.')
  }

  return { userId, email, fullName: profile.full_name }
}
