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

// Short-lived role cache for middleware (Edge-safe, Redis-backed).
// TTL 60s: eliminates the per-request profiles DB lookup on warm requests
// (the largest middleware cost after Auth), while bounding how long a role
// change or deactivation can go unnoticed to ≤60s. Writes to role/status
// must delete `pgso:middleware-role:<userId>` (see bustRoleCache callers +
// users/actions) and logout clears it best-effort; TTL is the backstop.
const MIDDLEWARE_ROLE_TTL_S = 60
const MIDDLEWARE_REDIS_TIMEOUT_MS = 600

function middlewareRedis(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return { url: url.replace(/\/+$/, ''), token }
}

async function redisGetRole(
  userId: string
): Promise<{ role: string; status: string } | null> {
  const cfg = middlewareRedis()
  if (!cfg) return null
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), MIDDLEWARE_REDIS_TIMEOUT_MS)
    try {
      const res = await fetch(
        `${cfg.url}/get/${encodeURIComponent(`pgso:middleware-role:${userId}`)}`,
        { headers: { Authorization: `Bearer ${cfg.token}` }, signal: ctrl.signal }
      )
      if (!res.ok) return null
      const body = (await res.json()) as { result?: string | null }
      if (!body.result) return null
      const parsed = JSON.parse(body.result) as { role?: unknown; status?: unknown }
      if (typeof parsed.role === 'string' && typeof parsed.status === 'string') {
        return { role: parsed.role, status: parsed.status }
      }
      return null
    } finally {
      clearTimeout(timer)
    }
  } catch {
    return null
  }
}

async function redisSetRole(
  userId: string,
  profile: { role: string; status: string }
): Promise<void> {
  const cfg = middlewareRedis()
  if (!cfg) return
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), MIDDLEWARE_REDIS_TIMEOUT_MS)
    try {
      await fetch(
        `${cfg.url}/set/${encodeURIComponent(`pgso:middleware-role:${userId}`)}/${encodeURIComponent(JSON.stringify(profile))}?EX=${MIDDLEWARE_ROLE_TTL_S}`,
        { headers: { Authorization: `Bearer ${cfg.token}` }, signal: ctrl.signal }
      )
    } finally {
      clearTimeout(timer)
    }
  } catch {
    /* best-effort */
  }
}

function withServerTiming(res: NextResponse, steps: Array<{ name: string; ms: number }>): NextResponse {
  try {
    if (process.env.PERF_TRACE === '1') {
      res.headers.set('Server-Timing', steps.map((s) => `${s.name};dur=${s.ms}`).join(', '))
    }
  } catch {
    /* ignore */
  }
  return res
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
  const tStart = Date.now()
  let tAuth = 0
  let tRole = 0

  // Fast path: local JWT verification (no Auth-server round-trip) when the
  // project uses asymmetric signing keys. Falls back to getUser() for
  // symmetric secrets or runtimes without WebCrypto.
  let userId: string | null = null
  let t0 = Date.now()
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.auth as any).getClaims()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sub = (data?.claims as any)?.sub as string | undefined
    if (!error && sub) userId = sub
  } catch {
    /* fall through */
  }
  let authVia: string = userId ? 'claims' : 'none'
  if (!userId) {
    // Validate session server-side (getUser hits Supabase, unlike getSession
    // which only reads cookies). Missing/invalid session => treated as signed out.
    const {
      data: { user },
    } = await supabase.auth.getUser()
    authVia = 'getUser'
    userId = user?.id ?? null
  }
  tAuth = Date.now() - t0

  // --- Signed OUT -----------------------------------------------------
  if (!userId) {
    if (publicPath) return withServerTiming(supabaseResponse, [{ name: 'auth', ms: tAuth }, { name: 'total', ms: Date.now() - tStart }])
    // Protected page + guest => send to sign-in, remembering where they
    // wanted to go so login can bounce them back after auth.
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    const attempted = `${pathname}${request.nextUrl.search}`
    url.searchParams.set('next', attempted)
    return NextResponse.redirect(url)
  }

  // --- Signed IN: check profile status --------------------------------
  // Redis-backed 60s role cache (warm requests skip the DB entirely).
  t0 = Date.now()
  let profile: { role: string; status: string } | null = await redisGetRole(userId)
  const roleVia = profile ? 'redis' : 'db'
  if (!profile) {
    const { data } = await supabase
      .from('profiles')
      .select('role, status')
      .eq('id', userId)
      .single()
    profile = data as { role: string; status: string } | null
    if (profile?.role && profile?.status) {
      void redisSetRole(userId, { role: profile.role, status: profile.status })
    }
  }
  tRole = Date.now() - t0
  const finish = (res: NextResponse): NextResponse => {
    try {
      if (process.env.PERF_TRACE === '1') {
        console.log(
          `[perf middleware] total ${Date.now() - tStart}ms = auth(${authVia}) ${tAuth}ms + role(${roleVia}) ${tRole}ms path=${pathname}`
        )
      }
    } catch {
      /* ignore */
    }
    return withServerTiming(res, [
      { name: 'auth', ms: tAuth },
      { name: 'role', ms: tRole },
      { name: 'total', ms: Date.now() - tStart },
    ])
  }

  // Self-registration requires Super Admin approval: `pending` accounts are
  // blocked like `inactive` until an admin activates them.
  if (!profile || profile.status === 'inactive' || profile.status === 'pending') {
    await supabase.auth.signOut()
    // Public pages can render the notice; protected pages also land here.
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('notice', profile?.status === 'pending' ? 'pending' : 'inactive')
    return finish(NextResponse.redirect(url))
  }

  // Signed-in users don't need the auth pages — send them home
  // ("/" then role-routes to their dashboard).
  if (isAuthPage(pathname)) {
    const next = safeNext(request.nextUrl.searchParams.get('next'))
    const url = request.nextUrl.clone()
    url.pathname = next && roleAllowsPath(profile.role, next) ? next : '/'
    url.search = ''
    return finish(NextResponse.redirect(url))
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
    return finish(NextResponse.redirect(url))
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
      return finish(NextResponse.redirect(url))
    }
  }

  return finish(supabaseResponse)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
