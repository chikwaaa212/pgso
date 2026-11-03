/**
 * Pure reporting helpers (client-safe, no server imports).
 *
 * Objective 4 descriptive analytics:
 * - aging buckets / delayed threshold
 * - calendar-quarter maths for the quarterly issuance report
 * - asset-condition normalization
 *
 * Everything here is deterministic and unit-tested in
 * `src/__tests__/reporting.test.ts`.
 */

/** A record is delayed once its age exceeds this many whole days. */
export const DELAYED_THRESHOLD_DAYS = 7

export type AgingBucket = '0-3' | '4-7' | '8-14' | '15+'

export interface AgingBucketDef {
  key: AgingBucket
  label: string
  min: number
  /** Inclusive upper bound; `null` means no ceiling (15+). */
  max: number | null
}

/** Ordered buckets used by every aging report and its XLSX export. */
export const AGING_BUCKETS: readonly AgingBucketDef[] = [
  { key: '0-3', label: '0–3 days', min: 0, max: 3 },
  { key: '4-7', label: '4–7 days', min: 4, max: 7 },
  { key: '8-14', label: '8–14 days', min: 8, max: 14 },
  { key: '15+', label: '15+ days', min: 15, max: null },
] as const

export type ReportModule = 'inspections' | 'requests' | 'repairs'

export const REPORT_MODULES: readonly {
  key: ReportModule
  label: string
  href: string
}[] = [
  { key: 'inspections', label: 'Pending inspections', href: '/inspections' },
  { key: 'requests', label: 'Pending requests', href: '/requests' },
  { key: 'repairs', label: 'Open repairs', href: '/repairs' },
] as const

/** Whole elapsed days, floored at zero. Invalid dates count as zero. */
export function ageInDays(
  value: string | Date | null | undefined,
  now: Date | number = Date.now()
): number {
  if (value === null || value === undefined) return 0
  const from = value instanceof Date ? value.getTime() : Date.parse(value)
  const to = now instanceof Date ? now.getTime() : now
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0
  return Math.max(0, Math.floor((to - from) / 86_400_000))
}

/** Bucket for a whole-day age. Boundaries are inclusive. */
export function agingBucket(days: number): AgingBucket {
  const d = Number.isFinite(days) ? Math.max(0, Math.floor(days)) : 0
  if (d <= 3) return '0-3'
  if (d <= 7) return '4-7'
  if (d <= 14) return '8-14'
  return '15+'
}

/** True once the age exceeds the uniform 7-day threshold. */
export function isDelayed(days: number): boolean {
  return Number.isFinite(days) && days > DELAYED_THRESHOLD_DAYS
}

export function isAgingBucket(value: unknown): value is AgingBucket {
  return AGING_BUCKETS.some((b) => b.key === value)
}

export function parseAgingBucket(value: unknown): AgingBucket | 'all' {
  return isAgingBucket(value) ? value : 'all'
}

export function isReportModule(value: unknown): value is ReportModule {
  return REPORT_MODULES.some((m) => m.key === value)
}

export function parseReportModule(value: unknown): ReportModule {
  return isReportModule(value) ? value : 'inspections'
}

/** Human label for a bucket key (falls back to the raw key). */
export function agingBucketLabel(bucket: string): string {
  return AGING_BUCKETS.find((b) => b.key === bucket)?.label ?? bucket
}

// ─── Calendar quarters (Jan–Mar = Q1; no fiscal offset) ─────────────────────

export type Quarter = 1 | 2 | 3 | 4

export interface QuarterRef {
  year: number
  quarter: Quarter
}

/** Calendar quarter for a date in local (Asia/Manila) terms. */
export function quarterOf(date: Date = new Date()): Quarter {
  return (Math.floor(date.getMonth() / 3) + 1) as Quarter
}

export function quarterRefOf(date: Date = new Date()): QuarterRef {
  return { year: date.getFullYear(), quarter: quarterOf(date) }
}

/** First instant of the quarter in local time. */
export function quarterStart({ year, quarter }: QuarterRef): Date {
  return new Date(year, (quarter - 1) * 3, 1, 0, 0, 0, 0)
}

/** First instant of the *next* quarter (exclusive upper bound). */
export function quarterEnd({ year, quarter }: QuarterRef): Date {
  return new Date(year, quarter * 3, 1, 0, 0, 0, 0)
}

export function quarterKey({ year, quarter }: QuarterRef): string {
  return `${year}-Q${quarter}`
}

export function quarterLabel({ year, quarter }: QuarterRef): string {
  return `Q${quarter} ${year}`
}

/** The `count` most recent quarters, oldest → newest, ending at `from`. */
export function lastQuarters(count: number, from: Date = new Date()): QuarterRef[] {
  const safeCount = Math.max(1, Math.min(40, Math.floor(count) || 1))
  const refs: QuarterRef[] = []
  let year = from.getFullYear()
  let quarter = quarterOf(from)
  for (let i = 0; i < safeCount; i++) {
    refs.push({ year, quarter })
    quarter = (quarter === 1 ? 4 : quarter - 1) as Quarter
    if (quarter === 4) year -= 1
  }
  return refs.reverse()
}

/** All four calendar quarters for a year (used by the yearly report). */
export function quartersForYear(year: number): QuarterRef[] {
  return [1, 2, 3, 4].map((quarter) => ({ year, quarter: quarter as Quarter }))
}

/** Parse a year query value, clamped to a sane range. */
export function parseReportYear(value: unknown, fallback = new Date().getFullYear()): number {
  const n = Math.floor(Number(value))
  if (!Number.isFinite(n) || n < 2000 || n > 2100) return fallback
  return n
}

// ─── Asset conditions ──────────────────────────────────────────────────────

export const UNSPECIFIED_CONDITION = 'unspecified'

/**
 * Trim + lowercase the stored condition so `Serviceable`, ` serviceable `
 * and `SERVICEABLE` share one bucket. Blank/null → `unspecified`.
 */
export function normalizeCondition(value: string | null | undefined): string {
  const text = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
  return text || UNSPECIFIED_CONDITION
}

/** Display label for a normalized condition key. */
export function conditionLabel(value: string | null | undefined): string {
  const key = normalizeCondition(value)
  if (key === UNSPECIFIED_CONDITION) return 'Unspecified'
  return key.replace(/\b[a-z]/g, (c) => c.toUpperCase())
}

export type ConditionClass = 'serviceable' | 'unserviceable' | 'unspecified'

const UNSERVICEABLE_HINTS = [
  'unservice',
  'not service',
  'non service',
  'non-service',
  'nonfunctional',
  'non functional',
  'non-functional',
  'damaged',
  'broken',
  'defective',
  'poor',
  'unusable',
  'not usable',
  'repair',
  'condemned',
  'disposed',
]

const SERVICEABLE_HINTS = [
  'service',
  'good',
  'functional',
  'working',
  'excellent',
  'fair',
  'usable',
  'operational',
  'new',
]

/**
 * Classify a stored condition for the serviceable/unserviceable headline.
 * Unknown non-blank values stay `unspecified` rather than being guessed.
 */
export function classifyCondition(value: string | null | undefined): ConditionClass {
  const key = normalizeCondition(value)
  if (key === UNSPECIFIED_CONDITION) return 'unspecified'
  if (UNSERVICEABLE_HINTS.some((hint) => key.includes(hint))) return 'unserviceable'
  if (SERVICEABLE_HINTS.some((hint) => key.includes(hint))) return 'serviceable'
  return 'unspecified'
}

/** Percentage helper (rounded, 0 when the denominator is 0). */
export function percentage(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0
  return Math.round((part / total) * 100)
}
