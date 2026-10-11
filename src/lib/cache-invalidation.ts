/**
 * Cache-invalidation map (client-safe, no server imports).
 *
 * Single source of truth for "mutation X busts keys Y". Client pages call
 * `bustClientCache(clientPrefixes)` (+ optionally `patchClientCache` for the
 * optimistic write); server actions call `bustCachePrefixes(serverPrefixes)`
 * or the narrow `bustPersonnelScopes` / `bustSuperAdminScopes` helpers, whose
 * prefix tables mirror this map.
 *
 * Rules:
 * - Invalidate ONLY the affected resource (+ related counts/badges), never
 *   the whole cache.
 * - PERSONNEL shared pools (assets registry, inventory quantities, request
 *   pick-lists, master data) stay global per `personnel-scope.ts` — keys for
 *   those pools intentionally omit userId.
 * - Per-user queues (deliveries, inspections, requests inbox, repairs,
 *   issuances, documents, logs, dashboards) MUST include role/userId in the
 *   key (see `query-keys.buildQueryKey`) and are busted by prefix.
 */

export interface InvalidationEntry {
  /** Client prefixes (`client-cache` / v2 `resourcePrefix` + legacy keys). */
  client: string[]
  /** Server Redis prefixes (`personnel-cache` namespaces). */
  server: string[]
  /** Human note for reviewers. */
  note: string
}

function v2(module: string, resource: string): string {
  return `pgso:v2:${module}:${resource}:`
}

