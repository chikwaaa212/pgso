import 'server-only'

import prisma from '@/lib/prisma'
import { getPersonnelScope } from '@/lib/personnel-scope'
import { withScopedCache } from '@/lib/personnel-cache'
import { parsePage, pageResponse, type PagedResult } from '@/lib/paged'
import { PAGE_SIZE } from '@/lib/constants'
import {
  AGING_BUCKETS,
  DELAYED_THRESHOLD_DAYS,
  REPORT_MODULES,
  agingBucket,
  classifyCondition,
  conditionLabel,
  lastQuarters,
  normalizeCondition,
  parseAgingBucket,
  parseReportModule,
  parseReportYear,
  percentage,
  quarterKey,
  quarterLabel,
  quartersForYear,
  type AgingBucket,
  type ConditionClass,
  type Quarter,
  type QuarterRef,
  type ReportModule,
} from '@/lib/reporting'

export type ReportPortal = 'personnel' | 'super-admin'

const REPORT_TTL = 60

// ─── Aging ─────────────────────────────────────────────────────────────────

export interface AgingBucketCount {
  bucket: AgingBucket
  label: string
  count: number
  delayed: boolean
}

export interface AgingModuleSummary {
  module: ReportModule
  label: string
  href: string
  total: number
  delayed: number
  oldestDays: number
  buckets: AgingBucketCount[]
}

export interface AgingRow {
  id: string
  module: ReportModule
  moduleLabel: string
  reference: string
  subject: string
  owner: string
  status: string | null
  openedAt: string | null
  ageDays: number
  bucket: AgingBucket
  delayed: boolean
  href: string
}

export interface AgingReport {
  generatedAt: string
  thresholdDays: number
  module: ReportModule | 'all'
  bucket: AgingBucket | 'all'
  summaries: AgingModuleSummary[]
  rows: PagedResult<AgingRow>
}

interface AgingAggregateRow {
  module: ReportModule
  total: bigint
  delayed: bigint
  oldest: number
  b0: bigint
  b1: bigint
  b2: bigint
  b3: bigint
}

interface AgingDbRow {
  module: ReportModule
  id: string
  reference: string | null
  subject: string | null
  owner: string | null
  status: string | null
  opened_at: Date | string | null
  age_days: number
  total_count: bigint
}

function portalBase(portal: ReportPortal): string {
  return portal === 'super-admin' ? '/super-admin' : '/personnel'
}

function moduleMeta(module: ReportModule, portal: ReportPortal) {
  const base = portalBase(portal)
  if (module === 'inspections') {
    return { label: 'Pending inspections', href: `${base}/inspections` }
  }
  if (module === 'requests') {
    return { label: 'Pending requests', href: `${base}/requests` }
  }
  return { label: 'Open repairs', href: `${base}/repairs` }
}

