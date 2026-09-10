/**
 * OAuth provider for employee self-registration and sign-in.
 * Must be enabled in Supabase Dashboard → Authentication → Providers,
 * with `<origin>/auth/callback` allow-listed as a redirect URL.
 */
export const OAUTH_PROVIDER = 'google' as const
export const OAUTH_LABEL = 'Google' as const
