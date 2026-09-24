import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import prisma from '@/lib/prisma'
import { writeAuditLog } from '@/lib/audit'
import { SIGNUP_ROLE_COOKIE } from '@/app/(auth)/oauth'

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

function parseRole(value: string | null | undefined): 'employee' | 'pgso_personnel' {
  return value === 'pgso_personnel' ? 'pgso_personnel' : 'employee'
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

        // Role the user picked on the signup page (cookie set before the
        // Google round-trip). Falls back to the invite metadata, then employee.
        let requestedRole: 'employee' | 'pgso_personnel' = 'employee'
        try {
          const jar = await cookies()
          requestedRole = parseRole(jar.get(SIGNUP_ROLE_COOKIE)?.value)
          jar.delete(SIGNUP_ROLE_COOKIE)
        } catch {
          requestedRole = parseRole(user.user_metadata?.role as string | undefined)
        }

        let profile = await prisma.profile
          .findUnique({
            where: { id: user.id },
            select: { id: true, role: true, status: true },
          })
          .catch(() => null)

        // Collect audit writes and flush them concurrently before
        // redirecting — order between them doesn't matter.
        const pendingAudits: Promise<void>[] = []

        // First-time OAuth user → self-registration, ACTIVE immediately.
        // No admin approval — Google account ownership is the verification.
        if (!profile) {
          profile = await prisma.profile
            .create({
              data: {
                id: user.id,
                full_name: fullName,
                role: requestedRole,
                status: 'active',
              },
              select: { id: true, role: true, status: true },
            })
            .catch(() => null)
          if (profile) {
            pendingAudits.push(
              auditBestEffort({
                userId: user.id,
                action: 'auth:signup_oauth',
                summary: `OAuth self-registration for ${email} as ${profile.role}, active`,
              })
            )
          }
        } else if (profile.status === 'pending') {
          // Legacy pending accounts (pre self-service) are auto-activated —
          // admin approval no longer gates sign-in.
          profile = await prisma.profile
            .update({
              where: { id: user.id },
              data: { status: 'active' },
              select: { id: true, role: true, status: true },
            })
            .catch(() => ({ ...profile!, status: 'active' as const }))
        }

        // Only inactive accounts are blocked now (mirrors login + middleware).
        if (!profile) {
          await supabase.auth.signOut()
          return NextResponse.redirect(`${requestUrl.origin}/login?notice=oauth-error`)
        }
        if (profile.status === 'inactive') {
          await supabase.auth.signOut()
          return NextResponse.redirect(`${requestUrl.origin}/login?notice=inactive`)
        }

        pendingAudits.push(
          auditBestEffort({
            userId: user.id,
            action: 'auth:login_oauth',
            summary: `OAuth sign-in as ${email}`,
          })
        )
        await Promise.allSettled(pendingAudits)
        const fallback = roleRoutes[profile.role] || '/employee/dashboard'
        // Honor `next` only when it matches the user's role area.
        const m = next.match(/^\/(super-admin|personnel|employee)(\/|$)/)
        if (m) {
          const map: Record<string, string> = {
            'super-admin': 'super_admin',
            personnel: 'pgso_personnel',
            employee: 'employee',
          }
          if (profile.role !== map[m[1]]) {
            return NextResponse.redirect(`${requestUrl.origin}${fallback}`)
          }
          return NextResponse.redirect(`${requestUrl.origin}${next}`)
        }
        return NextResponse.redirect(`${requestUrl.origin}${fallback}`)
      }
    }
  }

  return NextResponse.redirect(`${requestUrl.origin}${next}`)
}
