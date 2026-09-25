'use server'

import prisma from '@/lib/prisma'
import { generateQrDataUrl } from '@/lib/qrcode'
import { getPersonnelScope } from '@/lib/personnel-scope'

// ─── Sanitized (non-sensitive) issue registry ────────────────────────────────
// Exposes ONLY: doc ref, receiving employee, account_code, article,
// account_title, asset_type, quantity + a QR code per issued line.
// Costs (unit_cost / total_amount / totals) are NEVER selected or returned.

interface IssuanceDbRow {
  id: string
  doc_type: string
  doc_no: string | null
  doc_date: Date | string | null
  asset_id: string | null
  inventory_id: string | null
  employee_id: string
  request_id: string | null
  quantity: number
  issuance_data: Record<string, unknown> | null
  created_at: Date | string | null
  created_by: string | null
}

interface StoredLine {
  label?: unknown
  description?: unknown
  quantity?: unknown
  unit?: unknown
  assetId?: unknown
  inventoryId?: unknown
}

export interface PublicIssueLine {
  /** issuance_records.id */
  issuance_id: string
  /** 0-based line index within the document (0 for single-line docs) */
  line_index: number
  /** lines in this document (1 for single-line docs) */
  line_count: number
  doc_type: string
  doc_no: string | null
  doc_date: string | null
  employee_name: string
  /** System user who processed the issuance (may differ from the recipient). */
  logged_by: string | null
  account_code: string | null
  article: string | null
  account_title: string | null
  asset_type: string | null
  quantity: number
  /** Exact string encoded in the QR (sanitized JSON, no costs). */
  qr_payload: string
  /** Scannable QR image (data URL). */
  qr_data_url: string
  created_at: string | null
}

