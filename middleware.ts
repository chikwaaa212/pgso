import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
  const supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const publicPaths = ['/login', '/signup', '/auth/callback']
  const isPublicPath = publicPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  )

  if (!isPublicPath) {
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, status')
      .eq('id', session.user.id)
      .single()

    if (!profile || profile.status === 'inactive') {
      await supabase.auth.signOut()
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }

    if (request.nextUrl.pathname === '/') {
      const roleRoutes: Record<string, string> = {
        super_admin: '/super-admin/dashboard',
        pgso_personnel: '/personnel/dashboard',
        employee: '/employee/dashboard',
      }
      const url = request.nextUrl.clone()
      url.pathname = roleRoutes[profile.role] || '/'
      return NextResponse.redirect(url)
    }

    const pathname = request.nextUrl.pathname
    const roleMatch = pathname.match(/^\/(super-admin|personnel|employee)/)

    if (roleMatch) {
      const requiredRole = roleMatch[1]
      const roleMap: Record<string, string> = {
        'super-admin': 'super_admin',
        'personnel': 'pgso_personnel',
        'employee': 'employee',
      }

      if (profile.role !== roleMap[requiredRole]) {
        const url = request.nextUrl.clone()
        url.pathname = '/'
        return NextResponse.redirect(url)
      }
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
