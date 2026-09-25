'use server'

import { cookies, headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import prisma from '@/lib/prisma'
import { writeAuditLog } from '@/lib/audit'
import { withIdempotency } from '@/lib/idempotency'
import { redirect, unstable_rethrow } from 'next/navigation'
import type { LoginState, SignupState } from '@/types'
import { OAUTH_PROVIDER, SIGNUP_ROLE_COOKIE, parseSignupRole } from './oauth'

const roleRoutes: Record<string, string> = {
  super_admin: '/super-admin/dashboard',
  pgso_personnel: '/personnel/dashboard',
  employee: '/employee/dashboard',
}

/**
 * Matches Supabase/GoTrue "this address is already confirmed" failures across
 * verify + resend, so the UI can route to sign-in instead of saying
 * "request a new code" (which can never succeed for a confirmed address).
 */
function isAlreadyVerifiedMessage(message: string): boolean {
  const m = (message ?? '').toLowerCase()
  return (
    m.includes('already confirmed') ||
    m.includes('already registered') ||
    m.includes('already in use') ||
    m.includes('already exists') ||
    m.includes('email address is already')
  )
}

/** Only same-origin absolute paths are honored (open-redirect guard). */
function safeNextParam(value: string | null | undefined): string | null {
  if (!value || typeof value !== 'string') return null
  if (!value.startsWith('/') || value.startsWith('//')) return null
  return value
}

function roleAllowsPath(role: string, path: string): boolean {
  if (path === '/' || path.startsWith('/login') || path.startsWith('/signup'))
    return true
  const m = path.match(/^\/(super-admin|personnel|employee)(\/|$)/)
  if (!m) return true
  const map: Record<string, string> = {
    'super-admin': 'super_admin',
    personnel: 'pgso_personnel',
    employee: 'employee',
  }
  return role === map[m[1]]
}

async function callbackOrigin(): Promise<string> {
  // Prefer the configured app URL — request headers (esp. x-forwarded-host)
  // can be spoofed behind proxies that pass them through, which would leak
  // the OAuth code to an attacker host via redirectTo.
  const configured = (process.env.NEXT_PUBLIC_APP_URL ?? '').trim().replace(/\/+$/, '')
  if (configured) {
    try {
      return new URL(configured).origin
    } catch {
      // fall through to headers
    }
  }
  const list = await headers()
  const host = list.get('x-forwarded-host') ?? list.get('host') ?? 'localhost:3000'
  const proto = list.get('x-forwarded-proto') ?? 'http'
  return `${proto}://${host}`
}

/**
 * Starts Supabase OAuth (PKCE) for self-registration + sign-in.
 *
 * New users pick their role (Employee / PGSO Personnel) on the signup page;
 * it is stashed in a short-lived cookie so the auth callback can create an
 * ACTIVE profile with that role — no admin approval needed. Returning users
 * (any role) keep their existing profile and sign straight in. OAuth users
 * have no password, so this is used by both login and signup.
 */
export async function signInWithOAuth(formData?: FormData): Promise<never> {
  const rawNext =
    formData instanceof FormData ? (formData.get('next') as string | null) : null
  const rawRole =
    formData instanceof FormData ? (formData.get('role') as string | null) : null
  const next = safeNextParam(rawNext)
  const role = parseSignupRole(rawRole)

  // Remember the requested role across the Google round-trip (10 min TTL).
  // The callback consumes + clears it. Validation happens again there.
  try {
    const jar = await cookies()
    jar.set(SIGNUP_ROLE_COOKIE, role, {
      path: '/',
      maxAge: 600,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    })
  } catch {
    // best-effort: callback falls back to employee when the cookie is missing
  }

  const supabase = await createClient()
  const base = await callbackOrigin()
  const redirectTo = next
    ? `${base}/auth/callback?next=${encodeURIComponent(next)}`
    : `${base}/auth/callback`
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: OAUTH_PROVIDER,
    options: {
      redirectTo,
    },
  })
  if (error || !data.url) {
    redirect(`/login?notice=oauth-error`)
  }
  redirect(data.url)
}