function isoDate(v: Date | string | null): string | null {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(v)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

function isoDateTime(v: Date | string | null): string | null {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(v)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

function cleanStr(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s ? s : null
}

function lineQty(v: unknown, fallback: number): number {
  const n = Math.floor(Number(v))
  if (!Number.isFinite(n) || n < 1) return Math.max(1, Math.floor(Number(fallback)) || 1)
  return n
}

function qrPayloadFor(args: {
  issuance_id: string
  line_index: number
  doc_type: string
  doc_no: string | null
  doc_date: string | null
  employee: string
  account_code: string | null
  article: string | null
  account_title: string | null
  asset_type: string | null
  quantity: number
}): string {
  // Flat, short keys keep the QR dense and reliably scannable.
  // Deliberately NO cost / amount / supplier / account-number fields.
  return JSON.stringify({
    v: 1,
    kind: 'PGSO-ISSUE',
    ref: `${args.issuance_id}:${args.line_index}`,
    doc: args.doc_type,
    no: args.doc_no,
    date: args.doc_date,
    employee: args.employee,
    account_code: args.account_code,
    article: args.article,
    account_title: args.account_title,
    asset_type: args.asset_type,
    qty: args.quantity,
  })
}

/**
 * Every issued asset/stock line, sanitized for display + QR.
 * One row per LINE (a 3-line PAR yields 3 rows sharing doc_no/employee).
 * Missing table → [].
 */
export interface PublicIssuesPageOpts {
  page?: number
  pageSize?: number
  q?: string
  docType?: string
  assetType?: string
}

/** Distinct asset-type options for the issues filter dropdown (bounded). */
export async function getIssueFilterOptions(): Promise<string[]> {
  const { withCache, cacheKey } = await import('@/lib/personnel-cache')
  return withCache(cacheKey('personnel:issue-filter-options'), 300, async () => {
    try {
      const [a, s] = await Promise.all([
        prisma.$queryRaw<Array<{ category: string | null }>>`
          SELECT DISTINCT category FROM assets WHERE category IS NOT NULL ORDER BY 1 LIMIT 200`
          .catch(() => []),
        prisma.$queryRaw<Array<{ category: string | null }>>`
          SELECT DISTINCT category FROM inventory WHERE category IS NOT NULL ORDER BY 1 LIMIT 200`
          .catch(() => []),
      ])
      const set = new Map<string, string>()
      for (const r of [...a, ...s]) {
        const raw = (r.category ?? '').trim()
        if (raw && !set.has(raw.toLowerCase())) set.set(raw.toLowerCase(), raw)
      }
      return [...set.values()].sort((x, y) => x.localeCompare(y))
    } catch (e) {
      console.error('[getIssueFilterOptions]', e)
      return []
    }
  })
}

export async function getPublicIssues(): Promise<PublicIssueLine[]> {
  const { rows } = await getPublicIssuesPage({ page: 1, pageSize: 200 })
  return rows
}

/**
 * Paged issuance documents (fixed 20/page): the DB returns only the doc
 * window — line expansion + QR generation run on the window, not the whole
 * registry. `total` counts documents (one doc may expand to several lines).
 */
export async function getPublicIssuesPage(
  opts: PublicIssuesPageOpts = {}
): Promise<{ rows: PublicIssueLine[]; total: number }> {
  const { withScopedCache } = await import('@/lib/personnel-cache')
  const page = Math.floor(Number(opts.page)) >= 1 ? Math.min(Math.floor(Number(opts.page)), 1000) : 1
  // Personnel UI always sends 20; compat callers (snapshots, admin browse)
  // may request up to 200 per window.
  const pageSize = Number.isFinite(Number(opts.pageSize))
    ? Math.min(Math.max(Math.floor(Number(opts.pageSize)), 1), 200)
    : 20
  const q = (opts.q ?? '').trim().slice(0, 120)
  const docType = (opts.docType ?? 'all').trim().toUpperCase()
  const assetType = (opts.assetType ?? 'all').trim()
  return withScopedCache('personnel:public-issues', 60, async () => {
  try {
    // Own-data only for personnel; super_admin sees all.
    const scope = await getPersonnelScope()
    if (scope.isEmpty || !scope.userId) return { rows: [], total: 0 }
    const { Prisma } = await import('@prisma/client')
    const me = scope.userId
    const like = q ? `%${q}%` : null
    const typeFilter = docType !== 'ALL' ? docType : null
    // Filterable joins: employee name + single-FK item labels participate
    // in text search (multi-line JSONB items are matched client-side only).
    const conds: InstanceType<typeof Prisma.Sql>[] = []
    if (!scope.isSuperAdmin) conds.push(Prisma.sql`ir.created_by = ${me}::uuid`)
    if (typeFilter) conds.push(Prisma.sql`ir.doc_type = ${typeFilter}`)
    if (assetType !== 'all') {
      // Single-FK lines match exactly; multi-line JSONB items are expanded
      // after fetch and filtered client-side on the window.
      conds.push(Prisma.sql`(a.category = ${assetType} OR s.category = ${assetType})`)
    }
    if (like) {
      conds.push(Prisma.sql`(
        ir.doc_no ILIKE ${like} OR ir.doc_type ILIKE ${like}
        OR p.full_name ILIKE ${like} OR lb.full_name ILIKE ${like}
        OR a.article ILIKE ${like} OR a.account_code ILIKE ${like}
        OR a.account_title ILIKE ${like}
        OR s.item_name ILIKE ${like} OR s.account_code ILIKE ${like}
        OR a.category ILIKE ${like} OR s.category ILIKE ${like}
      )`)
    }
    const whereClause = conds.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conds, ' AND ')}` : Prisma.empty
    const offset = (page - 1) * pageSize
    const [countRows, idRows] = await Promise.all([
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(DISTINCT ir.id)::bigint AS count FROM issuance_records ir
        LEFT JOIN profiles p ON p.id = ir.employee_id
        LEFT JOIN profiles lb ON lb.id = ir.created_by
        LEFT JOIN assets a ON a.id = ir.asset_id
        LEFT JOIN inventory s ON s.id = ir.inventory_id
        ${whereClause}`,
      prisma.$queryRaw<Array<{ id: string }>>`
        SELECT ir.id::text AS id FROM issuance_records ir
        LEFT JOIN profiles p ON p.id = ir.employee_id
        LEFT JOIN profiles lb ON lb.id = ir.created_by
        LEFT JOIN assets a ON a.id = ir.asset_id
        LEFT JOIN inventory s ON s.id = ir.inventory_id
        ${whereClause}
        ORDER BY ir.created_at DESC LIMIT ${pageSize} OFFSET ${offset}`,
    ])
    const total = Number(countRows[0]?.count ?? 0)
    if (idRows.length === 0) return { rows: [], total }
    const ids = idRows.map((r) => r.id)
    const rows = await prisma.$queryRaw<IssuanceDbRow[]>`
      SELECT id::text AS id, doc_type, doc_no, doc_date,
             asset_id::text AS asset_id, inventory_id::text AS inventory_id,
             employee_id::text AS employee_id, request_id::text AS request_id,
             quantity, issuance_data, created_at,
             created_by::text AS created_by
      FROM issuance_records WHERE id = ANY(${ids}::uuid[])`
    // Preserve newest-first order within the window.
    const order = new Map(ids.map((id, i) => [id, i]))
    rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    let lines = await buildIssueLines(rows)
    // Multi-line JSONB items aren't visible to the joined category filter —
    // apply the exact type match on the expanded window as well.
    if (assetType !== 'all') {
      lines = lines.filter((l) => (l.asset_type ?? '').trim().toLowerCase() === assetType.toLowerCase())
    }
    return { rows: lines, total }
  } catch (e) {
    console.error('[getPublicIssues:list]', e)
    return { rows: [], total: 0 }
  }
  }, { page, pageSize, q, docType, assetType })
}