function toIso(value: Date | string | null): string | null {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function emptySummaries(portal: ReportPortal): AgingModuleSummary[] {
  return REPORT_MODULES.map((m) => ({
    module: m.key,
    label: moduleMeta(m.key, portal).label,
    href: moduleMeta(m.key, portal).href,
    total: 0,
    delayed: 0,
    oldestDays: 0,
    buckets: AGING_BUCKETS.map((b) => ({
      bucket: b.key,
      label: b.label,
      count: 0,
      delayed: b.min > DELAYED_THRESHOLD_DAYS,
    })),
  }))
}

/**
 * Rolling aging summary for all three workflows plus a paged, filterable
 * delayed-records table. Personnel see their own queue; super admin sees all.
 */
export async function getAgingReport(opts: {
  portal?: ReportPortal
  module?: unknown
  bucket?: unknown
  page?: unknown
  pageSize?: number
} = {}): Promise<AgingReport> {
  const portal = opts.portal ?? 'personnel'
  const moduleFilter =
    opts.module === 'inspections' ||
    opts.module === 'requests' ||
    opts.module === 'repairs'
      ? parseReportModule(opts.module)
      : 'all'
  const bucket = parseAgingBucket(opts.bucket)
  const page = parsePage(opts.page)
  const pageSize = Math.max(1, Math.min(100, Math.floor(opts.pageSize ?? PAGE_SIZE)))

  const scope = await getPersonnelScope()
  const generatedAt = new Date().toISOString()
  if (scope.isEmpty || !scope.userId) {
    return {
      generatedAt,
      thresholdDays: DELAYED_THRESHOLD_DAYS,
      module: moduleFilter,
      bucket,
      summaries: emptySummaries(portal),
      rows: pageResponse([], 0, page, pageSize),
    }
  }

  const isSuperAdmin = scope.isSuperAdmin
  const me = scope.userId

  return withScopedCache(
    'personnel:reports:aging',
    REPORT_TTL,
    async () => {
      try {
        const [aggregates, detail] = await Promise.all([
          prisma.$queryRaw<AgingAggregateRow[]>`
            WITH base AS (
              SELECT 'inspections'::text AS module,
                     COALESCE(d.created_at, now()) AS opened_at,
                     (
                       d.received_by = ${me}::uuid
                       OR EXISTS (
                         SELECT 1 FROM inspections i
                         WHERE i.delivery_id = d.id
                           AND i.inspector_id = ${me}::uuid
                       )
                     ) AS owned
              FROM deliveries d
              WHERE d.inspection_status = 'pending'
              UNION ALL
              SELECT 'requests'::text AS module,
                     COALESCE(r.date_requested, now()) AS opened_at,
                     (r.recipient_id = ${me}::uuid) AS owned
              FROM requests r
              WHERE r.status = 'pending'
              UNION ALL
              SELECT 'repairs'::text AS module,
                     COALESCE(rp.created_at, now()) AS opened_at,
                     (rp.created_by = ${me}::uuid) AS owned
              FROM repairs rp
              WHERE rp.status IN ('pending', 'in_progress')
            ),
            aged AS (
              SELECT module,
                     GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - opened_at)) / 86400))::int AS age_days
              FROM base
              WHERE (${isSuperAdmin}::boolean OR owned)
            )
            SELECT module,
                   COUNT(*)::bigint AS total,
                   COUNT(*) FILTER (WHERE age_days > ${DELAYED_THRESHOLD_DAYS})::bigint AS delayed,
                   COALESCE(MAX(age_days), 0)::int AS oldest,
                   COUNT(*) FILTER (WHERE age_days <= 3)::bigint AS b0,
                   COUNT(*) FILTER (WHERE age_days BETWEEN 4 AND 7)::bigint AS b1,
                   COUNT(*) FILTER (WHERE age_days BETWEEN 8 AND 14)::bigint AS b2,
                   COUNT(*) FILTER (WHERE age_days >= 15)::bigint AS b3
            FROM aged
            GROUP BY module
          `.catch(() => [] as AgingAggregateRow[]),
          prisma.$queryRaw<AgingDbRow[]>`
            WITH base AS (
              SELECT 'inspections'::text AS module,
                     d.id::text AS id,
                     COALESCE(NULLIF(d.po_reference, ''), NULLIF(d.supplier, ''), d.id::text) AS reference,
                     COALESCE(NULLIF(d.supplier, ''), 'Delivery') AS subject,
                     COALESCE(NULLIF(d.recipient_name, ''), NULLIF(p.full_name, ''), 'Unassigned') AS owner,
                     d.inspection_status AS status,
                     COALESCE(d.created_at, now()) AS opened_at,
                     (
                       d.received_by = ${me}::uuid
                       OR EXISTS (
                         SELECT 1 FROM inspections i
                         WHERE i.delivery_id = d.id
                           AND i.inspector_id = ${me}::uuid
                       )
                     ) AS owned
              FROM deliveries d
              LEFT JOIN profiles p ON p.id = d.received_by
              WHERE d.inspection_status = 'pending'
              UNION ALL
              SELECT 'requests'::text AS module,
                     r.id::text AS id,
                     COALESCE(NULLIF(r.request_type, ''), 'Request') AS reference,
                     COALESCE(NULLIF(r.description, ''), 'Request') AS subject,
                     COALESCE(NULLIF(p.full_name, ''), 'Unassigned') AS owner,
                     r.status AS status,
                     COALESCE(r.date_requested, now()) AS opened_at,
                     (r.recipient_id = ${me}::uuid) AS owned
              FROM requests r
              LEFT JOIN profiles p ON p.id = r.employee_id
              WHERE r.status = 'pending'
              UNION ALL
              SELECT 'repairs'::text AS module,
                     rp.id::text AS id,
                     COALESCE(NULLIF(a.property_number, ''), rp.id::text) AS reference,
                     COALESCE(NULLIF(a.description, ''), NULLIF(rp.description, ''), 'Repair ticket') AS subject,
                     COALESCE(NULLIF(p.full_name, ''), 'Unassigned') AS owner,
                     rp.status AS status,
                     COALESCE(rp.created_at, now()) AS opened_at,
                     (rp.created_by = ${me}::uuid) AS owned
              FROM repairs rp
              LEFT JOIN assets a ON a.id = rp.asset_id
              LEFT JOIN profiles p ON p.id = rp.created_by
              WHERE rp.status IN ('pending', 'in_progress')
            ),
            aged AS (
              SELECT *,
                     GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - opened_at)) / 86400))::int AS age_days
              FROM base
              WHERE (${isSuperAdmin}::boolean OR owned)
                AND (${moduleFilter}::text = 'all' OR module = ${moduleFilter})
            )
            SELECT module, id, reference, subject, owner, status, opened_at, age_days,
                   COUNT(*) OVER()::bigint AS total_count
            FROM aged
            WHERE (
              ${bucket}::text = 'all'
              OR (${bucket}::text = '0-3' AND age_days <= 3)
              OR (${bucket}::text = '4-7' AND age_days BETWEEN 4 AND 7)
              OR (${bucket}::text = '8-14' AND age_days BETWEEN 8 AND 14)
              OR (${bucket}::text = '15+' AND age_days >= 15)
            )
            ORDER BY age_days DESC, opened_at ASC
            LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
          `.catch(() => [] as AgingDbRow[]),
        ])

        const byModule = new Map<ReportModule, AgingAggregateRow>()
        for (const row of aggregates) byModule.set(row.module, row)

        const summaries: AgingModuleSummary[] = REPORT_MODULES.map((m) => {
          const row = byModule.get(m.key)
          const meta = moduleMeta(m.key, portal)
          const counts = [row?.b0 ?? 0, row?.b1 ?? 0, row?.b2 ?? 0, row?.b3 ?? 0]
          return {
            module: m.key,
            label: meta.label,
            href: meta.href,
            total: Number(row?.total ?? 0),
            delayed: Number(row?.delayed ?? 0),
            oldestDays: Number(row?.oldest ?? 0),
            buckets: AGING_BUCKETS.map((b, i) => ({
              bucket: b.key,
              label: b.label,
              count: Number(counts[i] ?? 0),
              delayed: b.min > DELAYED_THRESHOLD_DAYS,
            })),
          }
        })

        const total = detail.length > 0 ? Number(detail[0].total_count ?? 0) : 0
        const rows: AgingRow[] = detail.map((r) => {
          const meta = moduleMeta(r.module, portal)
          const ageDays = Number(r.age_days ?? 0)
          return {
            id: r.id,
            module: r.module,
            moduleLabel: meta.label,
            reference: r.reference ?? '',
            subject: r.subject ?? '',
            owner: r.owner ?? 'Unassigned',
            status: r.status,
            openedAt: toIso(r.opened_at),
            ageDays,
            bucket: agingBucket(ageDays),
            delayed: ageDays > DELAYED_THRESHOLD_DAYS,
            href: meta.href,
          }
        })

        return {
          generatedAt,
          thresholdDays: DELAYED_THRESHOLD_DAYS,
          module: moduleFilter,
          bucket,
          summaries,
          rows: pageResponse(rows, total, page, pageSize),
        }
      } catch (e) {
        console.error('[getAgingReport]', e)
        return {
          generatedAt,
          thresholdDays: DELAYED_THRESHOLD_DAYS,
          module: moduleFilter,
          bucket,
          summaries: emptySummaries(portal),
          rows: pageResponse([], 0, page, pageSize),
        }
      }
    },
    { module: moduleFilter, bucket, page, pageSize, portal }
  )
}

// ─── Quarterly issuance ────────────────────────────────────────────────────

export interface QuarterTotals {
  documents: number
  par: number
  ics: number
  others: number
  quantity: number
  amount: number
}

export interface QuarterSummary extends QuarterTotals {
  year: number
  quarter: Quarter
  key: string
  label: string
}

export interface GroupBreakdown {
  name: string
  documents: number
  quantity: number
  amount: number
}

export interface ItemBreakdown {
  name: string
  lines: number
  quantity: number
  amount: number
}

export interface QuarterlyIssuanceReport {
  generatedAt: string
  year: number
  availableYears: number[]
  quarters: QuarterSummary[]
  totals: QuarterTotals
  trend: QuarterSummary[]
  topItems: ItemBreakdown[]
  byOffice: GroupBreakdown[]
  byEmployee: GroupBreakdown[]
}

interface QuarterAggRow {
  year: number
  quarter: number
  documents: bigint
  par: bigint
  ics: bigint
  quantity: bigint
  amount: unknown
}

interface GroupBreakdownRow {
  name: string | null
  documents: bigint
  quantity: bigint
  amount: unknown
}

interface ItemBreakdownRow {
  name: string | null
  lines: bigint
  quantity: unknown
  amount: unknown
}

interface YearRow {
  year: number
}

function num(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value ?? 0)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}

