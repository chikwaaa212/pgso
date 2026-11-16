'use client'

import Link from 'next/link'
import { useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  ArrowUpRight,
  CalendarDays,
  ChartColumn,
  CircleCheck,
  ClipboardList,
  Clock3,
  FileSpreadsheet,
  Hourglass,
  PackageSearch,
  ShieldCheck,
  TriangleAlert,
  Wallet,
  X,
} from 'lucide-react'

import { useCachedAction } from '@/hooks/use-cached-action'
import { TablePager } from '@/components/personnel/TablePager'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { buildQueryKey } from '@/lib/query-keys'
import { PAGE_SIZE } from '@/lib/constants'
import { formatPeso } from '@/lib/issuance-rules'
import {
  AGING_BUCKETS,
  REPORT_MODULES,
  agingBucketLabel,
  availabilityLabel,
  type AvailabilityClass,
} from '@/lib/reporting'
import {
  fetchAgingReport,
  fetchAssetAvailabilityReport,
  fetchQuarterlyIssuanceReport,
} from '@/lib/reporting-actions'

import { ReportsContentSkeleton } from './ReportsSkeleton'
import styles from './reports.module.css'

type Portal = 'personnel' | 'super-admin'
type ReportTab = 'aging' | 'quarterly' | 'availability'
type AgingModuleFilter = 'all' | 'inspections' | 'requests' | 'repairs'
type AgingBucketFilter = 'all' | '0-3' | '4-7' | '8-14' | '15+'

function roleFor(portal: Portal): 'pgso_personnel' | 'super_admin' {
  return portal === 'super-admin' ? 'super_admin' : 'pgso_personnel'
}

function statusTone(value: string | null): string {
  if (!value) return 'warn'
  const v = value.toLowerCase()
  if (v === 'in_progress' || v === 'in progress') return 'info'
  if (['completed', 'passed', 'approved', 'done', 'resolved'].includes(v))
    return 'ok'
  if (
    ['failed', 'rejected', 'cancelled', 'returned', 'return_to_supplier'].includes(
      v
    )
  )
    return 'bad'
  // Pending / awaiting action.
  return 'warn'
}

/** `in_progress` → `In progress`. */
function humanize(value: string | null): string {
  if (!value) return '—'
  const text = value.replace(/_/g, ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function bucketTone(bucket: string): string {
  if (bucket === '15+') return 'bad'
  if (bucket === '8-14' || bucket === '4-7') return 'warn'
  return 'ok'
}

function shortBucketLabel(label: string): string {
  return label.replace(' days', 'd')
}

function fmtDate(value: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Manila',
  })
}

function availabilityTone(cls: AvailabilityClass): 'ok' | 'info' | 'bad' | 'warn' {
  if (cls === 'available') return 'ok'
  if (cls === 'in-use') return 'info'
  if (cls === 'unavailable') return 'bad'
  return 'warn'
}

function AvailabilityIcon({ cls }: { cls: AvailabilityClass }) {
  if (cls === 'available') return <CircleCheck size={16} aria-hidden="true" />
  if (cls === 'in-use') return <ClipboardList size={16} aria-hidden="true" />
  if (cls === 'unavailable') return <TriangleAlert size={16} aria-hidden="true" />
  return <Hourglass size={16} aria-hidden="true" />
}

function ErrorNote({ message }: { message: string }) {
  return (
    <div className={styles.errorBox} role="alert">
      <TriangleAlert size={16} aria-hidden="true" />
      <span>{message}</span>
    </div>
  )
}

/** Shared KPI tile used by all three report tabs. */
function StatCard({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  sub: string
  tone?: 'ok' | 'warn' | 'bad'
}) {
  return (
    <div className={styles.kpi} data-tone={tone}>
      <span className={styles.kpiIcon} data-tone={tone} aria-hidden="true">
        {icon}
      </span>
      <div className={styles.kpiBody}>
        <span className={styles.kpiLabel}>{label}</span>
        <span className={styles.kpiValue}>{value}</span>
        <span className={styles.kpiSub}>{sub}</span>
      </div>
    </div>
  )
}