/** Expands issuance docs to sanitized per-line rows with QR (window-sized). */
async function buildIssueLines(rows: IssuanceDbRow[]): Promise<PublicIssueLine[]> {
  if (rows.length === 0) return []

  // Employee names (receiving employee per issue) + issuers (logged by).
  const names = new Map<string, string>()
  try {
    const ids = [
      ...new Set([
        ...rows.map((r) => r.employee_id),
        ...rows.map((r) => r.created_by).filter((v): v is string => Boolean(v)),
      ]),
    ]
    const profiles = await prisma.profile.findMany({
      where: { id: { in: ids } },
      select: { id: true, full_name: true },
    })
    for (const p of profiles) names.set(p.id, p.full_name ?? 'Unknown employee')
  } catch {
    /* names stay empty → fallback below */
  }

  // Collect every asset/stock id referenced (single-FK + multi-line).
  const assetIds = new Set<string>()
  const stockIds = new Set<string>()
  const parsedLines = new Map<string, StoredLine[]>()
  for (const r of rows) {
    if (r.asset_id) assetIds.add(r.asset_id)
    if (r.inventory_id) stockIds.add(r.inventory_id)
    try {
      const lines = (r.issuance_data as { lines?: unknown } | null)?.lines
      if (Array.isArray(lines) && lines.length > 0) {
        const kept = lines as StoredLine[]
        parsedLines.set(r.id, kept)
        for (const l of kept) {
          if (typeof l?.assetId === 'string' && l.assetId) assetIds.add(l.assetId)
          if (typeof l?.inventoryId === 'string' && l.inventoryId) stockIds.add(l.inventoryId)
        }
      }
    } catch {
      /* treat as single-line */
    }
  }

  // Sanitized snapshots only — no cost columns selected, ever.
  const assetMap = new Map<
    string,
    { account_code: string | null; article: string | null; account_title: string | null; category: string | null }
  >()
  const stockMap = new Map<
    string,
    { account_code: string | null; item_name: string; category: string | null }
  >()
  try {
    const [assets, stocks] = await Promise.all([
      assetIds.size > 0
        ? prisma.asset.findMany({
            where: { id: { in: [...assetIds] } },
            select: { id: true, account_code: true, article: true, account_title: true, category: true },
          })
        : Promise.resolve([]),
      stockIds.size > 0
        ? prisma.inventoryItem.findMany({
            where: { id: { in: [...stockIds] } },
            select: { id: true, account_code: true, item_name: true, category: true },
          })
        : Promise.resolve([]),
    ])
    for (const a of assets) assetMap.set(a.id, a)
    for (const s of stocks) stockMap.set(s.id, s)
  } catch (e) {
    console.error('[getPublicIssues:snapshots]', e)
  }

  // Fallback label when the source item was deleted: "description/label".
  const fallbackArticle = (r: IssuanceDbRow, line?: StoredLine): string | null => {
    const d = cleanStr((r.issuance_data as Record<string, unknown> | null)?.description)
    if (d) return d.slice(0, 80)
    const l = cleanStr(line?.description) ?? cleanStr(line?.label)
    return l ? l.slice(0, 80) : null
  }

  // Build rows without QR first, then generate all QR data URLs
  // concurrently (was serial `await` per line, blocking the whole list).
  const pending: Omit<PublicIssueLine, 'qr_data_url'>[] = []
  for (const r of rows) {
    const employee = names.get(r.employee_id) ?? 'Unknown employee'
    const loggedBy = (r.created_by ? names.get(r.created_by) : undefined) ?? null
    const doc_date = isoDate(r.doc_date)
    const created_at = isoDateTime(r.created_at)
    const multi = parsedLines.get(r.id)

    if (multi && multi.length > 0) {
      for (let i = 0; i < multi.length; i++) {
        const l = multi[i] ?? {}
        const assetId = typeof l.assetId === 'string' ? l.assetId : null
        const inventoryId = typeof l.inventoryId === 'string' ? l.inventoryId : null
        // A bare assetId may point at either table (assets win).
        const asset = assetId ? (assetMap.get(assetId) ?? null) : null
        const stock = inventoryId
          ? (stockMap.get(inventoryId) ?? null)
          : assetId
            ? (stockMap.get(assetId) ?? null)
            : null
        const account_code = asset?.account_code ?? stock?.account_code ?? null
        const article = asset?.article ?? stock?.item_name ?? fallbackArticle(r, l)
        const account_title = asset?.account_title ?? null
        const asset_type = asset?.category ?? stock?.category ?? null
        const quantity = lineQty(l.quantity, r.quantity)
        const qr_payload = qrPayloadFor({
          issuance_id: r.id,
          line_index: i,
          doc_type: r.doc_type,
          doc_no: r.doc_no,
          doc_date: doc_date,
          employee,
          account_code,
          article,
          account_title,
          asset_type,
          quantity,
        })
        pending.push({
          issuance_id: r.id,
          line_index: i,
          line_count: multi.length,
          doc_type: r.doc_type,
          doc_no: r.doc_no,
          doc_date: doc_date,
          employee_name: employee,
          logged_by: loggedBy,
          account_code,
          article,
          account_title,
          asset_type,
          quantity,
          qr_payload,
          created_at,
        })
      }
    } else {
      const asset = r.asset_id ? (assetMap.get(r.asset_id) ?? null) : null
      const stock = r.inventory_id
        ? (stockMap.get(r.inventory_id) ?? null)
        : r.asset_id
          ? (stockMap.get(r.asset_id) ?? null)
          : null
      const account_code = asset?.account_code ?? stock?.account_code ?? null
      const article = asset?.article ?? stock?.item_name ?? fallbackArticle(r)
      const account_title = asset?.account_title ?? null
      const asset_type = asset?.category ?? stock?.category ?? null
      const quantity = lineQty(r.quantity, 1)
      const qr_payload = qrPayloadFor({
        issuance_id: r.id,
        line_index: 0,
        doc_type: r.doc_type,
        doc_no: r.doc_no,
        doc_date: doc_date,
        employee,
        account_code,
        article,
        account_title,
        asset_type,
        quantity,
      })
      pending.push({
        issuance_id: r.id,
        line_index: 0,
        line_count: 1,
        doc_type: r.doc_type,
        doc_no: r.doc_no,
        doc_date: doc_date,
        employee_name: employee,
        logged_by: loggedBy,
        account_code,
        article,
        account_title,
        asset_type,
        quantity,
        qr_payload,
        created_at,
      })
    }
  }
  const qrUrls = await Promise.all(
    pending.map((p) => generateQrDataUrl(p.qr_payload, 120).catch(() => ''))
  )
  return pending.map((p, i) => ({ ...p, qr_data_url: qrUrls[i] ?? '' }))
}