function emptyQuarter(ref: QuarterRef): QuarterSummary {
  return {
    year: ref.year,
    quarter: ref.quarter,
    key: quarterKey(ref),
    label: quarterLabel(ref),
    documents: 0,
    par: 0,
    ics: 0,
    others: 0,
    quantity: 0,
    amount: 0,
  }
}

function mapQuarter(row: QuarterAggRow): QuarterSummary {
  const par = Number(row.par ?? 0)
  const ics = Number(row.ics ?? 0)
  const documents = Number(row.documents ?? 0)
  return {
    year: Number(row.year),
    quarter: row.quarter as Quarter,
    key: quarterKey({ year: Number(row.year), quarter: row.quarter as Quarter }),
    label: quarterLabel({ year: Number(row.year), quarter: row.quarter as Quarter }),
    documents,
    par,
    ics,
    others: Math.max(0, documents - par - ics),
    quantity: Number(row.quantity ?? 0),
    amount: num(row.amount),
  }
}

function sumQuarters(quarters: QuarterSummary[]): QuarterTotals {
  return quarters.reduce<QuarterTotals>(
    (acc, q) => ({
      documents: acc.documents + q.documents,
      par: acc.par + q.par,
      ics: acc.ics + q.ics,
      others: acc.others + q.others,
      quantity: acc.quantity + q.quantity,
      amount: Math.round((acc.amount + q.amount) * 100) / 100,
    }),
    { documents: 0, par: 0, ics: 0, others: 0, quantity: 0, amount: 0 }
  )
}

