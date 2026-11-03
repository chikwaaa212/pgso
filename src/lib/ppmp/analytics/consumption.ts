/**
 * Issuance-history analysis for PPMP quantity suggestions (Objective 5).
 *
 * The matching key is deliberately identical to the PPMP parser's
 * `item_key`: normalize the description to lowercase alphanumerics, then do
 * the same for the unit. That makes the join predictable and auditable — no
 * fuzzy guessing in a procurement quantity.
 */

export interface ConsumptionLine {
  /** Issuance record id. */
  id: string
  docType: string | null
  docNo: string | null
  docDate: string | null
  quantity: number
  description: string
  unit: string | null
  employeeId?: string | null
  employeeName?: string | null
}

export interface ConsumptionYearUsage {
  year: number
  quantity: number
  documents: number
}

export interface ConsumptionEvidence {
  label: string
  value: string
}

export interface ConsumptionItem {
  itemKey: string
  description: string
  unit: string | null
  years: ConsumptionYearUsage[]
  total: number
  /** Mean annual issuance across the inspected window (zeros included). */
  averageAnnual: number
  low: number
  high: number
  usableYears: number
  lastIssuedAt: string | null
  evidence: ConsumptionEvidence[]
}

export interface ConsumptionSuggestion extends ConsumptionItem {
  onHand: number
  /** Suggested annual purchase quantity, on-hand already deducted. */
  qtyLow: number
  qtyBase: number
  qtyHigh: number
  confidence: 'high' | 'medium' | 'low'
  note: string
}

export interface ConsumptionResult {
  years: number[]
  items: ConsumptionItem[]
  suggestions: ConsumptionSuggestion[]
  totalLines: number
  matchedLines: number
  unmatchedLines: number
  onHandMatched: number
}

export interface ConsumptionComparison {
  itemKey: string
  planned: number | null
  suggestedLow: number | null
  suggestedBase: number | null
  suggestedHigh: number | null
  variance: number | null
  variancePct: number | null
  status: 'under' | 'over' | 'aligned' | 'unknown'
  label: string
}

