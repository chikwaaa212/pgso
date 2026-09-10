'use server'

import { createClient } from '@/lib/supabase/server'
import prisma from '@/lib/prisma'
import { writeAuditLog } from '@/lib/audit'
import { withIdempotency } from '@/lib/idempotency'
import { redirect, unstable_rethrow } from 'next/navigation'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { LoginState, SignupState } from '@/types'

const roleRoutes: Record<string, string> = {
  super_admin: '/super-admin/dashboard',
  pgso_personnel: '/personnel/dashboard',
  employee: '/employee/dashboard',
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

    redirect(roleRoutes[outcome.result.role] || '/')
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