export async function login(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  if (!email || !password) {
    return { error: 'Email and password are required.' }
  }

  try {
    const outcome = await withIdempotency(
      formData.get('idempotencyKey') as string,
      'auth:login',
      async () => {
        const supabase = await createClient()
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (error) {
          // Password correct but inbox not verified yet — surface a typed
          // state (not just text) so login can deep-link to the OTP step.
          if ((error.message ?? '').toLowerCase().includes('email not confirmed')) {
            throw Object.assign(
              new Error(
                'Please verify your email first — enter the 8-digit code we sent, then sign in.'
              ),
              { needsVerification: true, email }
            )
          }
          throw new Error(error.message)
        }

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          throw new Error('Login failed')
        }

        const profile = await prisma.profile.findUnique({
          where: { id: user.id },
          select: { role: true, status: true },
        })

        if (!profile) {
          throw new Error('Profile not found. Contact your administrator.')
        }

        if (profile.status === 'inactive') {
          await supabase.auth.signOut()
          throw new Error('Your account is inactive.')
        }

        // Legacy self-registrations created before self-service auto-activation
        // used `status = pending` + admin approval. Approval is gone — flip
        // them to active on first successful sign-in so nobody is stuck.
        if (profile.status === 'pending') {
          try {
            await prisma.profile.update({
              where: { id: user.id },
              data: { status: 'active' },
            })
          } catch {
            // best-effort: still let them in, middleware treats pending as active
          }
        }

        return { role: profile.role, userId: user.id }
      }
    )

    // Skip the audit row when this was a duplicate-key replay of an
    // already-logged sign-in — the first attempt already wrote it.
    // Fire-and-forget: audit must never block the login redirect.
    if (!outcome.duplicate) {
      void writeAuditLog({
        userId: outcome.result.userId,
        action: 'auth:login',
        module: 'auth',
        details: {
          purpose: 'User sign-in',
          summary: `Signed in as ${email}`,
        },
      }).catch(() => {})
    }

    // Guests bounced by middleware carry ?next=<protected path>.
    // Honor it only when it is same-origin AND allowed for this role —
    // otherwise fall back to the role dashboard (never an open redirect).
    const requested = safeNextParam(formData.get('next') as string | null)
    const role = outcome.result.role
    const fallback = roleRoutes[role] || '/'
    if (requested && roleAllowsPath(role, requested)) {
      // "/" itself role-routes in middleware, so send role home directly.
      redirect(requested === '/' ? fallback : requested)
    }
    redirect(fallback)
  } catch (e) {
    unstable_rethrow(e)
    if (e instanceof Error) {
      const extra = e as Error & { needsVerification?: boolean; email?: string }
      if (extra.needsVerification) {
        return { error: extra.message, email: extra.email, needsVerification: true }
      }
      return { error: extra.message }
    }
    return { error: 'Login failed' }
  }
}

/**
 * Self-registration with Email + Password + OTP (no admin approval).
 *
 * Uses the anon `signUp` (not admin.createUser) so Supabase sends the
 * verification OTP / confirmation link when "Confirm email" is enabled.
 * The profile is created ACTIVE immediately, so once the email is verified
 * the user can sign straight in as the role they picked (employee/personnel).
 *
 * Returns `{ needsVerification: true }` when Supabase requires email
 * confirmation — the signup page then shows the 8-digit OTP step.
 */
export async function signup(_prevState: SignupState, formData: FormData): Promise<SignupState> {
  const email = ((formData.get('email') as string) ?? '').trim()
  const password = (formData.get('password') as string) ?? ''
  const full_name = ((formData.get('full_name') as string) ?? '').trim()
  const role = parseSignupRole(formData.get('role'))

  if (!full_name || !email || !password) {
    return { error: 'Name, email, and password are required.' }
  }
  if (password.length < 6) {
    return { error: 'Password must be at least 6 characters.' }
  }

  try {
    const outcome = await withIdempotency(
      formData.get('idempotencyKey') as string,
      'auth:signup',
      async () => {
        const supabase = await createClient()
        const base = await callbackOrigin()
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name, role },
            emailRedirectTo: `${base}/auth/callback`,
          },
        })

        if (error || !data.user) {
          throw new Error(error?.message || 'Signup failed')
        }

        // Profile is ACTIVE from the start — verification (OTP/link) proves
        // email ownership, no admin step. Prisma bypasses RLS, so this works
        // even though the user has no session yet when confirmation is on.
        try {
          await prisma.profile.upsert({
            where: { id: data.user.id },
            update: { full_name, role, status: 'active' },
            create: {
              id: data.user.id,
              full_name,
              role,
              status: 'active',
            },
            select: { id: true },
          })
        } catch {
          throw new Error('Failed to create profile. Please try again.')
        }

        try {
          await writeAuditLog({
            userId: data.user.id,
            action: 'auth:signup',
            module: 'auth',
            details: {
              purpose: 'Self-registration (email+OTP)',
              summary: `Self-registered ${email} as ${role}, active`,
            },
          })
        } catch {
          // audit is best-effort
        }

        return { userId: data.user.id, session: !!data.session }
      }
    )

    const result = outcome.result as { userId: string; session: boolean }
    if (!result.session) {
      // Supabase requires email confirmation — show the OTP step.
      return { needsVerification: true, email, role }
    }
    return { success: true, email, role }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Signup failed' }
  }
}