const DONUT_COLORS: Record<AvailabilityClass, string[]> = {
  available: ['#1b2a4a', '#395581', '#5b7aab', '#8aa2c8'],
  'in-use': ['#1d4ed8', '#3b82f6', '#93c5fd'],
  unavailable: ['#c0392b', '#d9665b', '#e59a91'],
  unspecified: ['#d4a017', '#e3bd56', '#eddaa0'],
}

interface StatusSlice {
  status: string
  label: string
  items: number
  pct: number
  cls: AvailabilityClass
}

function AvailabilityDonut({
  rows,
  total,
}: {
  rows: StatusSlice[]
  total: number
}) {
  const [active, setActive] = useState<number | null>(null)

  const seen: Partial<Record<AvailabilityClass, number>> = {}
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
  const gap = slices.filter((s) => s.items > 0).length > 1 ? 3 : 0
  const activeSlice = active === null ? null : slices[active]

  const arcs = slices.map((slice, index) => {
    const startFraction =
      total > 0
        ? slices
            .slice(0, index)
            .reduce((sum, prior) => sum + prior.items / total, 0)
        : 0
    const offset = startFraction * circumference
    const length = total > 0 ? (slice.items / total) * circumference : 0
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
          aria-label={`Status distribution: ${slices
            .map((s) => `${s.label} ${s.items} (${s.pct}%)`)
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
                  key={arc.status}
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
        {/* Hovering a slice swaps the centre readout instead of stacking a
            tooltip on top of it (the overlay used to cover the total). */}
        <div className={styles.donutCenter}>
          {activeSlice ? (
            <>
              <span
                className={styles.donutCenterDot}
                style={{ background: activeSlice.color }}
                aria-hidden="true"
              />
              <span className={styles.donutActiveLabel}>
                {activeSlice.label}
              </span>
              <span className={styles.donutTotal}>
                {activeSlice.items.toLocaleString('en-PH')}
              </span>
            </>
          ) : (
            <>
              <span className={styles.donutTotal}>
                {total.toLocaleString('en-PH')}
              </span>
              <span className={styles.donutTotalLabel}>assets</span>
            </>
          )}
        </div>
      </div>

      <ul className={styles.donutLegend}>
        {slices.map((slice, index) => (
          <li
            key={slice.status}
            className={styles.donutLegendRow}
            data-active={active === index}
            tabIndex={0}
            onMouseEnter={() => setActive(index)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(index)}
            onBlur={() => setActive(null)}
          >
            <span
              className={styles.donutLegendIcon}
              data-tone={availabilityTone(slice.cls)}
              aria-hidden="true"
            >
              <AvailabilityIcon cls={slice.cls} />
            </span>
            <span className={styles.donutLegendMain}>
              <span className={styles.donutLegendLabel}>{slice.label}</span>
              <span
                className={styles.shareBar}
                role="img"
                aria-label={`${slice.label}: ${slice.pct}% of assets`}
              >
                <span
                  className={styles.shareFill}
                  style={{ width: `${slice.pct}%`, background: slice.color }}
                />
              </span>
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
          <span
            className={styles.chartLegendDot}
            style={{ background: PAR_COLOR }}
          />
          PAR
        </li>
        <li className={styles.chartLegendItem}>
          <span
            className={styles.chartLegendDot}
            style={{ background: ICS_COLOR }}
          />
          ICS
        </li>
      </ul>
    </div>
  )
}

const TREND_COLOR = '#1b2a4a'
const TREND_CONFIG: ChartConfig = {
  documents: { label: 'Documents', color: TREND_COLOR },
}

function QuarterTrendChart({ trend }: { trend: QuarterDatum[] }) {
  const data = trend.map((q) => ({
    ...q,
    short: q.label.replace(/\s*\d{4}$/, ''),
  }))

  return (
    <ChartContainer
      config={TREND_CONFIG}
      className="aspect-auto h-[280px] w-full"
    >
      <LineChart
        accessibilityLayer
        data={data}
        margin={{ top: 8, right: 12, bottom: 0, left: -16 }}
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
          tickLine={false}
          axisLine={false}
          width={36}
          tick={{ fontSize: 12, fill: '#6b7a95' }}
        />
        <ChartTooltip
          cursor={{ stroke: '#cbd5e1', strokeWidth: 1 }}
          content={<ChartTooltipContent indicator="line" />}
        />
        <Line
          type="monotone"
          dataKey="documents"
          name="Documents"
          stroke={TREND_COLOR}
          strokeWidth={2}
          dot={{ r: 3, fill: TREND_COLOR, strokeWidth: 0 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ChartContainer>
  )
}

const BREAKDOWN_COLORS = [
  '#1b2a4a',
  '#f5c518',
  '#5b7aab',
  '#8aa2c8',
  '#d4a017',
  '#9b2c20',
  '#6b8f71',
]

interface DonutDatum {
  name: string
  value: number
}

/** Keep the donut readable: top 6 slices plus a grouped "Other". */
function collapseSlices(rows: DonutDatum[], top = 6): DonutDatum[] {
  const sorted = rows
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value)
  if (sorted.length <= top) return sorted
  const rest = sorted.slice(top).reduce((sum, row) => sum + row.value, 0)
  return rest > 0
    ? [...sorted.slice(0, top), { name: 'Other', value: rest }]
    : sorted.slice(0, top)
}

/**
 * Donut breakdown shown beside the quarterly tables. Uses the same
 * ChartContainer / ChartTooltip primitives as the dashboards so the
 * tooltip matches the rest of the app.
 */
function BreakdownDonut({
  rows,
  unit,
}: {
  rows: DonutDatum[]
  unit: string
}) {
  const data = collapseSlices(rows)
  const total = data.reduce((sum, row) => sum + row.value, 0)
  if (total === 0) return null

  const config: ChartConfig = Object.fromEntries(
    data.map((row, index) => [
      row.name,
      {
        label: row.name,
        color: BREAKDOWN_COLORS[index % BREAKDOWN_COLORS.length],
      },
    ])
  )

  return (
    <div className={styles.breakdown}>
      <div className={styles.breakdownChart}>
        <ChartContainer
          config={config}
          className="aspect-square max-h-[210px] w-full"
        >
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent hideLabel />} />
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="58%"
              outerRadius="88%"
              paddingAngle={2}
              strokeWidth={0}
            >
              {data.map((row, index) => (
                <Cell
                  key={row.name}
                  fill={BREAKDOWN_COLORS[index % BREAKDOWN_COLORS.length]}
                />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
        <div className={styles.breakdownCenter} aria-hidden="true">
          <span className={styles.breakdownTotal}>
            {total.toLocaleString('en-PH')}
          </span>
          <span className={styles.breakdownTotalLabel}>{unit}</span>
        </div>
      </div>
      <ul className={styles.breakdownLegend}>
        {data.map((row, index) => (
          <li key={row.name} className={styles.breakdownLegendRow}>
            <span
              className={styles.breakdownDot}
              style={{
                background: BREAKDOWN_COLORS[index % BREAKDOWN_COLORS.length],
              }}
            />
            <span className={styles.breakdownLegendLabel} title={row.name}>
              {row.name}
            </span>
            <span className={styles.breakdownLegendValue}>
              {row.value.toLocaleString('en-PH')}
            </span>
          </li>
        ))}
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
  href: string
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
    { staleTime: 60_000, enabled: tab === 'aging' }
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
    { staleTime: 60_000, enabled: tab === 'quarterly' }
  )

  const availability = useCachedAction(
    buildQueryKey({
      module: portal,
      resource: 'reports-availability',
      page: 1,
      pageSize: PAGE_SIZE,
      filters: {},
      role,
    }),
    () => fetchAssetAvailabilityReport(),
    // Registry counts change as soon as an asset is assigned or stocked, so
    // never serve a client-cached snapshot as fresh — paint it, then revalidate.
    { staleTime: 0, refetchOnFocus: true, enabled: tab === 'availability' }
  )

  const age = aging.data
  const quarter = quarterly.data
  const status = availability.data

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

  const hasAgingFilters = agingModule !== 'all' || agingBucket !== 'all'

  const tabs = [
    { key: 'aging' as const, label: 'Aging & delays', icon: <Clock3 size={13} /> },
    {
      key: 'quarterly' as const,
      label: 'Quarterly issuance',
      icon: <ChartColumn size={13} />,
    },
    {
      key: 'availability' as const,
      label: 'Asset availability',
      icon: <ShieldCheck size={13} />,
    },
  ]

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          {portal !== 'personnel' && (
            <p className={styles.crumb}>
              {portal === 'super-admin' ? 'Super Admin' : 'Personnel'} / Reports
            </p>
          )}
          <h1 className={styles.title}>Reports</h1>
          <p className={styles.subtitle}>
            Delayed and aging transactions, quarterly supply issuance, and
            asset availability &amp; status analytics — scoped to what you are
            allowed to see.
          </p>
        </div>
      </header>

      <div className={styles.tabBar}>
        <div className={styles.tabs} role="tablist" aria-label="Report sections">
          {tabs.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              data-active={tab === item.key}
              className={styles.tab}
              onClick={() => setTab(item.key)}
            >
              <span className={styles.tabIcon} aria-hidden="true">
                {item.icon}
              </span>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'aging' && (
        <>
          <div className={styles.toolbar}>
            <div className={styles.toolbarFields}>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Workflow</span>
                <Select
                  value={agingModule}
                  onValueChange={(value) => {
                    setAgingModule(value as AgingModuleFilter)
                    setAgingPage(1)
                  }}
                >
                  <SelectTrigger
                    size="sm"
                    className={styles.selectTrigger}
                    aria-label="Filter by workflow"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All workflows</SelectItem>
                    {REPORT_MODULES.map((m) => (
                      <SelectItem key={m.key} value={m.key}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className={styles.field}>
                <span className={styles.fieldLabel}>Age bucket</span>
                <Select
                  value={agingBucket}
                  onValueChange={(value) => {
                    setAgingBucket(value as AgingBucketFilter)
                    setAgingPage(1)
                  }}
                >
                  <SelectTrigger
                    size="sm"
                    className={styles.selectTrigger}
                    aria-label="Filter by age bucket"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All buckets</SelectItem>
                    {AGING_BUCKETS.map((b) => (
                      <SelectItem key={b.key} value={b.key}>
                        {b.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {hasAgingFilters ? (
                <button
                  type="button"
                  className={styles.resetButton}
                  onClick={() => {
                    setAgingModule('all')
                    setAgingBucket('all')
                    setAgingPage(1)
                  }}
                >
                  <X size={12} aria-hidden="true" />
                  Reset filters
                </button>
              ) : null}
            </div>
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
              <ReportsContentSkeleton tab="aging" />
            )
          ) : (
            <>
              <div className={styles.kpis}>
                <StatCard
                  icon={<Clock3 size={16} />}
                  label="Open records"
                  value={agingTotals.open}
                  sub="Pending inspections, requests and repairs"
                />
                <StatCard
                  icon={<TriangleAlert size={16} />}
                  label="Delayed"
                  value={agingTotals.delayed}
                  sub={`Older than ${age.thresholdDays} days`}
                  tone={agingTotals.delayed > 0 ? 'bad' : 'ok'}
                />
                <StatCard
                  icon={<Hourglass size={16} />}
                  label="Oldest record"
                  value={
                    <>
                      {agingTotals.oldest}
                      <small className={styles.kpiUnit}> d</small>
                    </>
                  }
                  sub="Days since opened"
                />
                <StatCard
                  icon={<CalendarDays size={16} />}
                  label="Generated"
                  value={
                    <span className={styles.kpiDate}>
                      {new Date(age.generatedAt).toLocaleString('en-PH', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                        timeZone: 'Asia/Manila',
                      })}
                    </span>
                  }
                  sub="Asia/Manila"
                />
              </div>

              <div className={styles.panel}>
                <div className={styles.panelHead}>
                  <div>
                    <h2 className={styles.panelTitle}>
                      Aging summary by workflow
                    </h2>
                    <p className={styles.panelSub}>
                      Open queues split into the assessment&apos;s age buckets.
                    </p>
                  </div>
                  <span className={styles.panelChip}>
                    {agingTotals.open} open
                  </span>
                </div>
                <div className={styles.chartSplit}>
                  <AgingChart summaries={age.summaries} />
                  <div className={styles.tableWrap}>
                    <table className={`${styles.table} ${styles.agingTable}`}>
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
                              {shortBucketLabel(b.label)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {age.summaries.map((summary) => (
                          <tr key={summary.module}>
                            <td>
                              <Link
                                className={styles.tableLink}
                                href={summary.href}
                              >
                                {summary.label}
                                <ArrowUpRight size={12} aria-hidden="true" />
                              </Link>
                            </td>
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
                              <td
                                key={bucket.bucket}
                                className={styles.num}
                                data-empty={bucket.count === 0 || undefined}
                              >
                                {bucket.count}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className={styles.panel}>
                <div className={styles.panelHead}>
                  <div>
                    <h2 className={styles.panelTitle}>Delayed records</h2>
                    <p className={styles.panelSub}>
                      {age.rows.total} matching record
                      {age.rows.total === 1 ? '' : 's'} · page {age.rows.page} of{' '}
                      {age.rows.totalPages}
                    </p>
                  </div>
                  {age.rows.total > 0 ? (
                    <span className={styles.panelChip}>
                      {age.rows.total === 1
                        ? '1 record'
                        : `${age.rows.total} records`}
                    </span>
                  ) : null}
                </div>
                {age.rows.rows.length === 0 ? (
                  <div className={styles.emptyBox}>
                    <PackageSearch size={20} aria-hidden="true" />
                    <p>No records match the selected filters.</p>
                  </div>
                ) : (
                  <div className={styles.tableWrap}>
                    <table className={`${styles.table} ${styles.recordsTable}`}>
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
                            <td>
                              <span className={styles.moduleTag}>
                                {row.moduleLabel}
                              </span>
                            </td>
                            <td>
                              <span
                                className={`${styles.cellText} ${styles.mono}`}
                                title={row.reference || undefined}
                              >
                                {row.reference || '—'}
                              </span>
                            </td>
                            <td>
                              <span
                                className={`${styles.cellText} ${styles.subject}`}
                                title={row.subject || undefined}
                              >
                                {row.subject || '—'}
                              </span>
                            </td>
                            <td>
                              <span
                                className={styles.cellText}
                                title={row.owner || undefined}
                              >
                                {row.owner}
                              </span>
                            </td>
                            <td className={styles.nowrap}>
                              {fmtDate(row.openedAt)}
                            </td>
                            <td className={styles.num}>{row.ageDays}d</td>
                            <td>
                              <span
                                className={styles.status}
                                data-tone={bucketTone(row.bucket)}
                              >
                                {agingBucketLabel(row.bucket)}
                              </span>
                            </td>
                            <td>
                              <span
                                className={styles.status}
                                data-tone={statusTone(row.status)}
                              >
                                {humanize(row.status)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className={styles.panelFooter}>
                  {age.rows.total > PAGE_SIZE ? (
                    <TablePager
                      id="reports-aging"
                      total={age.rows.total}
                      page={age.rows.page}
                      pageSize={PAGE_SIZE}
                      onPageChange={setAgingPage}
                    />
                  ) : (
                    <span className={styles.footerInfo}>
                      Showing all {age.rows.total} record
                      {age.rows.total === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {tab === 'quarterly' && (
        <>
          <div className={styles.toolbar}>
            <div className={styles.toolbarFields}>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Year</span>
                <Select
                  value={String(year)}
                  onValueChange={(value) => setYear(Number(value))}
                >
                  <SelectTrigger
                    size="sm"
                    className={styles.selectTrigger}
                    aria-label="Filter by year"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {yearOptions.map((option) => (
                      <SelectItem key={option} value={String(option)}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
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
              <ReportsContentSkeleton tab="quarterly" />
            )
          ) : (
            <>
              <div className={styles.kpis}>
                <StatCard
                  icon={<FileSpreadsheet size={16} />}
                  label="Documents"
                  value={quarter.totals.documents}
                  sub={`${quarter.year} total`}
                />
                <StatCard
                  icon={<ClipboardList size={16} />}
                  label="PAR"
                  value={quarter.totals.par}
                  sub="> ₱50,000"
                />
                <StatCard
                  icon={<ClipboardList size={16} />}
                  label="ICS"
                  value={quarter.totals.ics}
                  sub="≤ ₱50,000"
                />
                <StatCard
                  icon={<PackageSearch size={16} />}
                  label="Quantity issued"
                  value={quarter.totals.quantity.toLocaleString('en-PH')}
                  sub="Across all documents"
                />
                <StatCard
                  icon={<Wallet size={16} />}
                  label="Amount issued"
                  value={
                    <span className={styles.kpiMoney}>
                      {formatPeso(quarter.totals.amount)}
                    </span>
                  }
                  sub="Snapshot totals"
                />
              </div>

              <div className={styles.twoCol}>
                <div className={styles.panel}>
                  <div className={styles.panelHead}>
                    <div>
                      <h2 className={styles.panelTitle}>
                        Quarter summary — {quarter.year}
                      </h2>
                      <p className={styles.panelSub}>
                        PAR / ICS split per quarter — hover a bar for quantity
                        and amount.
                      </p>
                    </div>
                  </div>
                  <QuarterChart quarters={quarter.quarters} />
                </div>

                <div className={styles.panel}>
                  <div className={styles.panelHead}>
                    <div>
                      <h2 className={styles.panelTitle}>Last 8 quarters</h2>
                      <p className={styles.panelSub}>
                        Issuance documents per quarter — calendar basis.
                      </p>
                    </div>
                  </div>
                  <QuarterTrendChart trend={quarter.trend} />
                </div>
              </div>

              <div className={styles.twoCol}>
                <div className={styles.panel}>
                  <div className={styles.panelHead}>
                    <div>
                      <h2 className={styles.panelTitle}>Top items issued</h2>
                      <p className={styles.panelSub}>
                        Per line — consolidated documents appear once per line.
                      </p>
                    </div>
                  </div>
                  {quarter.topItems.length === 0 ? (
                    <div className={styles.emptyBox}>
                      <PackageSearch size={20} aria-hidden="true" />
                      <p>No items issued in {quarter.year}.</p>
                    </div>
                  ) : (
                    <div className={styles.breakdownSplit}>
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
                                <td>
                                  <span
                                    className={styles.cellText}
                                    title={item.name}
                                  >
                                    {item.name}
                                  </span>
                                </td>
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
                      <BreakdownDonut
                        rows={quarter.topItems.map((item) => ({
                          name: item.name,
                          value: item.quantity,
                        }))}
                        unit="qty"
                      />
                    </div>
                  )}
                </div>

                <div className={styles.panel}>
                  <div className={styles.panelHead}>
                    <div>
                      <h2 className={styles.panelTitle}>
                        Issuance by employee
                      </h2>
                      <p className={styles.panelSub}>
                        Who received accountability documents this year.
                      </p>
                    </div>
                  </div>
                  {quarter.byEmployee.length === 0 ? (
                    <div className={styles.emptyBox}>
                      <PackageSearch size={20} aria-hidden="true" />
                      <p>No employees issued in {quarter.year}.</p>
                    </div>
                  ) : (
                    <div className={styles.breakdownSplit}>
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
                                <td>
                                  <span
                                    className={styles.cellText}
                                    title={item.name}
                                  >
                                    {item.name}
                                  </span>
                                </td>
                                <td className={styles.num}>
                                  {item.documents}
                                </td>
                                <td className={styles.num}>{item.quantity}</td>
                                <td className={styles.num}>
                                  {formatPeso(item.amount)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <BreakdownDonut
                        rows={quarter.byEmployee.map((item) => ({
                          name: item.name,
                          value: item.quantity,
                        }))}
                        unit="qty"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className={styles.panel}>
                <div className={styles.panelHead}>
                  <div>
                    <h2 className={styles.panelTitle}>
                      Issuance by office / department
                    </h2>
                    <p className={styles.panelSub}>
                      Based on the receiving employee&apos;s profile department.
                    </p>
                  </div>
                </div>
                {quarter.byOffice.length === 0 ? (
                  <div className={styles.emptyBox}>
                    <PackageSearch size={20} aria-hidden="true" />
                    <p>No offices issued in {quarter.year}.</p>
                  </div>
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
                            <td>
                              <span
                                className={styles.cellText}
                                title={item.name}
                              >
                                {item.name}
                              </span>
                            </td>
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

      {tab === 'availability' && (
        <>
          {!status ? (
            availability.error ? (
              <ErrorNote message={availability.error} />
            ) : (
              <ReportsContentSkeleton tab="availability" />
            )
          ) : (
            <>
              <div className={styles.kpis}>
                <StatCard
                  icon={<PackageSearch size={16} />}
                  label="Total assets"
                  value={status.total.toLocaleString('en-PH')}
                  sub={`${status.totalUnits.toLocaleString('en-PH')} units on hand`}
                />
                <StatCard
                  icon={<CircleCheck size={16} />}
                  label="Available"
                  value={status.available.toLocaleString('en-PH')}
                  sub={`${status.availablePct}% ready to issue`}
                  tone="ok"
                />
                <StatCard
                  icon={<ClipboardList size={16} />}
                  label="In use"
                  value={status.inUse.toLocaleString('en-PH')}
                  sub="Assigned to a custodian"
                  tone={status.inUse > 0 ? 'warn' : 'ok'}
                />
                <StatCard
                  icon={<TriangleAlert size={16} />}
                  label="Unavailable"
                  value={status.unavailable.toLocaleString('en-PH')}
                  sub="Out of stock, maintenance, retired, or not recorded"
                  tone={status.unavailable > 0 ? 'bad' : 'ok'}
                />
              </div>

              <div className={styles.twoCol}>
                <div className={styles.panel}>
                  <div className={styles.panelHead}>
                    <div>
                      <h2 className={styles.panelTitle}>
                        Status distribution
                      </h2>
                      <p className={styles.panelSub}>
                        Normalized values — case and spacing are ignored.
                      </p>
                    </div>
                  </div>
                  {status.rows.length === 0 ? (
                    <div className={styles.emptyBox}>
                      <PackageSearch size={20} aria-hidden="true" />
                      <p>No assets registered yet.</p>
                    </div>
                  ) : (
                    <AvailabilityDonut
                      rows={status.rows}
                      total={status.total}
                    />
                  )}
                </div>

                <div className={styles.panel}>
                  <div className={styles.panelHead}>
                    <div>
                      <h2 className={styles.panelTitle}>Status breakdown</h2>
                      <p className={styles.panelSub}>
                        Distribution only — the registry stores the current
                        status, so a historical trend is not available.
                      </p>
                    </div>
                  </div>
                  <ul className={styles.statusBanners}>
                    {status.rows.map((row) => {
                      const tone = availabilityTone(row.cls)
                      return (
                        <li
                          key={row.status}
                          className={styles.statusBanner}
                          data-tone={tone}
                        >
                          <span
                            className={styles.statusBannerIcon}
                            data-tone={tone}
                            aria-hidden="true"
                          >
                            <AvailabilityIcon cls={row.cls} />
                          </span>
                          <div className={styles.statusBannerBody}>
                            <span className={styles.statusBannerLabel}>
                              {row.label || availabilityLabel(row.cls)}
                            </span>
                            <span className={styles.statusBannerMeta}>
                              <span className={styles.status} data-tone={tone}>
                                {availabilityLabel(row.cls)}
                              </span>
                              <span>
                                {row.items} item{row.items === 1 ? '' : 's'} ·{' '}
                                {row.units.toLocaleString('en-PH')} unit
                                {row.units === 1 ? '' : 's'}
                              </span>
                            </span>
                            <span
                              className={styles.shareBar}
                              role="img"
                              aria-label={`${row.label || availabilityLabel(row.cls)}: ${row.pct}% of items`}
                            >
                              <span
                                className={styles.shareFill}
                                data-tone={tone}
                                style={{ width: `${row.pct}%` }}
                              />
                            </span>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </section>
  )
}