/**
 * Quarter bounds as `YYYY-MM-DD` strings. Passing strings (not local `Date`
 * objects) keeps the SQL boundary independent of the Node/Postgres timezone,
 * so a report run near midnight in Asia/Manila can never leak a day from the
 * neighbouring quarter.
 */
function quarterDateBounds(refs: QuarterRef[]): { start: string; end: string } {
  const pad = (n: number) => String(n).padStart(2, '0')
  const first = refs[0]
  const last = refs[refs.length - 1]
  const start = `${first.year}-${pad((first.quarter - 1) * 3 + 1)}-01`
  const endMonth = last.quarter * 3
  const endYear = endMonth === 12 ? last.year + 1 : last.year
  const end = `${endYear}-${pad((endMonth % 12) + 1)}-01`
  return { start, end }
}

/**
 * Calendar-quarter issuance report for one year, with a rolling 8-quarter
 * trend plus item/office/employee breakdowns. Multi-line consolidated
 * documents count once in the summary and per line in the item table.
 */
export async function getQuarterlyIssuanceReport(opts: {
  year?: unknown
} = {}): Promise<QuarterlyIssuanceReport> {
  const year = parseReportYear(opts.year)
  const generatedAt = new Date().toISOString()
  const trendRefs = lastQuarters(8)
  const scope = await getPersonnelScope()

  const empty: QuarterlyIssuanceReport = {
    generatedAt,
    year,
    availableYears: [year],
    quarters: quartersForYear(year).map(emptyQuarter),
    totals: sumQuarters([]),
    trend: trendRefs.map(emptyQuarter),
    topItems: [],
    byOffice: [],
    byEmployee: [],
  }
  if (scope.isEmpty || !scope.userId) return empty

  const isSuperAdmin = scope.isSuperAdmin
  const me = scope.userId
  const trendBounds = quarterDateBounds(trendRefs)

  return withScopedCache(
    'personnel:reports:quarterly',
    REPORT_TTL,
    async () => {
      try {
        const [yearRows, trendRows, itemRows, officeRows, employeeRows, years] =
          await Promise.all([
            prisma.$queryRaw<QuarterAggRow[]>`
              WITH base AS (
                SELECT COALESCE(ir.doc_date, (ir.created_at AT TIME ZONE 'Asia/Manila')::date) AS issued_on,
                       UPPER(ir.doc_type) AS doc_type,
                       ir.quantity,
                       COALESCE(ir.total_amount, 0) AS amount
                FROM issuance_records ir
                WHERE (${isSuperAdmin}::boolean OR ir.created_by = ${me}::uuid)
                  AND EXTRACT(YEAR FROM COALESCE(ir.doc_date, (ir.created_at AT TIME ZONE 'Asia/Manila')::date)) = ${year}
              )
              SELECT EXTRACT(YEAR FROM issued_on)::int AS year,
                     EXTRACT(QUARTER FROM issued_on)::int AS quarter,
                     COUNT(*)::bigint AS documents,
                     COUNT(*) FILTER (WHERE doc_type = 'PAR')::bigint AS par,
                     COUNT(*) FILTER (WHERE doc_type = 'ICS')::bigint AS ics,
                     COALESCE(SUM(quantity), 0)::bigint AS quantity,
                     COALESCE(SUM(amount), 0)::numeric AS amount
              FROM base
              GROUP BY 1, 2
              ORDER BY 2
            `.catch(() => [] as QuarterAggRow[]),
            prisma.$queryRaw<QuarterAggRow[]>`
              WITH base AS (
                SELECT COALESCE(ir.doc_date, (ir.created_at AT TIME ZONE 'Asia/Manila')::date) AS issued_on,
                       UPPER(ir.doc_type) AS doc_type,
                       ir.quantity,
                       COALESCE(ir.total_amount, 0) AS amount
                FROM issuance_records ir
                WHERE (${isSuperAdmin}::boolean OR ir.created_by = ${me}::uuid)
                  AND COALESCE(ir.doc_date, (ir.created_at AT TIME ZONE 'Asia/Manila')::date) >= ${trendBounds.start}::date
                  AND COALESCE(ir.doc_date, (ir.created_at AT TIME ZONE 'Asia/Manila')::date) < ${trendBounds.end}::date
              )
              SELECT EXTRACT(YEAR FROM issued_on)::int AS year,
                     EXTRACT(QUARTER FROM issued_on)::int AS quarter,
                     COUNT(*)::bigint AS documents,
                     COUNT(*) FILTER (WHERE doc_type = 'PAR')::bigint AS par,
                     COUNT(*) FILTER (WHERE doc_type = 'ICS')::bigint AS ics,
                     COALESCE(SUM(quantity), 0)::bigint AS quantity,
                     COALESCE(SUM(amount), 0)::numeric AS amount
              FROM base
              GROUP BY 1, 2
              ORDER BY 1, 2
            `.catch(() => [] as QuarterAggRow[]),
            prisma.$queryRaw<ItemBreakdownRow[]>`
              WITH base AS (
                SELECT ir.quantity,
                       COALESCE(ir.total_amount, 0) AS amount,
                       ir.issuance_data
                FROM issuance_records ir
                WHERE (${isSuperAdmin}::boolean OR ir.created_by = ${me}::uuid)
                  AND EXTRACT(YEAR FROM COALESCE(ir.doc_date, (ir.created_at AT TIME ZONE 'Asia/Manila')::date)) = ${year}
              ),
              items AS (
                SELECT COALESCE(
                         NULLIF(TRIM(line->>'label'), ''),
                         NULLIF(TRIM(line->>'description'), ''),
                         'Unspecified'
                       ) AS name,
                       CASE WHEN (line->>'quantity') ~ '^[0-9]+(\.[0-9]+)?$'
                            THEN (line->>'quantity')::numeric ELSE 1 END AS quantity,
                       CASE WHEN (line->>'total') ~ '^[0-9]+(\.[0-9]+)?$'
                            THEN (line->>'total')::numeric ELSE 0 END AS amount
                FROM base b,
                     LATERAL jsonb_array_elements(
                       CASE WHEN jsonb_typeof(b.issuance_data->'lines') = 'array'
                            THEN b.issuance_data->'lines' ELSE '[]'::jsonb END
                     ) line
                UNION ALL
                SELECT COALESCE(NULLIF(TRIM(b.issuance_data->>'description'), ''), 'Unspecified'),
                       b.quantity::numeric,
                       b.amount
                FROM base b
                WHERE jsonb_typeof(b.issuance_data->'lines') IS DISTINCT FROM 'array'
                   OR jsonb_array_length(
                        CASE WHEN jsonb_typeof(b.issuance_data->'lines') = 'array'
                             THEN b.issuance_data->'lines' ELSE '[]'::jsonb END
                      ) = 0
              )
              SELECT name,
                     COUNT(*)::bigint AS lines,
                     COALESCE(SUM(quantity), 0)::numeric AS quantity,
                     COALESCE(SUM(amount), 0)::numeric AS amount
              FROM items
              GROUP BY name
              ORDER BY amount DESC, quantity DESC, name
              LIMIT 15
            `.catch(() => [] as ItemBreakdownRow[]),
            prisma.$queryRaw<GroupBreakdownRow[]>`
              SELECT COALESCE(NULLIF(TRIM(p.office), ''), 'Unspecified') AS name,
                     COUNT(*)::bigint AS documents,
                     COALESCE(SUM(ir.quantity), 0)::bigint AS quantity,
                     COALESCE(SUM(COALESCE(ir.total_amount, 0)), 0)::numeric AS amount
              FROM issuance_records ir
              LEFT JOIN profiles p ON p.id = ir.employee_id
              WHERE (${isSuperAdmin}::boolean OR ir.created_by = ${me}::uuid)
                AND EXTRACT(YEAR FROM COALESCE(ir.doc_date, (ir.created_at AT TIME ZONE 'Asia/Manila')::date)) = ${year}
              GROUP BY 1
              ORDER BY documents DESC, amount DESC
              LIMIT 15
            `.catch(() => [] as GroupBreakdownRow[]),
            prisma.$queryRaw<GroupBreakdownRow[]>`
              SELECT COALESCE(NULLIF(TRIM(p.full_name), ''), 'Unspecified') AS name,
                     COUNT(*)::bigint AS documents,
                     COALESCE(SUM(ir.quantity), 0)::bigint AS quantity,
                     COALESCE(SUM(COALESCE(ir.total_amount, 0)), 0)::numeric AS amount
              FROM issuance_records ir
              LEFT JOIN profiles p ON p.id = ir.employee_id
              WHERE (${isSuperAdmin}::boolean OR ir.created_by = ${me}::uuid)
                AND EXTRACT(YEAR FROM COALESCE(ir.doc_date, (ir.created_at AT TIME ZONE 'Asia/Manila')::date)) = ${year}
              GROUP BY 1
              ORDER BY documents DESC, amount DESC
              LIMIT 15
            `.catch(() => [] as GroupBreakdownRow[]),
            prisma.$queryRaw<YearRow[]>`
              SELECT DISTINCT EXTRACT(YEAR FROM COALESCE(doc_date, (created_at AT TIME ZONE 'Asia/Manila')::date))::int AS year
              FROM issuance_records
              WHERE (${isSuperAdmin}::boolean OR created_by = ${me}::uuid)
              ORDER BY year DESC
            `.catch(() => [] as YearRow[]),
          ])

        const quarterMap = new Map<number, QuarterSummary>()
        for (const row of yearRows) {
          const mapped = mapQuarter(row)
          quarterMap.set(mapped.quarter, mapped)
        }
        const quarters = quartersForYear(year).map(
          (ref) => quarterMap.get(ref.quarter) ?? emptyQuarter(ref)
        )

        const trendMap = new Map<string, QuarterSummary>()
        for (const row of trendRows) {
          const mapped = mapQuarter(row)
          trendMap.set(mapped.key, mapped)
        }
        const trend = trendRefs.map((ref) => trendMap.get(quarterKey(ref)) ?? emptyQuarter(ref))

        const availableYears = years.map((r) => Number(r.year)).filter((y) => Number.isFinite(y))
        if (!availableYears.includes(year)) availableYears.unshift(year)

        return {
          generatedAt,
          year,
          availableYears,
          quarters,
          totals: sumQuarters(quarters),
          trend,
          topItems: itemRows.map((r) => ({
            name: r.name ?? 'Unspecified',
            lines: Number(r.lines ?? 0),
            quantity: num(r.quantity),
            amount: num(r.amount),
          })),
          byOffice: officeRows.map((r) => ({
            name: r.name ?? 'Unspecified',
            documents: Number(r.documents ?? 0),
            quantity: Number(r.quantity ?? 0),
            amount: num(r.amount),
          })),
          byEmployee: employeeRows.map((r) => ({
            name: r.name ?? 'Unspecified',
            documents: Number(r.documents ?? 0),
            quantity: Number(r.quantity ?? 0),
            amount: num(r.amount),
          })),
        }
      } catch (e) {
        console.error('[getQuarterlyIssuanceReport]', e)
        return empty
      }
    },
    { year }
  )
}

