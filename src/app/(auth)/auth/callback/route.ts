import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') ?? '/'

  if (code) {
    const supabase = createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()

        const roleRoutes: Record<string, string> = {
          super_admin: '/super-admin/dashboard',
          pgso_personnel: '/personnel/dashboard',
          employee: '/employee/dashboard',
        }

        return NextResponse.redirect(
          `${requestUrl.origin}${roleRoutes[profile?.role] || next}`
        )
      }
    }
  }

  return NextResponse.redirect(`${requestUrl.origin}${next}`)
}