/** Client-safe copy of the parser's header normalization. */
export function normalizeConsumptionText(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

export function normalizeConsumptionUnit(value: unknown): string {
  return normalizeConsumptionText(value)
}

/** Same convention as `parseLineSheet`'s `item_key`. */
export function consumptionKey(
  description: string | null | undefined,
  unit: string | null | undefined
): string {
  return `${normalizeConsumptionText(description)}|${normalizeConsumptionUnit(unit)}`
}

/** Last N fiscal years ending at `now` (oldest → newest). */
export function recentFiscalYears(count = 3, now: Date = new Date()): number[] {
  const safe = Math.max(1, Math.min(10, Math.floor(count) || 1))
  const end = now.getFullYear()
  return Array.from({ length: safe }, (_, i) => end - safe + 1 + i)
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function safeQty(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function isoDate(value: string | null | undefined): string | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/**
 * Aggregate issuance lines into per-item, per-year quantities.
 *
 * Unmatched lines are counted rather than guessed: a line with a blank
 * description cannot be joined to a PPMP item, and hiding it would make the
 * suggestion look more complete than it is.
 */
export function aggregateConsumption(
  lines: ConsumptionLine[],
  years: number[]
): {
  items: ConsumptionItem[]
  totalLines: number
  matchedLines: number
  unmatchedLines: number
} {
  const window = [...new Set(years.filter((y) => Number.isFinite(y)))].sort(
    (a, b) => a - b
  )
  const byKey = new Map<
    string,
    {
      description: string
      unit: string | null
      yearQty: Map<number, number>
      yearDocs: Map<number, Set<string>>
      lastIssuedAt: string | null
      docs: Set<string>
    }
  >()

  let matchedLines = 0
  let unmatchedLines = 0
  for (const line of lines) {
    const description = String(line.description ?? '').trim()
    const key = consumptionKey(description, line.unit)
    if (!description || key === '|') {
      unmatchedLines += 1
      continue
    }
    const when = isoDate(line.docDate)
    const year = when ? new Date(when).getUTCFullYear() : null
    if (year === null || !window.includes(year)) {
      unmatchedLines += 1
      continue
    }
    const qty = safeQty(line.quantity)
    if (qty <= 0) {
      unmatchedLines += 1
      continue
    }
    matchedLines += 1
    const entry = byKey.get(key) ?? {
      description,
      unit: line.unit ?? null,
      yearQty: new Map<number, number>(),
      yearDocs: new Map<number, Set<string>>(),
      lastIssuedAt: null,
      docs: new Set<string>(),
    }
    entry.yearQty.set(year, (entry.yearQty.get(year) ?? 0) + qty)
    const docRef =
      [line.docType, line.docNo].filter(Boolean).join(' ') ||
      `record ${line.id.slice(0, 8)}`
    const docs = entry.yearDocs.get(year) ?? new Set<string>()
    docs.add(docRef)
    entry.yearDocs.set(year, docs)
    entry.docs.add(docRef)
    if (when && (!entry.lastIssuedAt || when > entry.lastIssuedAt)) {
      entry.lastIssuedAt = when
    }
    byKey.set(key, entry)
  }

  const items: ConsumptionItem[] = []
  for (const [itemKey, entry] of byKey) {
    const yearUsage: ConsumptionYearUsage[] = window.map((year) => ({
      year,
      quantity: round2(entry.yearQty.get(year) ?? 0),
      documents: entry.yearDocs.get(year)?.size ?? 0,
    }))
    const total = round2(
      yearUsage.reduce((sum, y) => sum + y.quantity, 0)
    )
    if (total <= 0) continue
    const usable = yearUsage.filter((y) => y.quantity > 0)
    const averageAnnual = round2(total / Math.max(1, window.length))
    const low = round2(Math.min(...usable.map((y) => y.quantity)))
    const high = round2(Math.max(...usable.map((y) => y.quantity)))
    const evidence: ConsumptionEvidence[] = yearUsage.map((y) => ({
      label: `FY ${y.year}`,
      value: `${y.quantity.toLocaleString('en-PH')} issued across ${y.documents} document${y.documents === 1 ? '' : 's'}`,
    }))
    const docList = [...entry.docs].slice(0, 6)
    if (docList.length > 0) {
      evidence.push({
        label: 'References',
        value:
          docList.join(', ') +
          (entry.docs.size > docList.length ? ` +${entry.docs.size - docList.length} more` : ''),
      })
    }
    items.push({
      itemKey,
      description: entry.description,
      unit: entry.unit,
      years: yearUsage,
      total,
      averageAnnual,
      low,
      high,
      usableYears: usable.length,
      lastIssuedAt: entry.lastIssuedAt,
      evidence,
    })
  }
  items.sort((a, b) => b.total - a.total || a.description.localeCompare(b.description))
  return { items, totalLines: lines.length, matchedLines, unmatchedLines }
}

/**
 * Turn consumption history into annual purchase suggestions.
 *
 * Bands come from observed annual issuance (min/mean/max). On-hand stock is
 * deducted once from each band because it already covers part of next year's
 * need. Confidence is low for a single usable year, medium for two, high for
 * the full three-year window.
 */
export function buildConsumptionSuggestions(
  items: ConsumptionItem[],
  onHandByKey: Map<string, number> = new Map(),
  years?: number[]
): ConsumptionSuggestion[] {
  const windowYears = years && years.length > 0 ? years.length : 3
  const suggestions = items.map((item) => {
    const onHand = round2(Math.max(0, onHandByKey.get(item.itemKey) ?? 0))
    const qtyLow = round2(Math.max(0, item.low - onHand))
    const qtyBase = round2(
      Math.max(0, (item.total / Math.max(1, windowYears)) - onHand)
    )
    const qtyHigh = round2(Math.max(0, item.high - onHand))
    const confidence: ConsumptionSuggestion['confidence'] =
      item.usableYears >= 3 ? 'high' : item.usableYears === 2 ? 'medium' : 'low'
    const note =
      item.usableYears < 2
        ? 'Only one usable fiscal year of issuance history — treat this as a starting point and confirm with the end-user.'
        : onHand > 0
          ? `${onHand.toLocaleString('en-PH')} ${item.unit ?? 'unit(s)'} on hand was deducted from the suggestion.`
          : 'No matching on-hand stock was found, so the full suggested quantity remains.'
    return {
      ...item,
      onHand,
      qtyLow,
      qtyBase,
      qtyHigh,
      confidence,
      note,
    }
  })
  return suggestions.sort(
    (a, b) => b.qtyBase - a.qtyBase || a.description.localeCompare(b.description)
  )
}

/** Compare a planning quantity against the consumption suggestion. */
export function compareToPlanned(
  planned: number | null,
  suggestion: Pick<ConsumptionSuggestion, 'itemKey' | 'qtyLow' | 'qtyBase' | 'qtyHigh'> | null
): ConsumptionComparison {
  if (!suggestion) {
    return {
      itemKey: '',
      planned,
      suggestedLow: null,
      suggestedBase: null,
      suggestedHigh: null,
      variance: null,
      variancePct: null,
      status: 'unknown',
      label: 'No matching issuance history',
    }
  }
  if (planned === null || !Number.isFinite(planned)) {
    return {
      itemKey: suggestion.itemKey,
      planned,
      suggestedLow: suggestion.qtyLow,
      suggestedBase: suggestion.qtyBase,
      suggestedHigh: suggestion.qtyHigh,
      variance: null,
      variancePct: null,
      status: 'unknown',
      label: 'Planned quantity is missing',
    }
  }
  const base = suggestion.qtyBase
  const variance = round2(planned - base)
  const variancePct = base > 0 ? round2((variance / base) * 100) : null
  const status =
    base > 0 && planned < base * 0.8
      ? 'under'
      : base > 0 && planned > base * 1.2
        ? 'over'
        : 'aligned'
  const label =
    status === 'under'
      ? `Under-planned by ${Math.abs(variance).toLocaleString('en-PH')} (${Math.abs(variancePct ?? 0)}%)`
      : status === 'over'
        ? `Over-planned by ${variance.toLocaleString('en-PH')} (${variancePct ?? 0}%)`
        : 'Aligned with issuance history'
  return {
    itemKey: suggestion.itemKey,
    planned,
    suggestedLow: suggestion.qtyLow,
    suggestedBase: suggestion.qtyBase,
    suggestedHigh: suggestion.qtyHigh,
    variance,
    variancePct,
    status,
    label,
  }
}
