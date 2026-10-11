import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import prisma from '@/lib/prisma'
import { ANY_SIGNED_IN_API_ROLES, resolveApiAccess } from '@/lib/api-guard'
import { cacheKey, withCache, SERVER_TTLS } from '@/lib/personnel-cache'
import { etagForText, notModified } from '@/lib/etag'

/**
 * Active master data for personnel dropdowns (Phase 3 strict mode).
 * Any signed-in user with a known role may read (401 anonymous → 403
 * unknown/inactive role); writes stay Super Admin only.
 */
export async function GET(req: Request) {
  const tStart = Date.now()
  let tAuth = 0
  let tRole = 0
  let tQuery = 0
  let tSerialize = 0
  try {
    const supabase = await createClient()
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
    if (!userId) {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      userId = user?.id ?? null
    }
    tAuth = Date.now() - t0
    t0 = Date.now()
    const profile = userId
      ? await prisma.profile
          .findUnique({ where: { id: userId }, select: { role: true, status: true } })
          .catch(() => null)
      : null
    tRole = Date.now() - t0
    const access = resolveApiAccess(
      { userId: userId ?? null, role: profile?.role ?? null, status: profile?.status ?? null },
      ANY_SIGNED_IN_API_ROLES
    )
    if (access === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
    }
    if (access === 403) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: { 'Cache-Control': 'no-store' } })
    }

    const t1 = Date.now()
    // Static lookup: shared across roles (active units + catalog only, no
    // per-user rows), cached 300s server-side. Busted by master-data writes
    // (see INVALIDATION_MAP + bustSuperAdminScopes(['master-data'])).
    const cached = await withCache(
      cacheKey('master-data:active'),
      SERVER_TTLS.staticLookup,
      async () => {
        const [units, catalog] = await Promise.all([
          prisma.unit.findMany({
            where: { status: 'active' },
            orderBy: { name: 'asc' },
            select: { name: true, abbreviation: true },
          }),
          prisma.accountCatalog.findMany({
            where: { status: 'active' },
            orderBy: { account_code: 'asc' },
            select: { account_code: true, account_title: true, asset_type: true, account_name: true },
          }),
        ])
        return { units, catalog }
      }
    )
    const { units, catalog } = cached
    tQuery = Date.now() - t1

    const t2 = Date.now()
    const body = JSON.stringify({ units, catalog })
    const etag = etagForText(body)
    // Conditional read: matching ETag → 304 with no body (saves bytes on
    // every dropdown remount). Response stays `private` — authenticated
    // payloads must never be cached by shared proxies/CDNs.
    const notMod: Response | null = notModified(req, etag)
    if (notMod) return notMod
    tSerialize = Date.now() - t2
    const res = new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ETag: etag,
        // Private short-lived browser reuse; revalidation via ETag keeps it
        // fresh without ever allowing shared-proxy storage.
        'Cache-Control': 'private, max-age=60, must-revalidate',
      },
    })
    try {
      if (process.env.PERF_TRACE === '1') {
        console.log(
          `[perf master-data] total ${Date.now() - tStart}ms = auth ${tAuth}ms + role ${tRole}ms + queries ${tQuery}ms + serialize ${tSerialize}ms units=${units.length} catalog=${catalog.length}`
        )
      }
      res.headers.set('Server-Timing', `auth;dur=${tAuth}, role;dur=${tRole}, queries;dur=${tQuery}, serialize;dur=${tSerialize}, total;dur=${Date.now() - tStart}`)
    } catch {
      /* ignore */
    }
    return res
  } catch (e) {
    console.error('[api/master-data]', e)
    return NextResponse.json({ error: 'Failed to load master data' }, { status: 500 })
  }
}