/**
 * Verifies the 8-digit signup OTP Supabase emailed after `signup`.
 * On success the user gets a session (signed in) and an ACTIVE profile with
 * the role they picked — then the page redirects to their dashboard.
 */
export async function verifySignupOtp(
  _prevState: SignupState,
  formData: FormData
): Promise<SignupState> {
  const email = ((formData.get('email') as string) ?? '').trim()
  const token = ((formData.get('token') as string) ?? '').trim().replace(/\s+/g, '')
  const fullNameHint = ((formData.get('full_name') as string) ?? '').trim()
  const role = parseSignupRole(formData.get('role'))

  if (!email || !token) {
    return { error: 'Email and 8-digit code are required.', needsVerification: true, email }
  }

  try {
    const outcome = await withIdempotency(
      formData.get('idempotencyKey') as string,
      'auth:verify-signup-otp',
      async () => {
        const supabase = await createClient()
        const { data, error } = await supabase.auth.verifyOtp({
          email,
          token,
          type: 'signup',
        })
        if (error || !data.user) {
          throw new Error(error?.message || 'Invalid or expired code. Request a new one.')
        }
        const user = data.user
        const fullName =
          fullNameHint ||
          ((user.user_metadata?.full_name as string | undefined)?.trim() ?? '') ||
          email.split('@')[0] ||
          'User'
        const metaRole = parseSignupRole(
          (user.user_metadata?.role as string | undefined) ?? role
        )
        try {
          await prisma.profile.upsert({
            where: { id: user.id },
            update: { full_name: fullName, role: metaRole, status: 'active' },
            create: { id: user.id, full_name: fullName, role: metaRole, status: 'active' },
            select: { id: true },
          })
        } catch {
          throw new Error('Email verified but profile setup failed. Try signing in.')
        }
        try {
          await writeAuditLog({
            userId: user.id,
            action: 'auth:signup_verified',
            module: 'auth',
            details: {
              purpose: 'Self-registration email verified',
              summary: `Verified ${email} as ${metaRole}, active`,
            },
          })
        } catch {
          // best-effort
        }
        return { role: metaRole, userId: user.id }
      }
    )

    const roleRoute = roleRoutes[(outcome.result as { role: string }).role] || '/'
    redirect(roleRoute)
  } catch (e) {
    unstable_rethrow(e)
    const message = e instanceof Error ? e.message : 'Verification failed'
    // A consumed/unknown token on an already-confirmed address can never
    // succeed — point to sign-in instead of offering another code.
    if (isAlreadyVerifiedMessage(message)) {
      return { error: undefined, alreadyVerified: true, email }
    }
    return {
      error: message,
      needsVerification: true,
      email,
    }
  }
}

/** Re-sends the signup confirmation OTP to the given email. */
export async function resendSignupOtp(
  _prevState: SignupState,
  formData: FormData
): Promise<SignupState> {
  const email = ((formData.get('email') as string) ?? '').trim()
  if (!email) return { error: 'Email is required.', needsVerification: true }
  try {
    await withIdempotency(
      formData.get('idempotencyKey') as string,
      'auth:resend-signup-otp',
      async () => {
        const supabase = await createClient()
        const { error } = await supabase.auth.resend({ type: 'signup', email })
        if (error) throw new Error(error.message)
        return { sent: true }
      }
    )
    return { needsVerification: true, resent: true, email }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not resend code.'
    if (isAlreadyVerifiedMessage(message)) {
      return { error: undefined, alreadyVerified: true, email }
    }
    return {
      error: message,
      needsVerification: true,
      email,
    }
  }
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
