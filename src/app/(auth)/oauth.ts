/**
 * OAuth provider for employee self-registration and sign-in.
 * Must be enabled in Supabase Dashboard → Authentication → Providers,
 * with `<origin>/auth/callback` allow-listed as a redirect URL.
 */
export const OAUTH_PROVIDER = 'google' as const
export const OAUTH_LABEL = 'Google' as const

/** Cookie stashing the signup role across the Google OAuth round-trip. */
export const SIGNUP_ROLE_COOKIE = 'pgso_signup_role'

export type SelfRegisterRole = 'employee' | 'pgso_personnel'

export function parseSignupRole(value: unknown): SelfRegisterRole {
  return value === 'pgso_personnel' ? 'pgso_personnel' : 'employee'
}
