import 'server-only'

import { createClient } from '@/lib/supabase/server'

/**
 * Per-personnel ownership scope.
 *
 * Rule: a PGSO Personnel user only sees records they created:
 * - deliveries      → `received_by = me`
 * - inspections     → delivery `received_by = me` OR `inspector_id = me`
 * - issuances       → `created_by = me`
 * - repairs         → `created_by = me` (legacy NULL rows stay visible)
 * - documents/IAR   → derived from the delivery/inspection/issuance above
 * - dashboard counts → same scoped counts
 *
 * Shared pools stay global on purpose (issuance/request pick-lists need
 * them): assets registry, stocks/inventory quantities, employee request
 * queue, master data. Super Admin always sees everything (untouched).
 */

/** Current signed-in user id, or null when signed out. Never throws. */
export async function getCurrentUserId(): Promise<string | null> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    return user?.id ?? null
  } catch {
    return null
  }
}

/** Current user id or throws — use at the top of scoped personnel actions. */
export async function requireCurrentUserId(): Promise<string> {
  const id = await getCurrentUserId()
  if (!id) throw new Error('Not authenticated.')
  return id
}

export interface PersonnelScope {
  /** Signed-in user id, or null when signed out. */
  userId: string | null
  /** True when the caller is an active super_admin — sees everything. */
  isSuperAdmin: boolean
  /** True when queries must return nothing (signed out). */
  isEmpty: boolean
}

/**
 * Role-aware scope for shared reader functions.
 *
 * Personnel actions are reused by the Super Admin browse layer, so scoping
 * must not hide everything from admins:
 * - super_admin → `isSuperAdmin: true` → callers skip the owner filter (all rows)
 * - personnel   → filter to own rows
 * - signed out  → `isEmpty: true` → callers return []
 */
export async function getPersonnelScope(): Promise<PersonnelScope> {
  const userId = await getCurrentUserId()
  if (!userId) return { userId: null, isSuperAdmin: false, isEmpty: true }
  try {
    const { default: prisma } = await import('@/lib/prisma')
    const profile = await prisma.profile.findUnique({
      where: { id: userId },
      select: { role: true, status: true },
    })
    if (profile?.role === 'super_admin' && profile?.status === 'active') {
      return { userId, isSuperAdmin: true, isEmpty: false }
    }
  } catch {
    /* fall through to personnel scope */
  }
  return { userId, isSuperAdmin: false, isEmpty: false }
}
