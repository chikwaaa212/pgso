import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import prisma from '@/lib/prisma'
import { writeAuditLog } from '@/lib/audit'

const roleRoutes: Record<string, string> = {
  super_admin: '/super-admin/dashboard',
  pgso_personnel: '/personnel/dashboard',
  employee: '/employee/dashboard',
}

/** Only same-origin paths are honored for `next` (open-redirect guard). */
function safeNext(value: string | null): string {
  if (value && value.startsWith('/') && !value.startsWith('//')) return value
  return '/'
}

async function auditBestEffort(entry: {
  userId: string
  action: string
  summary: string
}) {
  try {
    await writeAuditLog({
      userId: entry.userId,
      action: entry.action,
      module: 'auth',
      details: { purpose: 'OAuth sign-in', summary: entry.summary },
    })
  } catch {
    // audit is best-effort
  }
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = safeNext(requestUrl.searchParams.get('next'))

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        const email = user.email ?? 'unknown email'
        const fullName =
          (user.user_metadata?.full_name as string | undefined)?.trim() ||
          (user.user_metadata?.name as string | undefined)?.trim() ||
          email.split('@')[0] ||
          'Employee'

        let profile = await prisma.profile
          .findUnique({ where: { id: user.id } })
          .catch(() => null)

        // First-time OAuth user → employee self-registration (pending approval).
        if (!profile) {
          profile = await prisma.profile
            .create({
              data: { id: user.id, full_name: fullName, role: 'employee', status: 'pending' },
            })
            .catch(() => null)
          if (profile) {
            await auditBestEffort({
              userId: user.id,
              action: 'auth:signup_oauth',
              summary: `OAuth signup for ${email}, pending approval`,
            })
          }
        }

        // Pending/inactive accounts cannot enter the app (mirrors login +
        // middleware): sign out immediately with a clear notice.
        if (!profile || profile.status === 'pending') {
          await supabase.auth.signOut()
          return NextResponse.redirect(`${requestUrl.origin}/login?notice=pending`)
        }
        if (profile.status === 'inactive') {
          await supabase.auth.signOut()
          return NextResponse.redirect(`${requestUrl.origin}/login?notice=inactive`)
        }

        await auditBestEffort({
          userId: user.id,
          action: 'auth:login_oauth',
          summary: `OAuth sign-in as ${email}`,
        })
        return NextResponse.redirect(
          `${requestUrl.origin}${roleRoutes[profile.role] || next}`
        )
      }
    }
  }

  return NextResponse.redirect(`${requestUrl.origin}${next}`)
}
