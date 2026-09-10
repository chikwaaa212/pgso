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
export async function getPublicIssues(): Promise<PublicIssueLine[]> {
  let rows: IssuanceDbRow[] = []
  try {
    // Own-data only for personnel; super_admin sees all.
    const scope = await getPersonnelScope()
    if (scope.isEmpty || !scope.userId) return []
    rows = scope.isSuperAdmin
      ? await prisma.$queryRaw<IssuanceDbRow[]>`
      SELECT id::text AS id, doc_type, doc_no, doc_date,
             asset_id::text AS asset_id, inventory_id::text AS inventory_id,
             employee_id::text AS employee_id, request_id::text AS request_id,
             quantity, issuance_data, created_at,
             created_by::text AS created_by
      FROM issuance_records ORDER BY created_at DESC`
      : await prisma.$queryRaw<IssuanceDbRow[]>`
      SELECT id::text AS id, doc_type, doc_no, doc_date,
             asset_id::text AS asset_id, inventory_id::text AS inventory_id,
             employee_id::text AS employee_id, request_id::text AS request_id,
             quantity, issuance_data, created_at,
             created_by::text AS created_by
      FROM issuance_records WHERE created_by = ${scope.userId}::uuid ORDER BY created_at DESC`
  } catch (e) {
    console.error('[getPublicIssues:list]', e)
    return []
  }
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

  const out: PublicIssueLine[] = []
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
        out.push({
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
          qr_data_url: await generateQrDataUrl(qr_payload, 120),
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
      out.push({
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
        qr_data_url: await generateQrDataUrl(qr_payload, 120),
        created_at,
      })
    }
  }
  return out
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
  try {
    const scope = await getPersonnelScope()
    if (scope.isEmpty || !scope.userId) return []
    const { getRequests } = await import('@/app/personnel/requests/actions')
    const all = await getRequests()
    const completed = all.filter((r) => (r.status ?? 'pending') === 'completed')
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
}
