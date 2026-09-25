'use server'

import { revalidatePath } from 'next/cache'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import prisma from '@/lib/prisma'
import { withIdempotency } from '@/lib/idempotency'
import { writeAuditLog } from '@/lib/audit'
import { requireSuperAdmin } from '@/lib/auth-guard'
import type { SignupState } from '@/types'

// Reuse one admin client per server instance. createClient itself is cheap,
// but a singleton avoids re-resolving fetch/storage on every submit and
// `persistSession: false` skips the (useless server-side) session storage.
let adminClientSingleton: SupabaseClient | null = null
function adminClient() {
  if (!adminClientSingleton) {
    adminClientSingleton = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )
  }
  return adminClientSingleton
}

export async function addPersonnelEmployee(
  _prevState: SignupState,
  formData: FormData
): Promise<SignupState> {
  let actorId = ''
  try {
    const session = await requireSuperAdmin()
    actorId = session.userId
  } catch {
    return { error: 'Forbidden: Super Admin only.' }
  }

  const full_name = (formData.get('full_name') as string)?.trim()
  const email = (formData.get('email') as string)?.trim()
  const password = formData.get('password') as string

  if (!full_name || !email || !password) {
    return { error: 'All fields are required.' }
  }

  if (password.length < 6) {
    return { error: 'Password must be at least 6 characters.' }
  }

  const supabase = adminClient()
  const startedAt = Date.now()

  let newUserId = ''

  try {
    const outcome = await withIdempotency(
      formData.get('idempotencyKey') as string,
      'personnel:create',
      async () => {
        const { data, error: createError } =
          await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { full_name },
          })

        if (createError || !data.user) {
          throw new Error(createError?.message || 'Failed to create account.')
        }

        try {
          await prisma.profile.upsert({
            where: { id: data.user.id },
            update: { full_name, role: 'pgso_personnel', status: 'active' },
            create: {
              id: data.user.id,
              full_name,
              role: 'pgso_personnel',
              status: 'active',
            },
          })
        } catch {
          await supabase.auth.admin.deleteUser(data.user.id)
          throw new Error('Failed to create profile. Please try again.')
        }

        // Audit is best-effort (never throws) — run it without blocking
        // the profile write's return path any longer than one await.
        // Kept inside the idempotent fn so a duplicate retry reuses the
        // stored result instead of writing a second audit row.
        await writeAuditLog({
          userId: actorId,
          action: 'users:create_personnel',
          module: 'users',
          details: {
            purpose: 'Create PGSO personnel account',
            summary: `Created personnel ${email}`,
            reference_id: data.user.id,
          },
        })

        return { userId: data.user.id }
      }
    )
    newUserId = (outcome.result as { userId?: string }).userId ?? ''
    if (outcome.duplicate && !newUserId) {
      return { success: true }
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to create account.' }
  }

  // Bust the cached overview/user counts and revalidate the pages that read
  // them — same pattern as super-admin/users actions. Without this the
  // Personnel stat stays stale for 60s, which looks like the submit failed
  // and invites a double-submit (which then waits on the idempotency poll).
  try {
    const { bustSuperAdminScopes } = await import('@/lib/personnel-cache')
    await bustSuperAdminScopes(['dashboard'])
  } catch {
    // best-effort: a stale cache must not fail an already-created account
  }
  revalidatePath('/super-admin/dashboard')
  revalidatePath('/super-admin/users')

  console.info(
    `[addPersonnelEmployee] created ${email} (${newUserId}) in ${Date.now() - startedAt}ms`
  )
  return { success: true }
}
