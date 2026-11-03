'use client'

import Link from 'next/link'
import { useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { useCachedAction } from '@/hooks/use-cached-action'
import { buildQueryKey } from '@/lib/query-keys'
import { formatPeso } from '@/lib/issuance-rules'
import {
  AGING_BUCKETS,
  REPORT_MODULES,
  agingBucketLabel,
  conditionLabel,
  type ConditionClass,
} from '@/lib/reporting'
import {
  fetchAgingReport,
  fetchAssetConditionReport,
  fetchQuarterlyIssuanceReport,
} from '@/lib/reporting-actions'

import styles from './reports.module.css'

type Portal = 'personnel' | 'super-admin'
type ReportTab = 'aging' | 'quarterly' | 'conditions'
type AgingModuleFilter = 'all' | 'inspections' | 'requests' | 'repairs'
type AgingBucketFilter = 'all' | '0-3' | '4-7' | '8-14' | '15+'

const PAGE_SIZE = 15

function roleFor(portal: Portal): 'pgso_personnel' | 'super_admin' {
  return portal === 'super-admin' ? 'super_admin' : 'pgso_personnel'
}

function apiBase(portal: Portal): string {
  return portal === 'super-admin' ? '/api/super-admin' : '/api/personnel'
}

function statusTone(value: string | null): string {
  if (!value) return 'warn'
  if (['completed', 'passed', 'approved', 'done'].includes(value)) return 'ok'
  if (['failed', 'rejected', 'cancelled'].includes(value)) return 'bad'
  return 'warn'
}

function Loading({ label }: { label: string }) {
  return (
    <p className={styles.loading}>
      <span aria-hidden="true" className={styles.spinner} />
      Loading {label}…
    </p>
  )
}

function ErrorNote({ message }: { message: string }) {
  return <p className={styles.empty}>{message}</p>
}

const DONUT_COLORS: Record<ConditionClass, string[]> = {
  serviceable: ['#1b2a4a', '#395581', '#5b7aab', '#8aa2c8'],
  unserviceable: ['#c0392b', '#d9665b', '#e59a91'],
  unspecified: ['#d4a017', '#e3bd56', '#eddaa0'],
}

interface ConditionSlice {
  condition: string
  label: string
  count: number
  pct: number
  cls: ConditionClass
}

function ConditionDonut({
  rows,
  total,
}: {
  rows: ConditionSlice[]
  total: number
}) {
  const [active, setActive] = useState<number | null>(null)

  const seen: Partial<Record<ConditionClass, number>> = {}
  const slices = rows.map((row) => {
    const index = seen[row.cls] ?? 0
    seen[row.cls] = index + 1
    const palette = DONUT_COLORS[row.cls] ?? DONUT_COLORS.unspecified
    return { ...row, color: palette[index % palette.length] }
  })

  const size = 180
  const stroke = 26
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const gap = slices.filter((s) => s.count > 0).length > 1 ? 3 : 0
  const activeSlice = active === null ? null : slices[active]

  const arcs = slices.map((slice, index) => {
    const startFraction =
      total > 0
        ? slices
            .slice(0, index)
            .reduce((sum, prior) => sum + prior.count / total, 0)
        : 0
    const offset = startFraction * circumference
    const length = total > 0 ? (slice.count / total) * circumference : 0
    return {
      ...slice,
      visible: length > 0,
      dash: `${Math.max(length - gap, 0.5)} ${circumference}`,
      offset: -offset,
    }
  })

  return (
    <div className={styles.donutWrap}>
      <div className={styles.donutChart}>
        <svg
          className={styles.donutSvg}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={`Condition distribution: ${slices
            .map((s) => `${s.label} ${s.count} (${s.pct}%)`)
            .join(', ')}`}
        >
          <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="var(--color-navy-100)"
              strokeWidth={stroke}
            />
            {arcs.map((arc, index) =>
              arc.visible ? (
                <circle
                  key={arc.condition}
                  className={styles.donutSegment}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={arc.color}
                  strokeWidth={active === index ? stroke + 6 : stroke}
                  strokeDasharray={arc.dash}
                  strokeDashoffset={arc.offset}
                  opacity={active === null || active === index ? 1 : 0.35}
                  onMouseEnter={() => setActive(index)}
                  onMouseLeave={() => setActive(null)}
                />
              ) : null
            )}
          </g>
        </svg>
        <div className={styles.donutCenter} aria-hidden="true">
          <span className={styles.donutTotal}>{total.toLocaleString('en-PH')}</span>
          <span className={styles.donutTotalLabel}>assets</span>
        </div>
        {activeSlice && (
          <div className={styles.donutTip} role="status">
            <span
              className={styles.donutDot}
              style={{ background: activeSlice.color }}
            />
            <span className={styles.donutTipLabel}>{activeSlice.label}</span>
            <span className={styles.donutTipValue}>
              {activeSlice.count} · {activeSlice.pct}%
            </span>
          </div>
        )}
      </div>

      <ul className={styles.donutLegend}>
        {slices.map((slice, index) => (
          <li
            key={slice.condition}
            className={styles.donutLegendRow}
            data-active={active === index}
            tabIndex={0}
            onMouseEnter={() => setActive(index)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(index)}
            onBlur={() => setActive(null)}
          >
            <span
              className={styles.donutDot}
              style={{ background: slice.color }}
            />
            <span className={styles.donutLegendLabel}>{slice.label}</span>
            <span className={styles.donutLegendValue}>
              {slice.count} · {slice.pct}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}


const AGING_COLORS = ['#8aa2c8', '#5b7aab', '#e6a800', '#c0392b']
const PAR_COLOR = '#1b2a4a'
const ICS_COLOR = '#f5c518'

interface QuarterDatum {
  key: string
  label: string
  documents: number
  par: number
  ics: number
  quantity: number
  amount: number
}

function QuarterTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload?: QuarterDatum }>
}) {
  const row = payload?.[0]?.payload
  if (!active || !row) return null
  return (
    <div className={styles.chartTip}>
      <span className={styles.chartTipTitle}>{row.label}</span>
      <span className={styles.chartTipRow}>
        Documents: <b>{row.documents}</b> · PAR <b>{row.par}</b> · ICS{' '}
        <b>{row.ics}</b>
      </span>
      <span className={styles.chartTipRow}>
        Quantity: <b>{row.quantity}</b> · {formatPeso(row.amount)}
      </span>
    </div>
  )
}

function QuarterChart({ quarters }: { quarters: QuarterDatum[] }) {
  const data = quarters.map((q) => ({
    ...q,
    short: q.label.replace(/\s*\d{4}$/, ''),
  }))
  const max = Math.max(4, ...data.map((q) => q.documents))

  return (
    <div className={styles.chartBox}>
      <div className={styles.chartArea}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
            barCategoryGap="30%"
          >
            <CartesianGrid vertical={false} stroke="#e8edf5" />
            <XAxis
              dataKey="short"
              tickLine={false}
              axisLine={{ stroke: '#d1d9e6' }}
              tick={{ fontSize: 12, fill: '#6b7a95' }}
            />
            <YAxis
              allowDecimals={false}
              domain={[0, max]}
              tickLine={false}
              axisLine={false}
              width={36}
              tick={{ fontSize: 12, fill: '#6b7a95' }}
            />
            <Tooltip
              cursor={{ fill: '#f1f5f9' }}
              content={<QuarterTooltip />}
            />
            <Bar
              dataKey="par"
              name="PAR"
              stackId="docs"
              fill={PAR_COLOR}
              maxBarSize={64}
            />
            <Bar
              dataKey="ics"
              name="ICS"
              stackId="docs"
              fill={ICS_COLOR}
              maxBarSize={64}
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul className={styles.chartLegend}>
        <li className={styles.chartLegendItem}>
          <span className={styles.chartLegendDot} style={{ background: PAR_COLOR }} />
          PAR
        </li>
        <li className={styles.chartLegendItem}>
          <span className={styles.chartLegendDot} style={{ background: ICS_COLOR }} />
          ICS
        </li>
      </ul>
    </div>
  )
}

interface AgingSummaryDatum {
  module: string
  label: string
  total: number
  delayed: number
  oldestDays: number
  buckets: Array<{ bucket: string; label: string; count: number }>
}

function AgingChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ dataKey?: string | number; value?: unknown }>
  label?: string | number
}) {
  if (!active || !payload?.length) return null
  return (
    <div className={styles.chartTip}>
      <span className={styles.chartTipTitle}>{label}</span>
      {payload.map((entry) => {
        const index = Number(String(entry.dataKey).replace('bucket', ''))
        const bucket = AGING_BUCKETS[index]
        return (
          <span key={String(entry.dataKey)} className={styles.chartTipRow}>
            <span
              className={styles.chartLegendDot}
              style={{ background: AGING_COLORS[index] ?? AGING_COLORS[0] }}
            />
            {bucket?.label ?? String(entry.dataKey)}:{' '}
            <b>{Number(entry.value ?? 0)}</b>
          </span>
        )
      })}
    </div>
  )
}

