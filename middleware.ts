import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

function isPublicPath(pathname: string): boolean {
  // Landing + footer info pages are public so visitors (signed out) can
  // read help content. Auth pages + callbacks + health stay public.
  if (pathname === '/') return true
  const publicPrefixes = [
    '/login',
    '/signup',
    '/forgot-password',
    '/info',
    '/auth',
    '/api/health',
  ]
  return publicPrefixes.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  )
}

function isAuthPage(pathname: string): boolean {
  return (
    pathname === '/login' ||
    pathname.startsWith('/login/') ||
    pathname === '/signup' ||
    pathname.startsWith('/signup/')
  )
}

/** Only same-origin absolute paths are honored (open-redirect guard). */
function safeNext(value: string | null): string | null {
  if (!value) return null
  if (!value.startsWith('/') || value.startsWith('//')) return null
  return value
}

function roleAllowsPath(role: string, path: string): boolean {
  if (path === '/' || path.startsWith('/login') || path.startsWith('/signup'))
    return true
  const m = path.match(/^\/(super-admin|personnel|employee)(\/|$)/)
  if (!m) return true // non-role pages (e.g. future public pages)
  const map: Record<string, string> = {
    'super-admin': 'super_admin',
    personnel: 'pgso_personnel',
    employee: 'employee',
  }
  return role === map[m[1]]
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
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
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const pathname = request.nextUrl.pathname
  const publicPath = isPublicPath(pathname)

  // Validate session server-side (getUser hits Supabase, unlike getSession
  // which only reads cookies). Missing/invalid session => treated as signed out.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // --- Signed OUT -----------------------------------------------------
  if (!user) {
    if (publicPath) return supabaseResponse
    // Protected page + guest => send to sign-in, remembering where they
    // wanted to go so login can bounce them back after auth.
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    const attempted = `${pathname}${request.nextUrl.search}`
    url.searchParams.set('next', attempted)
    return NextResponse.redirect(url)
  }

  // --- Signed IN: check profile status --------------------------------
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', user.id)
    .single()

  if (!profile || profile.status === 'inactive' || profile.status === 'pending') {
    await supabase.auth.signOut()
    // Public pages can render the notice; protected pages also land here.
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set(
      'notice',
      !profile || profile.status === 'pending' ? 'pending' : 'inactive'
    )
    return NextResponse.redirect(url)
  }

  // Signed-in users don't need the auth pages — send them home
  // ("/" then role-routes to their dashboard).
  if (isAuthPage(pathname)) {
    const next = safeNext(request.nextUrl.searchParams.get('next'))
    const url = request.nextUrl.clone()
    url.pathname = next && roleAllowsPath(profile.role, next) ? next : '/'
    url.search = ''
    return NextResponse.redirect(url)
  }

  // Landing "/" is public, but signed-in users go straight to their dashboard.
  if (pathname === '/') {
    const roleRoutes: Record<string, string> = {
      super_admin: '/super-admin/dashboard',
      pgso_personnel: '/personnel/dashboard',
      employee: '/employee/dashboard',
    }
    const url = request.nextUrl.clone()
    url.pathname = roleRoutes[profile.role] || '/'
    return NextResponse.redirect(url)
  }

  // --- Signed IN: role guard ------------------------------------------
  const roleMatch = pathname.match(/^\/(super-admin|personnel|employee)/)

  if (roleMatch) {
    const requiredRole = roleMatch[1]
    const roleMap: Record<string, string> = {
      'super-admin': 'super_admin',
      personnel: 'pgso_personnel',
      employee: 'employee',
    }

    if (profile.role !== roleMap[requiredRole]) {
      const url = request.nextUrl.clone()
      url.pathname = '/'
      url.search = ''
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