export const INVALIDATION_MAP: Record<string, InvalidationEntry> = {
  delivery: {
    client: ['pgso:client:deliveries-list', 'pgso:client:dashboard-snapshot', v2('personnel', 'deliveries'), v2('personnel', 'dashboard'), v2('super-admin', 'deliveries')],
    server: ['personnel:deliveries', 'personnel:delivery-', 'personnel:dashboard', 'personnel:ops-stats', 'super-admin:deliveries-list', 'super-admin:deliveries-page', 'super-admin:overview'],
    note: 'logDelivery busts delivery lists + dashboard/badge counts.',
  },
  inspection: {
    client: ['pgso:client:inspections-list', 'pgso:client:iar-snapshot', 'pgso:client:dashboard-snapshot', v2('personnel', 'inspections'), v2('personnel', 'inspections-air'), v2('personnel', 'inspections-counts'), v2('personnel', 'dashboard'), v2('super-admin', 'inspections')],
    server: ['personnel:inspection', 'personnel:iar-', 'personnel:monthly', 'personnel:dashboard', 'super-admin:inspections-list', 'super-admin:inspections-page', 'super-admin:overview'],
    note: 'inspect / IAR attach busts queue + AIR snapshot + badges.',
  },
  inventory: {
    client: ['pgso:client:inventory-items', 'pgso:client:dashboard-snapshot', v2('personnel', 'inventory'), v2('personnel', 'inventory-stats'), v2('personnel', 'dashboard'), 'pgso:client:admin-inventory-list', v2('super-admin', 'inventory'), v2('super-admin', 'inventory-stats')],
    server: ['inventory:', 'personnel:inventory', 'personnel:low-stock', 'personnel:dashboard', 'super-admin:inventory-list', 'super-admin:overview', 'super-admin:record-counts'],
    note: 'Stock upsert / threshold edit busts quantities + low-stock + badges.',
  },
  asset: {
    client: ['pgso:assets:unified', 'pgso:client:assets-snapshot', 'pgso:client:dashboard-snapshot', v2('personnel', 'assets'), v2('super-admin', 'assets'), 'pgso:admin-assets:unified'],
    server: ['assets:', 'personnel:asset', 'personnel:unified', 'personnel:dashboard', 'super-admin:overview', 'super-admin:recent-assets'],
    note: 'Asset/stock CRUD + import busts registry pages + dashboard.',
  },
  issuance: {
    client: ['pgso:client:issuances-list', 'pgso:client:issues-snapshot', 'pgso:client:dashboard-snapshot', v2('personnel', 'issuances'), v2('personnel', 'issues'), v2('personnel', 'dashboard'), v2('super-admin', 'issuances'), v2('employee', 'assets')],
    server: ['personnel:issuance', 'personnel:public-issues', 'personnel:dashboard', 'super-admin:issuances-list', 'super-admin:issuances-page', 'super-admin:overview', 'employee:'],
    note: 'Issuance create/update busts PAR/ICS lists + public issues + inventory counts + the employee namespace (receiver docs/assets/detail).',
  },
  request: {
    client: ['pgso:client:requests-list', 'pgso:client:dashboard-snapshot', 'pgso:client:employee-requests-snapshot', v2('personnel', 'requests'), v2('employee', 'requests'), v2('super-admin', 'requests')],
    server: ['personnel:request', 'personnel:dashboard-stats', 'personnel:dashboard', 'super-admin:requests-list', 'super-admin:requests-page', 'super-admin:overview'],
    note: 'Request create/approve/reject/complete busts inbox + badges.',
  },
  repair: {
    client: ['pgso:client:repairs-list', 'pgso:client:dashboard-snapshot', v2('personnel', 'repairs'), v2('super-admin', 'repairs'), v2('personnel', 'dashboard')],
    server: ['personnel:repair', 'personnel:dashboard', 'super-admin:repairs-list', 'super-admin:overview'],
    note: 'Repair create/start/complete/reopen busts queue + badges.',
  },
  document: {
    client: ['pgso:client:documents-snapshot', v2('personnel', 'documents'), v2('personnel', 'documents-counts'), v2('personnel', 'documents-viewed'), 'pgso:client:admin-documents-snapshot', v2('super-admin', 'documents'), v2('super-admin', 'documents-counts'), v2('super-admin', 'documents-viewed')],
    server: ['personnel:delivery-documents', 'personnel:iar-reports', 'personnel:viewed-doc', 'super-admin:documents-tab'],
    note: 'Document writes are view-tracking only; source-table writes bust tabs.',
  },
  issues: {
    client: ['pgso:client:issues-snapshot', v2('personnel', 'issues'), v2('personnel', 'issues-type-options'), v2('personnel', 'issues-completed'), v2('super-admin', 'issues'), v2('super-admin', 'issues-type-options'), v2('super-admin', 'issues-completed')],
    server: ['personnel:public-issues', 'personnel:completed-request', 'super-admin:overview'],
    note: 'Issuance/request writes bust issued lines + completed QR records.',
  },
  dashboard: {
    client: ['pgso:client:dashboard-snapshot', v2('personnel', 'dashboard')],
    server: ['personnel:dashboard', 'personnel:dashboard-stats', 'personnel:ops-stats', 'super-admin:overview'],
    note: 'Dashboard snapshots converge via resource writes + 60s TTL.',
  },
  logs: {
    client: ['pgso:client:logs-list', v2('personnel', 'logs'), v2('personnel', 'logs-modules'), 'pgso:client:admin-logs-list', v2('super-admin', 'logs'), v2('super-admin', 'logs-modules')],
    server: ['personnel:my-logs', 'personnel:logs', 'super-admin:logs-page'],
    note: 'TTL-only (30s): audit writes fire on every mutation, so busting per write would thrash the cache; staleness is bounded by TTL.',
  },
  user: {
    client: ['pgso:client:admin-users-snapshot', v2('super-admin', 'users'), v2('super-admin', 'users-counts')],
    server: ['super-admin:pending-employees', 'super-admin:all-users', 'super-admin:users-page', 'super-admin:user-counts', 'super-admin:overview', 'personnel:dashboard-stats', 'personnel:dashboard'],
    note: 'User create/toggle/role/status busts roster pages + pending badges.',
  },
  'master-data': {
    client: ['pgso:client:asset-custom-fields', 'pgso:client:admin-master-data-snapshot', 'pgso:master-data', v2('super-admin', 'master-data')],
    server: ['super-admin:master-', 'super-admin:overview', 'master-data:', 'catalog:', 'personnel:asset-'],
    note: 'Catalog/unit/department CRUD busts lookups (persisted) + filter options.',
  },
  ppmp: {
    client: [],
    server: ['ppmp:'],
    note: 'PPMP file list is cached 30s scoped (own files vs all); busted on import + delete. Analysis status polling stays uncached by design.',
  },
}

export function invalidationFor(resource: string): InvalidationEntry | null {
  return INVALIDATION_MAP[resource] ?? null
}

export function clientPrefixesFor(resources: string[]): string[] {
  return [...new Set(resources.flatMap((r) => INVALIDATION_MAP[r]?.client ?? []))]
}

export function serverPrefixesFor(resources: string[]): string[] {
  return [...new Set(resources.flatMap((r) => INVALIDATION_MAP[r]?.server ?? []))]
}