function AgingChart({ summaries }: { summaries: AgingSummaryDatum[] }) {
  const data = summaries.map((summary) => {
    const row: Record<string, string | number> = {
      name: summary.label,
      total: summary.total,
      delayed: summary.delayed,
    }
    summary.buckets.forEach((bucket, index) => {
      row[`bucket${index}`] = bucket.count
    })
    return row
  })

  return (
    <div className={styles.chartBox}>
      <div className={styles.chartArea} style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
            barCategoryGap="24%"
          >
            <CartesianGrid horizontal={false} stroke="#e8edf5" />
            <XAxis
              type="number"
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 12, fill: '#6b7a95' }}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={120}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 12, fill: '#1b2a4a' }}
            />
            <Tooltip
              cursor={{ fill: '#f1f5f9' }}
              content={<AgingChartTooltip />}
            />
            {AGING_BUCKETS.map((bucket, index) => (
              <Bar
                key={bucket.key}
                dataKey={`bucket${index}`}
                name={bucket.label}
                stackId="age"
                fill={AGING_COLORS[index] ?? AGING_COLORS[0]}
                maxBarSize={26}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul className={styles.chartLegend}>
        {AGING_BUCKETS.map((bucket, index) => (
          <li key={bucket.key} className={styles.chartLegendItem}>
            <span
              className={styles.chartLegendDot}
              style={{ background: AGING_COLORS[index] ?? AGING_COLORS[0] }}
            />
            {bucket.label}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Shared Reports workspace for the Personnel and Super Admin portals.
 *
 * The same component renders both portals; the server actions and XLSX
 * routes re-apply the caller's scope, so the two only differ in navigation
 * and in the records the queries return.
 */
export function ReportsWorkspace({ portal }: { portal: Portal }) {
  const [tab, setTab] = useState<ReportTab>('aging')

  const [agingModule, setAgingModule] = useState<AgingModuleFilter>('all')
  const [agingBucket, setAgingBucket] = useState<AgingBucketFilter>('all')
  const [agingPage, setAgingPage] = useState(1)

  const [year, setYear] = useState(() => new Date().getFullYear())

  const role = roleFor(portal)

  const aging = useCachedAction(
    buildQueryKey({
      module: portal,
      resource: 'reports-aging',
      page: agingPage,
      pageSize: PAGE_SIZE,
      filters: { module: agingModule, bucket: agingBucket },
      role,
    }),
    () =>
      fetchAgingReport({
        portal,
        module: agingModule,
        bucket: agingBucket,
        page: agingPage,
        pageSize: PAGE_SIZE,
      }),
    { staleTime: 60_000 }
  )

  const quarterly = useCachedAction(
    buildQueryKey({
      module: portal,
      resource: 'reports-quarterly',
      page: 1,
      pageSize: PAGE_SIZE,
      filters: { year },
      role,
    }),
    () => fetchQuarterlyIssuanceReport({ year }),
    { staleTime: 60_000 }
  )

  const conditions = useCachedAction(
    buildQueryKey({
      module: portal,
      resource: 'reports-conditions',
      page: 1,
      pageSize: PAGE_SIZE,
      filters: {},
      role,
    }),
    () => fetchAssetConditionReport(),
    { staleTime: 60_000 }
  )

  const age = aging.data
  const quarter = quarterly.data
  const condition = conditions.data

  const agingTotals = age?.summaries.reduce(
    (acc, s) => ({
      open: acc.open + s.total,
      delayed: acc.delayed + s.delayed,
      oldest: Math.max(acc.oldest, s.oldestDays),
    }),
    { open: 0, delayed: 0, oldest: 0 }
  ) ?? { open: 0, delayed: 0, oldest: 0 }

  const yearOptions = Array.from(
    new Set([year, ...(quarter?.availableYears ?? [])])
  ).sort((a, b) => b - a)

  const quarterMax = Math.max(
    1,
    ...(quarter?.trend.map((q) => q.documents) ?? [0])
  )

  const agingExport = `${apiBase(portal)}/reports/aging?module=${agingModule}&bucket=${agingBucket}`
  const quarterlyExport = `${apiBase(portal)}/reports/quarterly-issuance?year=${year}`
  const conditionExport = `${apiBase(portal)}/reports/asset-conditions`

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.crumb}>
            {portal === 'super-admin' ? 'Super Admin' : 'Personnel'} / Reports
          </p>
          <h1 className={styles.title}>Reports</h1>
          <p className={styles.subtitle}>
            Delayed and aging transactions, quarterly supply issuance, and
            asset-condition analytics. Every report is scoped to what you are
            allowed to see and can be downloaded as an official XLSX workbook.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={`${styles.button} ${styles.buttonSecondary}`}
            onClick={() => window.print()}
          >
            Print
          </button>
          <Link
            href={
              tab === 'aging'
                ? agingExport
                : tab === 'quarterly'
                  ? quarterlyExport
                  : conditionExport
            }
            className={styles.button}
            prefetch={false}
          >
            Download XLSX
          </Link>
        </div>
      </header>

      <div className={styles.tabs} role="tablist" aria-label="Report sections">
        {(
          [
            ['aging', 'Aging & delays'],
            ['quarterly', 'Quarterly issuance'],
            ['conditions', 'Asset conditions'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            data-active={tab === key}
            className={styles.tab}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'aging' && (
        <>
          <div className={styles.filters}>
            <label className={styles.field}>
              Workflow
              <select
                value={agingModule}
                onChange={(event) => {
                  setAgingModule(event.target.value as AgingModuleFilter)
                  setAgingPage(1)
                }}
              >
                <option value="all">All workflows</option>
                {REPORT_MODULES.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              Age bucket
              <select
                value={agingBucket}
                onChange={(event) => {
                  setAgingBucket(event.target.value as AgingBucketFilter)
                  setAgingPage(1)
                }}
              >
                <option value="all">All buckets</option>
                {AGING_BUCKETS.map((b) => (
                  <option key={b.key} value={b.key}>
                    {b.label}
                  </option>
                ))}
              </select>
            </label>
            <p className={styles.hint}>
              A record is <strong>delayed</strong> once it is older than{' '}
              {age?.thresholdDays ?? 7} days — the same threshold applies to
              inspections, requests and repairs.
            </p>
          </div>

          {!age ? (
            aging.error ? (
              <ErrorNote message={aging.error} />
            ) : (
              <Loading label="aging report" />
            )
          ) : (
            <>
              <div className={styles.kpis}>
                <div className={styles.kpi}>
                  <span className={styles.kpiLabel}>Open records</span>
                  <span className={styles.kpiValue}>{agingTotals.open}</span>
                  <span className={styles.kpiSub}>
                    Pending inspections, requests and repairs
                  </span>
                </div>
                <div
                  className={styles.kpi}
                  data-tone={agingTotals.delayed > 0 ? 'bad' : 'ok'}
                >
                  <span className={styles.kpiLabel}>Delayed</span>
                  <span className={styles.kpiValue}>{agingTotals.delayed}</span>
                  <span className={styles.kpiSub}>
                    Older than {age.thresholdDays} days
                  </span>
                </div>
                <div className={styles.kpi}>
                  <span className={styles.kpiLabel}>Oldest record</span>
                  <span className={styles.kpiValue}>
                    {agingTotals.oldest}
                    <small> d</small>
                  </span>
                  <span className={styles.kpiSub}>Days since opened</span>
                </div>
                <div className={styles.kpi}>
                  <span className={styles.kpiLabel}>Generated</span>
                  <span className={styles.kpiValue} style={{ fontSize: '1rem' }}>
                    {new Date(age.generatedAt).toLocaleString('en-PH', {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                      timeZone: 'Asia/Manila',
                    })}
                  </span>
                  <span className={styles.kpiSub}>Asia/Manila</span>
                </div>
              </div>

              <div className={styles.panel}>
                <div>
                  <h2 className={styles.panelTitle}>Aging summary by workflow</h2>
                  <p className={styles.panelSub}>
                    Open queues split into the assessment&apos;s age buckets.
                  </p>
                </div>
                <div className={styles.chartSplit}>
                  <AgingChart summaries={age.summaries} />
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Workflow</th>
                          <th className={styles.num}>Open</th>
                          <th className={styles.num}>
                            Delayed &gt; {age.thresholdDays}d
                          </th>
                          <th className={styles.num}>Oldest</th>
                          {AGING_BUCKETS.map((b) => (
                            <th key={b.key} className={styles.num}>
                              {b.label}
                            </th>
                          ))}
                          <th>Queue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {age.summaries.map((summary) => (
                          <tr key={summary.module}>
                            <td>{summary.label}</td>
                            <td className={styles.num}>{summary.total}</td>
                            <td className={styles.num}>
                              <span
                                className={styles.status}
                                data-tone={summary.delayed > 0 ? 'bad' : 'ok'}
                              >
                                {summary.delayed}
                              </span>
                            </td>
                            <td className={styles.num}>
                              {summary.oldestDays}d
                            </td>
                            {summary.buckets.map((bucket) => (
                              <td key={bucket.bucket} className={styles.num}>
                                {bucket.count}
                              </td>
                            ))}
                            <td>
                              <Link href={summary.href}>Open</Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className={styles.panel}>
                <div>
                  <h2 className={styles.panelTitle}>Delayed records</h2>
                  <p className={styles.panelSub}>
                    {age.rows.total} matching record
                    {age.rows.total === 1 ? '' : 's'} · page {age.rows.page} of{' '}
                    {age.rows.totalPages}
                  </p>
                </div>
                {age.rows.rows.length === 0 ? (
                  <p className={styles.empty}>
                    No records match the selected filters.
                  </p>
                ) : (
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Workflow</th>
                          <th>Reference</th>
                          <th>Subject</th>
                          <th>Owner</th>
                          <th>Opened</th>
                          <th className={styles.num}>Age</th>
                          <th>Bucket</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {age.rows.rows.map((row) => (
                          <tr key={`${row.module}-${row.id}`}>
                            <td>{row.moduleLabel}</td>
                            <td>{row.reference || '—'}</td>
                            <td>{row.subject || '—'}</td>
                            <td>{row.owner}</td>
                            <td>
                              {row.openedAt
                                ? new Date(row.openedAt).toLocaleDateString(
                                    'en-PH',
                                    {
                                      year: 'numeric',
                                      month: 'short',
                                      day: 'numeric',
                                      timeZone: 'Asia/Manila',
                                    }
                                  )
                                : '—'}
                            </td>
                            <td className={styles.num}>{row.ageDays}d</td>
                            <td>
                              <span
                                className={styles.status}
                                data-tone={row.delayed ? 'bad' : 'warn'}
                              >
                                {agingBucketLabel(row.bucket)}
                              </span>
                            </td>
                            <td>
                              <span
                                className={styles.status}
                                data-tone={statusTone(row.status)}
                              >
                                {row.status ?? 'pending'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className={styles.pagination}>
                  <button
                    type="button"
                    disabled={age.rows.page <= 1}
                    onClick={() => setAgingPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </button>
                  <span>
                    Page {age.rows.page} / {age.rows.totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={age.rows.page >= age.rows.totalPages}
                    onClick={() =>
                      setAgingPage((p) =>
                        Math.min(age.rows.totalPages, p + 1)
                      )
                    }
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {tab === 'quarterly' && (
        <>
          <div className={styles.filters}>
            <label className={styles.field}>
              Year
              <select
                value={year}
                onChange={(event) => setYear(Number(event.target.value))}
              >
                {yearOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <p className={styles.hint}>
              Calendar quarters (Q1 = Jan–Mar). Documents count once in the
              summary; consolidated multi-line documents count per line in the
              item breakdown.
            </p>
          </div>

          {!quarter ? (
            quarterly.error ? (
              <ErrorNote message={quarterly.error} />
            ) : (
              <Loading label="quarterly issuance report" />
            )
          ) : (
            <>
              <div className={styles.kpis}>
                <div className={styles.kpi}>
                  <span className={styles.kpiLabel}>Documents</span>
                  <span className={styles.kpiValue}>
                    {quarter.totals.documents}
                  </span>
                  <span className={styles.kpiSub}>{quarter.year} total</span>
                </div>
                <div className={styles.kpi}>
                  <span className={styles.kpiLabel}>PAR</span>
                  <span className={styles.kpiValue}>{quarter.totals.par}</span>
                  <span className={styles.kpiSub}>&gt; ₱50,000</span>
                </div>
                <div className={styles.kpi}>
                  <span className={styles.kpiLabel}>ICS</span>
                  <span className={styles.kpiValue}>{quarter.totals.ics}</span>
                  <span className={styles.kpiSub}>≤ ₱50,000</span>
                </div>
                <div className={styles.kpi}>
                  <span className={styles.kpiLabel}>Quantity issued</span>
                  <span className={styles.kpiValue}>
                    {quarter.totals.quantity.toLocaleString('en-PH')}
                  </span>
                  <span className={styles.kpiSub}>Across all documents</span>
                </div>
                <div className={styles.kpi}>
                  <span className={styles.kpiLabel}>Amount issued</span>
                  <span className={styles.kpiValue} style={{ fontSize: '1.05rem' }}>
                    {formatPeso(quarter.totals.amount)}
                  </span>
                  <span className={styles.kpiSub}>Snapshot totals</span>
                </div>
              </div>

              <div className={styles.twoCol}>
                <div className={styles.panel}>
                  <div>
                    <h2 className={styles.panelTitle}>
                      Quarter summary — {quarter.year}
                    </h2>
                    <p className={styles.panelSub}>
                      PAR / ICS split per quarter — hover a bar for quantity and
                      amount.
                    </p>
                  </div>
                  <QuarterChart quarters={quarter.quarters} />
                </div>

                <div className={styles.panel}>
                  <div>
                    <h2 className={styles.panelTitle}>Last 8 quarters</h2>
                    <p className={styles.panelSub}>
                      Issuance documents per quarter — calendar basis.
                    </p>
                  </div>
                  <div className={styles.bars}>
                    {quarter.trend.map((q) => (
                      <div key={q.key} className={styles.barRow}>
                        <span>{q.label}</span>
                        <span className={styles.barTrack}>
                          <span
                            className={styles.barFill}
                            style={{
                              width: q.documents
                                ? `${Math.max(2, Math.round((q.documents / quarterMax) * 100))}%`
                                : '0%',
                            }}
                          />
                        </span>
                        <span className={styles.barValue}>
                          {q.documents} docs
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className={styles.twoCol}>
                <div className={styles.panel}>
                  <div>
                    <h2 className={styles.panelTitle}>Top items issued</h2>
                    <p className={styles.panelSub}>
                      Per line — consolidated documents appear once per line.
                    </p>
                  </div>
                  {quarter.topItems.length === 0 ? (
                    <p className={styles.empty}>No items issued in {quarter.year}.</p>
                  ) : (
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>Item</th>
                            <th className={styles.num}>Lines</th>
                            <th className={styles.num}>Qty</th>
                            <th className={styles.num}>Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {quarter.topItems.map((item) => (
                            <tr key={item.name}>
                              <td>{item.name}</td>
                              <td className={styles.num}>{item.lines}</td>
                              <td className={styles.num}>{item.quantity}</td>
                              <td className={styles.num}>
                                {formatPeso(item.amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className={styles.panel}>
                  <div>
                    <h2 className={styles.panelTitle}>Issuance by employee</h2>
                    <p className={styles.panelSub}>
                      Who received accountability documents this year.
                    </p>
                  </div>
                  {quarter.byEmployee.length === 0 ? (
                    <p className={styles.empty}>No employees issued in {quarter.year}.</p>
                  ) : (
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>Employee</th>
                            <th className={styles.num}>Docs</th>
                            <th className={styles.num}>Qty</th>
                            <th className={styles.num}>Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {quarter.byEmployee.map((item) => (
                            <tr key={item.name}>
                              <td>{item.name}</td>
                              <td className={styles.num}>{item.documents}</td>
                              <td className={styles.num}>{item.quantity}</td>
                              <td className={styles.num}>
                                {formatPeso(item.amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              <div className={styles.panel}>
                <div>
                  <h2 className={styles.panelTitle}>
                    Issuance by office / department
                  </h2>
                  <p className={styles.panelSub}>
                    Based on the receiving employee&apos;s profile department.
                  </p>
                </div>
                {quarter.byOffice.length === 0 ? (
                  <p className={styles.empty}>No offices issued in {quarter.year}.</p>
                ) : (
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Office / department</th>
                          <th className={styles.num}>Docs</th>
                          <th className={styles.num}>Qty</th>
                          <th className={styles.num}>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {quarter.byOffice.map((item) => (
                          <tr key={item.name}>
                            <td>{item.name}</td>
                            <td className={styles.num}>{item.documents}</td>
                            <td className={styles.num}>{item.quantity}</td>
                            <td className={styles.num}>
                              {formatPeso(item.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {tab === 'conditions' && (
        <>
          {!condition ? (
            conditions.error ? (
              <ErrorNote message={conditions.error} />
            ) : (
              <Loading label="asset-condition report" />
            )
          ) : (
            <>
              <div className={styles.kpis}>
                <div className={styles.kpi}>
                  <span className={styles.kpiLabel}>Total assets</span>
                  <span className={styles.kpiValue}>
                    {condition.total.toLocaleString('en-PH')}
                  </span>
                  <span className={styles.kpiSub}>Shared asset registry</span>
                </div>
                <div className={styles.kpi} data-tone="ok">
                  <span className={styles.kpiLabel}>Serviceable</span>
                  <span className={styles.kpiValue}>
                    {condition.serviceable.toLocaleString('en-PH')}
                  </span>
                  <span className={styles.kpiSub}>
                    {condition.serviceablePct}% of all assets
                  </span>
                </div>
                <div
                  className={styles.kpi}
                  data-tone={condition.unserviceable > 0 ? 'bad' : 'ok'}
                >
                  <span className={styles.kpiLabel}>Unserviceable</span>
                  <span className={styles.kpiValue}>
                    {condition.unserviceable.toLocaleString('en-PH')}
                  </span>
                  <span className={styles.kpiSub}>
                    Needs repair or disposal review
                  </span>
                </div>
                <div className={styles.kpi} data-tone="warn">
                  <span className={styles.kpiLabel}>Unspecified</span>
                  <span className={styles.kpiValue}>
                    {condition.unspecified.toLocaleString('en-PH')}
                  </span>
                  <span className={styles.kpiSub}>
                    Missing or unrecognized condition
                  </span>
                </div>
              </div>

              <div className={styles.twoCol}>
                <div className={styles.panel}>
                  <div>
                    <h2 className={styles.panelTitle}>Condition distribution</h2>
                    <p className={styles.panelSub}>
                      Normalized values — case and spacing are ignored.
                    </p>
                  </div>
                  {condition.rows.length === 0 ? (
                    <p className={styles.empty}>No assets registered yet.</p>
                  ) : (
                    <ConditionDonut
                      rows={condition.rows}
                      total={condition.total}
                    />
                  )}
                </div>

                <div className={styles.panel}>
                  <div>
                    <h2 className={styles.panelTitle}>Condition table</h2>
                    <p className={styles.panelSub}>
                      Distribution only — the registry stores the current
                      condition, so a historical trend is not available.
                    </p>
                  </div>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Condition</th>
                          <th>Classification</th>
                          <th className={styles.num}>Assets</th>
                          <th className={styles.num}>Share</th>
                        </tr>
                      </thead>
                      <tbody>
                        {condition.rows.map((row) => (
                          <tr key={row.condition}>
                            <td>{row.label || conditionLabel(row.condition)}</td>
                            <td>
                              <span
                                className={styles.status}
                                data-tone={
                                  row.cls === 'serviceable'
                                    ? 'ok'
                                    : row.cls === 'unserviceable'
                                      ? 'bad'
                                      : 'warn'
                                }
                              >
                                {row.cls}
                              </span>
                            </td>
                            <td className={styles.num}>{row.count}</td>
                            <td className={styles.num}>{row.pct}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </section>
  )
}