// ─── Asset conditions (shared global registry) ─────────────────────────────

export interface ConditionRow {
  condition: string
  label: string
  count: number
  pct: number
  cls: ConditionClass
}

export interface AssetConditionReport {
  generatedAt: string
  total: number
  serviceable: number
  unserviceable: number
  unspecified: number
  serviceablePct: number
  rows: ConditionRow[]
}

interface ConditionDbRow {
  condition: string | null
  count: bigint
}

/**
 * Asset-condition distribution from the shared asset registry. This pool is
 * global for both personnel and super admin (see personnel-scope.ts).
 */
export async function getAssetConditionReport(): Promise<AssetConditionReport> {
  const generatedAt = new Date().toISOString()
  const empty: AssetConditionReport = {
    generatedAt,
    total: 0,
    serviceable: 0,
    unserviceable: 0,
    unspecified: 0,
    serviceablePct: 0,
    rows: [],
  }
  const scope = await getPersonnelScope()
  if (scope.isEmpty || !scope.userId) return empty

  return withScopedCache('personnel:reports:asset-conditions', REPORT_TTL, async () => {
    try {
      const dbRows = await prisma.$queryRaw<ConditionDbRow[]>`
        SELECT COALESCE(NULLIF(LOWER(TRIM(condition)), ''), 'unspecified') AS condition,
               COUNT(*)::bigint AS count
        FROM assets
        GROUP BY 1
        ORDER BY count DESC, condition
      `.catch(() => [] as ConditionDbRow[])

      const rows: ConditionRow[] = dbRows.map((r) => {
        const key = normalizeCondition(r.condition)
        return {
          condition: key,
          label: conditionLabel(key),
          count: Number(r.count ?? 0),
          pct: 0,
          cls: classifyCondition(key),
        }
      })
      const total = rows.reduce((n, r) => n + r.count, 0)
      for (const row of rows) row.pct = percentage(row.count, total)
      const serviceable = rows
        .filter((r) => r.cls === 'serviceable')
        .reduce((n, r) => n + r.count, 0)
      const unserviceable = rows
        .filter((r) => r.cls === 'unserviceable')
        .reduce((n, r) => n + r.count, 0)
      const unspecified = Math.max(0, total - serviceable - unserviceable)

      return {
        generatedAt,
        total,
        serviceable,
        unserviceable,
        unspecified,
        serviceablePct: percentage(serviceable, total),
        rows,
      }
    } catch (e) {
      console.error('[getAssetConditionReport]', e)
      return empty
    }
  })
}
