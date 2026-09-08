'use server'

import { createClient as createAdminClient } from '@supabase/supabase-js'
import prisma from '@/lib/prisma'
import { withIdempotency } from '@/lib/idempotency'
import type { SignupState } from '@/types'

export async function addPersonnelEmployee(
  _prevState: SignupState,
  formData: FormData
): Promise<SignupState> {
  const full_name = formData.get('full_name') as string
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  if (!full_name || !email || !password) {
    return { error: 'All fields are required.' }
  }

  if (password.length < 6) {
    return { error: 'Password must be at least 6 characters.' }
  }

  const supabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    await withIdempotency(
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

        return { userId: data.user.id }
      }
    )
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to create account.' }
  }

  return { success: true }
}
