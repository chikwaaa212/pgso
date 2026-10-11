import 'server-only'

import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

/**
 * Per-personnel ownership scope.
 *
 * Rule: a PGSO Personnel user only sees records they created:
 * - deliveries      → `received_by = me`
 * - inspections     → delivery `received_by = me` OR `inspector_id = me`
 * - issuances       → `created_by = me`
 * - repairs         → `created_by = me` (strict; auto-tickets are owned
 *   by the request recipient, legacy NULL rows are hidden from personnel)
 * - documents/IAR   → derived from the delivery/inspection/issuance above
 * - dashboard counts → same scoped counts
 *
 * Shared pools stay global on purpose (issuance/request pick-lists need
 * them): assets registry, stocks/inventory quantities, employee request
 * queue, master data. Super Admin always sees everything (untouched).
 */

/** Current signed-in user id, or null when signed out. Never throws. */
export const getCurrentUserId = cache(async (): Promise<string | null> => {
  const t0 = Date.now()
  try {
    const supabase = await createClient()
    // Fast path: local JWT verification (no Auth-server round-trip) when the
    // project uses asymmetric signing keys. Falls back to getUser() for
    // symmetric secrets or WebCrypto-less runtimes.
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.auth as any).getClaims()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sub = (data?.claims as any)?.sub as string | undefined
      if (!error && sub) {
        if (process.env.PERF_TRACE === '1') {
          console.log(`[perf auth] getCurrentUserId via getClaims: ${Date.now() - t0}ms`)
        }
        return sub
      }
    } catch {
      /* fall through to getUser */
    }
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (process.env.PERF_TRACE === '1') {
      console.log(`[perf auth] getCurrentUserId via getUser: ${Date.now() - t0}ms`)
    }
    return user?.id ?? null
  } catch {
    return null
  }
})

/** Current user id or throws — use at the top of scoped personnel actions. */
export async function requireCurrentUserId(): Promise<string> {
  const id = await getCurrentUserId()
  if (!id) throw new Error('Not authenticated.')
  return id
}

/**
 * Memoized session identity (id + email) for server layouts/pages.
 * Claims-first (local JWT verify, no Auth-server round-trip), getUser
 * fallback. Use this instead of `createClient() + auth.getUser()` so a
 * layout + its page share one verification instead of paying two.
 */
export const getSessionIdentity = cache(
  async (): Promise<{ userId: string | null; email: string | null }> => {
    try {
      const supabase = await createClient()
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase.auth as any).getClaims()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const claims = data?.claims as any
        if (!error && claims?.sub) {
          return {
            userId: claims.sub as string,
            email: (claims.email as string | undefined) ?? null,
          }
        }
      } catch {
        /* fall through to getUser */
      }
      const {
        data: { user },
      } = await supabase.auth.getUser()
      return { userId: user?.id ?? null, email: user?.email ?? null }
    } catch {
      return { userId: null, email: null }
    }
  }
)

export interface PersonnelScope {
  /** Signed-in user id, or null when signed out. */
  userId: string | null
  /** True when the caller is an active super_admin — sees everything. */
  isSuperAdmin: boolean
  /** True when queries must return nothing (signed out). */
  isEmpty: boolean
  /** Raw role string (super_admin | pgso_personnel | employee). Null when signed out. */
  role: string | null
  /** True when caller may use personnel actions (pgso_personnel or super_admin, active). */
  isPersonnel: boolean
}

// Short-lived in-memory role cache (per server instance) so repeated
// personnel-scope resolutions in one session don't hit the DB every time.
// React `cache()` already dedupes per-request; this extends to ~60s across requests.
const roleCache = new Map<string, { role: string | null; status: string | null; expires: number }>()
const ROLE_CACHE_TTL_MS = 60_000

async function getCachedProfile(userId: string): Promise<{ role: string | null; status: string | null }> {
  const now = Date.now()
  const hit = roleCache.get(userId)
  if (hit && hit.expires > now) {
    if (process.env.PERF_TRACE === '1') {
      console.log(`[perf role] getCachedProfile HIT for ${userId.slice(0, 8)}: 0ms`)
    }
    return { role: hit.role, status: hit.status }
  }
  const t0 = Date.now()
  const { default: prisma } = await import('@/lib/prisma')
  const profile = await prisma.profile.findUnique({
    where: { id: userId },
    select: { role: true, status: true },
  })
  if (process.env.PERF_TRACE === '1') {
    console.log(`[perf role] getCachedProfile MISS (DB): ${Date.now() - t0}ms`)
  }
  const entry = { role: profile?.role ?? null, status: profile?.status ?? null, expires: now + ROLE_CACHE_TTL_MS }
  roleCache.set(userId, entry)
  // Bound growth: drop expired entries opportunistically.
  if (roleCache.size > 2000) {
    for (const [k, v] of roleCache) if (v.expires <= now) roleCache.delete(k)
  }
  return { role: entry.role, status: entry.status }
}

/** Clear the session role cache (call on role/status writes). */
export function bustRoleCache(userId?: string): void {
  if (userId) roleCache.delete(userId)
  else roleCache.clear()
}

/**
 * Role-aware scope for shared reader functions.
 *
 * Personnel actions are reused by the Super Admin browse layer, so scoping
 * must not hide everything from admins:
 * - super_admin → `isSuperAdmin: true` → callers skip the owner filter (all rows)
 * - pgso_personnel (active) → `isPersonnel: true` → filter to own rows
 * - employee / inactive / signed out → `isEmpty: true` for personnel-only
 *   readers (fail-closed); shared pools document their own exception.
 */
export const getPersonnelScope = cache(async (): Promise<PersonnelScope> => {
  const userId = await getCurrentUserId()
  return resolvePersonnelScope(userId)
})

/**
 * Throw 401 when signed out, 403 when the role may not use personnel actions.
 * Use at the top of every personnel/shared-pool WRITE.
 */
export async function requirePersonnelScope(): Promise<PersonnelScope> {
  const scope = await getPersonnelScope()
  if (!scope.userId || scope.isEmpty) throw new Error('Not authenticated.')
  if (!scope.isPersonnel && !scope.isSuperAdmin) throw new Error('Forbidden: Personnel only.')
  return scope
}

/**
 * Build a scope from an already-known user id without another
 * `auth.getUser()` round-trip. Snapshot composers should resolve the scope
 * once and thread it into readers instead of letting every reader re-derive
 * it (each derivation is an Auth + profile lookup on a cold request).
 */
export async function resolvePersonnelScope(
  userId: string | null
): Promise<PersonnelScope> {
  const empty = (role: string | null = null): PersonnelScope => ({
    userId,
    isSuperAdmin: false,
    isEmpty: true,
    role,
    isPersonnel: false,
  })
  if (!userId) return empty(null)
  try {
    const profile = await getCachedProfile(userId)
    const role = profile.role
    const status = profile.status
    if (role === 'super_admin' && status === 'active') {
      return { userId, isSuperAdmin: true, isEmpty: false, role, isPersonnel: true }
    }
    // Only active personnel may use personnel readers/writes. Employees and
    // inactive accounts fail closed (shared pools keep their documented
    // global-read exception only for active personnel + super_admin).
    if (role === 'pgso_personnel' && status === 'active') {
      return { userId, isSuperAdmin: false, isEmpty: false, role, isPersonnel: true }
    }
    return empty(role)
  } catch {
    return empty(null)
  }
}
