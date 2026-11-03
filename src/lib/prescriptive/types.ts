/**
 * Shared types for prescriptive analytics (Objective 5).
 *
 * Everything in this folder is pure and client-safe: the server readers load
 * the raw rows, the rule modules turn them into advisory recommendations, and
 * the UI only renders what the rules produced. No recommendation ever mutates
 * an asset, disposal, request, or stock record.
 */

export type Priority = 'high' | 'medium' | 'low'

export type RecommendationGroupKey =
  | 'replenishment'
  | 'replacement'
  | 'idle'
  | 'consumption'

export interface RecommendationEvidence {
  label: string
  value: string
}

export interface Recommendation {
  /** Stable within one computation — useful as a React key. */
  id: string
  group: RecommendationGroupKey
  /** Machine rule id, e.g. `REPLACE_REPAIR_HEAVY`. */
  rule: string
  title: string
  subject: string
  priority: Priority
  /** Plain-language explanation with the actual numbers. */
  reason: string
  /** What the reader should review or do next (advisory only). */
  action: string
  /** Deep link to the underlying record or module. */
  href: string | null
  evidence: RecommendationEvidence[]
}

export interface RecommendationGroup {
  key: RecommendationGroupKey
  label: string
  description: string
  href: string
  total: number
  rows: Recommendation[]
  /** Extra context such as unmatched history counts. */
  note?: string
}

export interface PrescriptiveCounts {
  total: number
  high: number
  medium: number
  low: number
  replenishment: number
  replacement: number
  idle: number
  consumption: number
}

export interface PrescriptiveOverview {
  generatedAt: string
  counts: PrescriptiveCounts
  groups: RecommendationGroup[]
}

export const EMPTY_COUNTS: PrescriptiveCounts = {
  total: 0,
  high: 0,
  medium: 0,
  low: 0,
  replenishment: 0,
  replacement: 0,
  idle: 0,
  consumption: 0,
}

export function emptyOverview(): PrescriptiveOverview {
  return {
    generatedAt: new Date().toISOString(),
    counts: { ...EMPTY_COUNTS },
    groups: [],
  }
}

/** Sort high → medium → low, then by title for a stable presentation. */
export function priorityRank(priority: Priority): number {
  if (priority === 'high') return 0
  if (priority === 'medium') return 1
  return 2
}

export function sortRecommendations(rows: Recommendation[]): Recommendation[] {
  return [...rows].sort(
    (a, b) =>
      priorityRank(a.priority) - priorityRank(b.priority) ||
      a.title.localeCompare(b.title)
  )
}

export function countRecommendations(
  groups: RecommendationGroup[]
): PrescriptiveCounts {
  const counts: PrescriptiveCounts = { ...EMPTY_COUNTS }
  for (const group of groups) {
    counts[group.key] += group.total
    counts.total += group.total
    for (const row of group.rows) {
      counts[row.priority] += 1
    }
  }
  return counts
}
