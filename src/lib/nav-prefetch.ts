/**
 * Main-navigation intent prefetch (imported by the three role navbars).
 *
 * Hovering or focusing a nav link warms the target page's first-page cache
 * entry, so the navigation paints instantly instead of flashing a skeleton.
 * Each entry's `key` MUST equal the target page's `useCachedAction` key for
 * its defaults (page 1, empty search/filters) — the source page + line
 * shape is cited per entry. If a page changes its key format, update the
 * matching entry here (Phase 4 replaces these with the shared key factory).
 * Warming a stale key is a harmless no-op (never throws, never busts).
 */

import { PAGE_SIZE } from '@/lib/constants'
import { FIXED_PAGE_SIZE } from '@/components/personnel/TablePager'
import { buildQueryKey } from '@/lib/query-keys'
import { prefetchQuery } from '@/lib/query-client'
import { getDashboardSnapshot } from '@/app/personnel/dashboard/actions'
import { getUnifiedAssetsPage } from '@/app/personnel/assets/actions'
import { getRequestsPage } from '@/app/personnel/requests/actions'
import { getUsersPage, getUserCounts } from '@/app/super-admin/users/actions'
import {
  browseDeliveriesPage,
  browseRequestsPage,
} from '@/app/super-admin/browse/actions'
import {
  getMyAssets,
  getMyAssetRequests,
  getMyDocs,
  getMyRequestOptions,
  getMyRequests,
} from '@/app/employee/actions'

export interface NavPrefetchEntry {
  key: string
  run: () => Promise<unknown>
  staleTime: number
}

const MAP: Record<string, NavPrefetchEntry[]> = {
  // personnel/dashboard/page.tsx: buildQueryKey({ module: 'personnel', resource: 'dashboard' })
  '/personnel/dashboard': [
    { key: buildQueryKey({ module: 'personnel', resource: 'dashboard' }), run: () => getDashboardSnapshot(), staleTime: 60_000 },
  ],
  // personnel/assets/page.tsx: buildQueryKey({ module: 'personnel', resource: 'assets', page, pageSize, filters }) — defaults below match page 1
  '/personnel/assets': [
    {
      key: buildQueryKey({
        module: 'personnel',
        resource: 'assets',
        page: 1,
        pageSize: PAGE_SIZE,
        filters: { q: '', status: 'all', source: 'all', condition: 'all', unit: 'all', category: 'all' },
      }),
      run: () =>
        getUnifiedAssetsPage({
          page: 1,
          q: '',
          status: 'all',
          source: 'all',
          condition: 'all',
          unit: 'all',
          category: 'all',
        }),
      staleTime: 60_000,
    },
  ],
  // personnel/requests/page.tsx: buildQueryKey({ module: 'personnel', resource: 'requests', ... }) — defaults below match page 1
  '/personnel/requests': [
    {
      key: buildQueryKey({
        module: 'personnel',
        resource: 'requests',
        page: 1,
        pageSize: FIXED_PAGE_SIZE,
        filters: { q: '', status: 'all', type: 'all' },
      }),
      run: () =>
        getRequestsPage({
          forRecipient: true,
          page: 1,
          pageSize: FIXED_PAGE_SIZE,
          q: '',
          status: 'all',
          type: 'all',
        }),
      staleTime: 30_000,
    },
  ],
  // super-admin/users/page.tsx
  '/super-admin/users': [
    {
      key: buildQueryKey({ module: 'super-admin', resource: 'users', page: 1, filters: { q: '' } }),
      run: () => getUsersPage({ page: 1, q: '' }),
      staleTime: 30_000,
    },
    {
      key: buildQueryKey({ module: 'super-admin', resource: 'users-counts' }),
      run: () => getUserCounts(),
      staleTime: 30_000,
    },
  ],
  // super-admin/deliveries/page.tsx
  '/super-admin/deliveries': [
    {
      key: buildQueryKey({ module: 'super-admin', resource: 'deliveries', page: 1, filters: { q: '' } }),
      run: () => browseDeliveriesPage({ page: 1, q: '' }),
      staleTime: 30_000,
    },
  ],
  // super-admin/requests/page.tsx
  '/super-admin/requests': [
    {
      key: buildQueryKey({ module: 'super-admin', resource: 'requests', page: 1, filters: { q: '' } }),
      run: () => browseRequestsPage({ page: 1, q: '' }),
      staleTime: 30_000,
    },
  ],
  // employee/assets/page.tsx: buildQueryKey({ module: 'employee', resource: 'assets' }) + {assets,docs,requests}
  '/employee/assets': [
    {
      key: buildQueryKey({ module: 'employee', resource: 'assets' }),
      run: () =>
        Promise.all([getMyAssets(), getMyDocs(), getMyAssetRequests()]).then(
          ([assets, docs, requests]) => ({ assets, docs, requests })
        ),
      staleTime: 30_000,
    },
  ],
  // employee/requests/page.tsx: buildQueryKey({ module: 'employee', resource: 'requests' }) + {requests,options}
  '/employee/requests': [
    {
      key: buildQueryKey({ module: 'employee', resource: 'requests' }),
      run: () =>
        Promise.all([getMyRequests(), getMyRequestOptions()]).then(
          ([requests, options]) => ({ requests, options })
        ),
      staleTime: 30_000,
    },
  ],
}

/**
 * Intent props to spread onto a nav `<Link href={href}>`: hovering or
 * keyboard-focusing the link warms every mapped entry once (fresh entries
 * skip the network; in-flight prefetches dedupe). Unknown hrefs get `{}`.
 */
export function navPrefetchProps(href: string): {
  onMouseEnter?: () => void
  onFocus?: () => void
} {
  const entries = MAP[href]
  if (!entries || entries.length === 0) return {}
  const fire = () => {
    for (const e of entries) {
      void prefetchQuery(e.key, e.run, { staleTime: e.staleTime }).catch(() => {})
    }
  }
  return { onMouseEnter: fire, onFocus: fire }
}
