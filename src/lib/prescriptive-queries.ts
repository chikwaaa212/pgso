import 'server-only'

import prisma from '@/lib/prisma'
import { getPersonnelScope, type PersonnelScope } from '@/lib/personnel-scope'
import { withScopedCache } from '@/lib/personnel-cache'
import {
  aggregateConsumption,
  buildConsumptionSuggestions,
  consumptionKey,
  recentFiscalYears,
  type ConsumptionLine,
  type ConsumptionResult,
  type ConsumptionSuggestion,
} from '@/lib/ppmp/analytics/consumption'
import { PRESCRIPTIVE_CONFIG } from '@/lib/prescriptive/config'
import {
  buildIdleRecommendations,
  type PrescriptiveRequest,
  type PrescriptiveRequestItem,
} from '@/lib/prescriptive/idle'
import {
  buildReplacementRecommendations,
  summarizeRepairs,
  type PrescriptiveAsset,
  type RepairLike,
} from '@/lib/prescriptive/replacement'
import {
  buildReplenishmentRecommendations,
  type PrescriptiveInventoryItem,
} from '@/lib/prescriptive/replenishment'
import {
  countRecommendations,
  sortRecommendations,
  type PrescriptiveOverview,
  type Recommendation,
  type RecommendationGroup,
} from '@/lib/prescriptive/types'

export type PrescriptivePortal = 'personnel' | 'super-admin'

const TTL = 60

