'use server'

import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import prisma from '@/lib/prisma'
import { writeAuditLog } from '@/lib/audit'
import { withIdempotency } from '@/lib/idempotency'
import { redirect, unstable_rethrow } from 'next/navigation'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { LoginState, SignupState } from '@/types'
import { OAUTH_PROVIDER } from './oauth'

const roleRoutes: Record<string, string> = {
  super_admin: '/super-admin/dashboard',
  pgso_personnel: '/personnel/dashboard',
  employee: '/employee/dashboard',
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
 * Starts Supabase OAuth (PKCE). New users get an employee/pending profile in
 * the callback; returning users keep their existing role. Used by both the
 * signup page (register) and the login page (OAuth users have no password).
 * Preserves `next` (same-origin path) so guests bounced from a protected
 * page return there after sign-in.
 */
export async function signInWithOAuth(formData?: FormData): Promise<never> {
  const rawNext =
    formData instanceof FormData ? (formData.get('next') as string | null) : null
  const next = safeNextParam(rawNext)
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
          throw new Error(error.message)
        }

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          throw new Error('Login failed')
        }

        const profile = await prisma.profile.findUnique({
          where: { id: user.id },
        })

        if (!profile) {
          throw new Error('Profile not found. Contact your administrator.')
        }

        if (profile.status === 'pending') {
          await supabase.auth.signOut()
          throw new Error('Your account is awaiting admin approval.')
        }

        if (profile.status === 'inactive') {
          await supabase.auth.signOut()
          throw new Error('Your account is inactive.')
        }

        return { role: profile.role, userId: user.id }
      }
    )

    await writeAuditLog({
      userId: outcome.result.userId,
      action: 'auth:login',
      module: 'auth',
      details: {
        purpose: 'User sign-in',
        summary: `Signed in as ${email}`,
      },
    })

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
    return { error: e instanceof Error ? e.message : 'Login failed' }
  }
}

export async function signup(_prevState: SignupState, formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const full_name = formData.get('full_name') as string

  const supabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    await withIdempotency(
      formData.get('idempotencyKey') as string,
      'auth:signup',
      async () => {
        const { data, error } = await supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name },
        })

        if (error || !data.user) {
          throw new Error(error?.message || 'Signup failed')
        }

        try {
          await prisma.profile.upsert({
            where: { id: data.user.id },
            update: { full_name, role: 'employee', status: 'pending' },
            create: {
              id: data.user.id,
              full_name,
              role: 'employee',
              status: 'pending',
            },
          })
        } catch {
          await supabase.auth.admin.deleteUser(data.user.id)
          throw new Error('Failed to create profile. Please try again.')
        }

        try {
          await writeAuditLog({
            userId: data.user.id,
            action: 'auth:signup_request',
            module: 'auth',
            details: {
              purpose: 'Employee self-registration',
              summary: `Signup requested for ${email}, pending approval`,
            },
          })
        } catch {
          // audit is best-effort
        }

        return { userId: data.user.id }
      }
    )
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Signup failed' }
  }

  return { success: true }
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
