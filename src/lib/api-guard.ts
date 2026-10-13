/**
 * Shared API guard order for every xlsx/export + data route.
 *
 * Fixed order (never resource-first, so existence can never leak):
 *   1. authenticate → 401 when anonymous
 *   2. authorize by role (+ status) → 403 for the wrong role
 *   3. validate input + look up the resource → 404 only for authorized callers
 *
 * Pure helpers (unit-testable); routes do the real Supabase/DB calls and map
 * these decisions to Responses. No server-only, no DB — safe to import in tests.
 */

export const API_ROLES = ['super_admin', 'pgso_personnel', 'employee'] as const;
export type ApiRole = (typeof API_ROLES)[number];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Strict UUID check for `:id` params (invalid → 404, never 500). */
export function isUuid(id: string): boolean {
  return UUID_RE.test(id ?? '');
}

export interface ApiIdentity {
  userId: string | null;
  role: string | null;
  status: string | null;
}

export type ApiAccess = 401 | 403 | 200;

/**
 * Steps 1–2 of the guard order for a route that allows `allowedRoles`.
 * Every role requires `status === 'active'` — self-registered `pending`
 * accounts wait for Super Admin approval and `inactive` stays blocked.
 * Unknown roles → 403 (never 404, never data).
 */
export function resolveApiAccess(
  identity: ApiIdentity,
  allowedRoles: readonly string[]
): ApiAccess {
  if (!identity.userId) return 401;
  if (!identity.role || !(allowedRoles as readonly string[]).includes(identity.role)) {
    return 403;
  }
  if (identity.status !== 'active') {
    return 403;
  }
  return 200;
}

/** Per-route allowlists (single source — routes + tests import these). */
export const PERSONNEL_API_ROLES = ['pgso_personnel', 'super_admin'] as const;
export const SUPER_ADMIN_API_ROLES = ['super_admin'] as const;
export const EMPLOYEE_API_ROLES = ['employee'] as const;
export const ANY_SIGNED_IN_API_ROLES = API_ROLES;