// ─── Completed requests as QR records ────────────────────────────────────────
// Every request that reaches `completed` (transfer / assignment / repair /
// stock replenishment, asset or stock lot) also lives in the Issues QR store.
// Scope: personnel see only requests they actioned (recipient = me, legacy
// NULL, or an approve/complete audit entry under their id); super_admin sees
// all — same rule as the issuance lines above.

export type { RequestRow as CompletedRequestIssue } from '@/app/personnel/requests/actions'

export async function getCompletedRequestIssues(): Promise<
  import('@/app/personnel/requests/actions').RequestRow[]
> {
  const { withScopedCache } = await import('@/lib/personnel-cache')
  return withScopedCache('personnel:completed-request-issues', 60, async () => {
  try {
    const scope = await getPersonnelScope()
    if (scope.isEmpty || !scope.userId) return []
    const { getRequestsPage } = await import('@/app/personnel/requests/actions')
    // Server-filtered completed rows (was full-queue download + JS filter).
    const { rows: completed } = await getRequestsPage({
      forRecipient: scope.isSuperAdmin ? false : false,
      page: 1,
      pageSize: 500,
      status: 'completed',
    })
    if (scope.isSuperAdmin) return completed
    const me = scope.userId
    // Requests this personnel actioned: approve/complete audit entries.
    let acted = new Set<string>()
    try {
      const rows = await prisma.$queryRaw<Array<{ ref: string | null }>>`
        SELECT details->>'reference_id' AS ref FROM audit_logs
        WHERE user_id = ${me}::uuid
          AND action IN ('request:approved', 'request:completed')`
      acted = new Set(
        rows.map((r) => r.ref).filter((v): v is string => !!v)
      )
    } catch {
      acted = new Set()
    }
    return completed.filter(
      (r) =>
        r.recipient_id === me || r.recipient_id == null || acted.has(r.id)
    )
  } catch (e) {
    console.error('[getCompletedRequestIssues]', e)
    return []
  }
  })
}

export interface IssuesSnapshot {
  rows: PublicIssueLine[]
  completed: import('@/app/personnel/requests/actions').RequestRow[]
}

/**
 * Single round-trip for the issues page (issued lines + completed
 * requests), cached client-side under CLIENT_CACHE_KEYS.issues like the
 * dashboard / deliveries / inspections / stocks / assets / documents pages.
 */
export async function getIssuesSnapshot(): Promise<IssuesSnapshot> {
  const [rows, completed] = await Promise.all([
    getPublicIssues(),
    getCompletedRequestIssues(),
  ])
  return { rows, completed }
}