function portalBase(portal: PrescriptivePortal): string {
  return portal === 'super-admin' ? '/super-admin' : '/personnel'
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function cents(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

function emptyConsumption(years: number[]): ConsumptionResult {
  return {
    years,
    items: [],
    suggestions: [],
    totalLines: 0,
    matchedLines: 0,
    unmatchedLines: 0,
    onHandMatched: 0,
  }
}

interface IssuanceRow {
  id: string
  doc_type: string
  doc_no: string | null
  doc_date: Date | null
  created_at: Date | null
  quantity: number
  issuance_data: unknown
  asset_id: string | null
  inventory_id: string | null
}

function issuanceLines(row: IssuanceRow): ConsumptionLine[] {
  const data = (row.issuance_data ?? {}) as Record<string, unknown>
  const lines = Array.isArray(data.lines) ? data.lines : []
  const docDate = toIso(row.doc_date ?? row.created_at)
  if (lines.length > 0) {
    const out: ConsumptionLine[] = []
    for (const raw of lines) {
      if (!raw || typeof raw !== 'object') continue
      const line = raw as Record<string, unknown>
      const description = String(line.description ?? '').trim()
      if (!description) continue
      const qty = Number(line.quantity)
      out.push({
        id: row.id,
        docType: row.doc_type,
        docNo: row.doc_no,
        docDate,
        quantity: Number.isFinite(qty) ? qty : row.quantity,
        description,
        unit: typeof line.unit === 'string' ? line.unit : null,
      })
    }
    if (out.length > 0) return out
  }
  // Legacy single-line records: the row columns and header description are
  // the only available fallback, so use them rather than dropping history.
  const description = String(data.description ?? '').trim()
  if (!description) return []
  return [
    {
      id: row.id,
      docType: row.doc_type,
      docNo: row.doc_no,
      docDate,
      quantity: row.quantity,
      description,
      unit: typeof data.unit === 'string' ? data.unit : null,
    },
  ]
}

async function loadConsumption(
  scope: PersonnelScope,
  years: number[]
): Promise<ConsumptionResult> {
  if (scope.isEmpty || !scope.userId) return emptyConsumption(years)
  const start = new Date(Date.UTC(years[0], 0, 1))
  const owner = scope.isSuperAdmin ? {} : { created_by: scope.userId }
  const [issuances, stock] = await Promise.all([
    prisma.issuanceRecord
      .findMany({
        where: {
          ...owner,
          OR: [
            { doc_date: { gte: start } },
            { doc_date: null, created_at: { gte: start } },
          ],
        },
        orderBy: { created_at: 'desc' },
        take: 10_000,
        select: {
          id: true,
          doc_type: true,
          doc_no: true,
          doc_date: true,
          created_at: true,
          quantity: true,
          issuance_data: true,
          asset_id: true,
          inventory_id: true,
        },
      })
      .catch(() => [] as IssuanceRow[]),
    prisma.inventoryItem
      .findMany({ select: { item_name: true, unit: true, quantity: true } })
      .catch(() => [] as { item_name: string; unit: string | null; quantity: number }[]),
  ])

  const onHand = new Map<string, number>()
  for (const row of stock) {
    const key = consumptionKey(row.item_name, row.unit)
    onHand.set(key, (onHand.get(key) ?? 0) + Math.max(0, row.quantity))
  }
  const lines = (issuances as IssuanceRow[]).flatMap(issuanceLines)
  const aggregated = aggregateConsumption(lines, years)
  const suggestions = buildConsumptionSuggestions(aggregated.items, onHand, years)
  return {
    years,
    items: aggregated.items,
    suggestions,
    totalLines: aggregated.totalLines,
    matchedLines: aggregated.matchedLines,
    unmatchedLines: aggregated.unmatchedLines,
    onHandMatched: suggestions.filter((s) => s.onHand > 0).length,
  }
}

/**
 * Issuance-history suggestions for the PPMP planning page.
 * Scoped exactly like the reports: personnel see their own issuances,
 * super admins see all.
 */
export async function getIssuanceConsumption(
  years: number[] = recentFiscalYears(PRESCRIPTIVE_CONFIG.consumptionYears)
): Promise<ConsumptionResult> {
  const scope = await getPersonnelScope()
  if (scope.isEmpty || !scope.userId) return emptyConsumption(years)
  return withScopedCache(
    'personnel:consumption',
    TTL,
    () => loadConsumption(scope, years),
    { years: years.join(',') }
  )
}

function consumptionRecommendations(
  suggestions: ConsumptionSuggestion[],
  portal: PrescriptivePortal
): Recommendation[] {
  return suggestions
    .filter((s) => s.qtyBase > 0 || s.qtyHigh > 0)
    .map((s) => {
      const unit = s.unit ?? 'unit'
      const confidenceLabel =
        s.confidence === 'high'
          ? 'High confidence (3 usable years)'
          : s.confidence === 'medium'
            ? 'Medium confidence (2 usable years)'
            : 'Low confidence (1 usable year)'
      return {
        id: `consumption:${s.itemKey}`,
        group: 'consumption' as const,
        rule: 'CONSUMPTION_HISTORY',
        title: `Suggested annual quantity — ${s.description}`,
        subject: s.description,
        priority: s.confidence === 'low' ? 'low' : 'medium',
        reason:
          `${s.total.toLocaleString('en-PH')} ${unit} issued across ${s.years.length} fiscal year(s), ` +
          `averaging ${(s.total / Math.max(1, s.years.length)).toLocaleString('en-PH')} ${unit}/year. ` +
          `After ${s.onHand.toLocaleString('en-PH')} ${unit} on hand, the suggested annual purchase is ` +
          `${s.qtyBase.toLocaleString('en-PH')} ${unit} (range ${s.qtyLow.toLocaleString('en-PH')}–${s.qtyHigh.toLocaleString('en-PH')}).`,
        action:
          'Open PPMP planning and use the consumption method, or compare this suggestion with the draft quantity. Confirm with the end-user before submission.',
        href: `${portalBase(portal)}/ppmp/planning`,
        evidence: [
          ...s.evidence,
          { label: 'On hand', value: `${s.onHand.toLocaleString('en-PH')} ${unit}` },
          {
            label: 'Suggested annual qty',
            value: `${s.qtyBase.toLocaleString('en-PH')} ${unit} (${s.qtyLow.toLocaleString('en-PH')}–${s.qtyHigh.toLocaleString('en-PH')})`,
          },
          { label: 'Confidence', value: confidenceLabel },
        ],
      }
    })
}

function group(
  key: RecommendationGroup['key'],
  label: string,
  description: string,
  href: string,
  rows: Recommendation[],
  maxRows: number,
  note?: string
): RecommendationGroup {
  const sorted = sortRecommendations(rows)
  return {
    key,
    label,
    description,
    href,
    total: sorted.length,
    rows: sorted.slice(0, maxRows),
    note,
  }
}

/**
 * Build every recommendation group for one portal.
 *
 * Scope rules mirror `personnel-scope.ts`:
 * - assets + inventory are shared pools;
 * - repairs and issuances are owned rows for personnel, all rows for admins;
 * - pending new-assignment requests are the demand signal.
 */
export async function getPrescriptiveOverview(
  portal: PrescriptivePortal = 'personnel'
): Promise<PrescriptiveOverview> {
  const scope = await getPersonnelScope()
  if (scope.isEmpty || !scope.userId) {
    return { generatedAt: new Date().toISOString(), counts: countRecommendations([]), groups: [] }
  }
  return withScopedCache(
    'personnel:recommendations',
    TTL,
    async () => {
      const base = portalBase(portal)
      const years = recentFiscalYears(PRESCRIPTIVE_CONFIG.consumptionYears)
      const [assetRows, inventoryRows, consumption, requestRows] = await Promise.all([
        prisma.asset
          .findMany({
            orderBy: { created_at: 'desc' },
            take: 3000,
            select: {
              id: true,
              property_number: true,
              description: true,
              category: true,
              account_code: true,
              account_title: true,
              condition: true,
              status: true,
              date_acquired: true,
              created_at: true,
              total_cost: true,
              unit_cost: true,
              quantity: true,
              assigned_to: true,
              end_user: true,
              location: true,
            },
          })
          .catch(() => []),
        prisma.inventoryItem
          .findMany({
            orderBy: { quantity: 'asc' },
            take: 1000,
            select: {
              id: true,
              item_name: true,
              quantity: true,
              unit: true,
              reorder_threshold: true,
              category: true,
              account_code: true,
            },
          })
          .catch(() => []),
        loadConsumption(scope, years),
        prisma.request
          .findMany({
            where: { status: 'pending', request_type: 'new_assignment' },
            orderBy: { date_requested: 'desc' },
            take: 300,
            select: {
              id: true,
              employee_id: true,
              date_requested: true,
              items: {
                select: {
                  description: true,
                  quantity: true,
                  asset_id: true,
                },
              },
            },
          })
          .catch(() => []),
      ])

      const assetIds = assetRows.map((a) => a.id)
      const employeeIds = [
        ...new Set([
          ...assetRows.map((a) => a.assigned_to).filter((v): v is string => Boolean(v)),
          ...requestRows.map((r) => r.employee_id),
        ]),
      ]
      const repairCutoff = new Date(
        Date.now() - PRESCRIPTIVE_CONFIG.repairWindowDays * 2 * 86_400_000
      )
      const repairOwner = scope.isSuperAdmin ? {} : { created_by: scope.userId }
      const [repairRows, disposalDocs, profiles] = await Promise.all([
        assetIds.length === 0
          ? Promise.resolve([])
          : prisma.repair
              .findMany({
                where: {
                  ...repairOwner,
                  asset_id: { in: assetIds },
                  created_at: { gte: repairCutoff },
                },
                select: {
                  asset_id: true,
                  repair_date: true,
                  status: true,
                  cost: true,
                },
              })
              .catch(() => []),
        assetIds.length === 0
          ? Promise.resolve([])
          : prisma.document
              .findMany({
                where: {
                  related_asset_id: { in: assetIds },
                  OR: [
                    { document_type: { contains: 'dispos', mode: 'insensitive' } },
                    { document_type: { contains: 'condemn', mode: 'insensitive' } },
                    { document_type: { contains: 'unservice', mode: 'insensitive' } },
                    { document_type: { contains: 'retire', mode: 'insensitive' } },
                  ],
                },
                select: { related_asset_id: true },
              })
              .catch(() => []),
        employeeIds.length === 0
          ? Promise.resolve([])
          : prisma.profile
              .findMany({
                where: { id: { in: employeeIds } },
                select: { id: true, full_name: true, office: true },
              })
              .catch(() => []),
      ])

      const names = new Map(
        profiles.map((p) => [p.id, { name: p.full_name, office: p.office }])
      )

      const assets: PrescriptiveAsset[] = assetRows.map((a) => ({
        id: a.id,
        propertyNumber: a.property_number,
        description: a.description,
        category: a.category,
        accountCode: a.account_code,
        accountTitle: a.account_title,
        condition: a.condition,
        status: a.status,
        dateAcquired: toIso(a.date_acquired),
        createdAt: toIso(a.created_at),
        recordedCostCents:
          cents(a.total_cost) ??
          (a.unit_cost !== null && a.quantity !== null
            ? cents(Number(a.unit_cost) * a.quantity)
            : cents(a.unit_cost)),
        quantity: a.quantity,
        assignedTo: a.assigned_to,
        assignedToName: a.assigned_to
          ? names.get(a.assigned_to)?.name ?? a.end_user ?? null
          : a.end_user ?? null,
        location: a.location,
      }))

      const repairs: RepairLike[] = repairRows.map((r) => ({
        assetId: r.asset_id,
        repairDate: toIso(r.repair_date),
        status: r.status,
        costCents: cents(r.cost),
      }))
      const repairsByAsset = summarizeRepairs(repairs)
      const documented = new Set(
        disposalDocs
          .map((d) => d.related_asset_id)
          .filter((v): v is string => Boolean(v))
      )

      const requests: PrescriptiveRequest[] = requestRows.map((r) => {
        const profile = names.get(r.employee_id)
        const items: PrescriptiveRequestItem[] = r.items.map((i) => ({
          description: i.description,
          quantity: i.quantity,
          // RequestItem has no unit column; the label omits it rather than guessing.
          unit: null,
          assetId: i.asset_id,
        }))
        return {
          id: r.id,
          employeeId: r.employee_id,
          employeeName: profile?.name ?? null,
          office: profile?.office ?? null,
          dateRequested: toIso(r.date_requested),
          items,
        }
      })

      const inventory: PrescriptiveInventoryItem[] = inventoryRows.map((i) => ({
        id: i.id,
        itemName: i.item_name,
        quantity: i.quantity,
        unit: i.unit,
        reorderThreshold: i.reorder_threshold,
        category: i.category,
        accountCode: i.account_code,
      }))
      const consumptionByKey = new Map(
        consumption.suggestions.map((s) => [s.itemKey, s])
      )
      const replenishment = buildReplenishmentRecommendations(
        inventory,
        consumptionByKey,
        base
      )

      const replacementRows = buildReplacementRecommendations(
        assets,
        repairsByAsset,
        documented,
        base
      )
      const idleRows = buildIdleRecommendations(assets, requests, base)
      const consumptionRows = consumptionRecommendations(
        consumption.suggestions,
        portal
      )

      const maxRows = PRESCRIPTIVE_CONFIG.maxRowsPerGroup
      const allRows = [
        ...replenishment.rows.map((r) => r.recommendation),
        ...replacementRows,
        ...idleRows,
        ...consumptionRows,
      ]
      const counts = {
        total: allRows.length,
        high: allRows.filter((r) => r.priority === 'high').length,
        medium: allRows.filter((r) => r.priority === 'medium').length,
        low: allRows.filter((r) => r.priority === 'low').length,
        replenishment: replenishment.rows.length,
        replacement: replacementRows.length,
        idle: idleRows.length,
        consumption: consumptionRows.length,
      }
      const groups: RecommendationGroup[] = [
        group(
          'replenishment',
          'Replenishment',
          'Stock at or below its reorder threshold, with a suggested order quantity derived from issuance history and on-hand stock.',
          `${base}/inventory`,
          replenishment.rows.map((r) => r.recommendation),
          maxRows,
          `${replenishment.matchedHistory} item(s) matched 3-year issuance history · ${replenishment.withoutHistory} used a labelled threshold fallback.`
        ),
        group(
          'replacement',
          'Replacement & disposal',
          'Assets that are unserviceable, repair-heavy, or retired without disposal paperwork. Advisory only — no status is changed.',
          `${base}/assets`,
          replacementRows,
          maxRows
        ),
        group(
          'idle',
          'Idle & reassignment',
          'Available assets idle beyond 180 days, pending-request matches, and duplicate custody. Review before transferring.',
          `${base}/assets`,
          idleRows,
          maxRows
        ),
        group(
          'consumption',
          'PPMP quantity signals',
          'Annual purchase quantities suggested by actual issuance history over the last three fiscal years.',
          `${base}/ppmp/planning`,
          consumptionRows,
          maxRows,
          `${consumption.totalLines.toLocaleString('en-PH')} issuance line(s) inspected · ${consumption.matchedLines.toLocaleString('en-PH')} matched · ${consumption.unmatchedLines.toLocaleString('en-PH')} unmatched or outside the window.`
        ),
      ]

      return {
        generatedAt: new Date().toISOString(),
        counts,
        groups,
      }
    },
    { portal }
  )
}

/** Dashboard card count — the same cached overview, reduced to a number. */
export async function getRecommendationCount(
  portal: PrescriptivePortal = 'personnel'
): Promise<number> {
  const overview = await getPrescriptiveOverview(portal)
  return overview.counts.total
}
