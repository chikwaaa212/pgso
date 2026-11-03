/**
 * Replacement / disposal recommendations.
 *
 * Rules are deterministic and evidence-carrying. Age is shown as context only;
 * we never invent a category useful life. Disposal is always a review
 * suggestion — this module cannot change an asset status.
 */

import { ageInDays, classifyCondition } from '@/lib/reporting'
import { PRESCRIPTIVE_CONFIG, type PrescriptiveConfig } from './config'
import type { Recommendation } from './types'

export interface PrescriptiveAsset {
  id: string
  propertyNumber: string | null
  description: string | null
  category: string | null
  accountCode: string | null
  accountTitle: string | null
  condition: string | null
  status: string | null
  dateAcquired: string | null
  createdAt: string | null
  recordedCostCents: number | null
  quantity: number | null
  assignedTo: string | null
  assignedToName: string | null
  location: string | null
}

export interface RepairLike {
  assetId: string
  repairDate: string | null
  status: string | null
  costCents: number | null
}

export interface AssetRepairHistory {
  assetId: string
  countInWindow: number
  spendInWindowCents: number
  openCount: number
  lastRepairDate: string | null
}

export const OPEN_REPAIR_STATUSES = new Set(['pending', 'in_progress'])

/** Aggregate repair rows for the replacement rules. Pure. */
export function summarizeRepairs(
  repairs: RepairLike[],
  now: Date = new Date(),
  config: PrescriptiveConfig = PRESCRIPTIVE_CONFIG
): Map<string, AssetRepairHistory> {
  const cutoff = now.getTime() - config.repairWindowDays * 86_400_000
  const out = new Map<string, AssetRepairHistory>()
  for (const repair of repairs) {
    const entry = out.get(repair.assetId) ?? {
      assetId: repair.assetId,
      countInWindow: 0,
      spendInWindowCents: 0,
      openCount: 0,
      lastRepairDate: null,
    }
    const when = repair.repairDate ? Date.parse(repair.repairDate) : NaN
    const inWindow = Number.isFinite(when) && when >= cutoff
    if (inWindow) {
      entry.countInWindow += 1
      if (Number.isFinite(repair.costCents ?? NaN)) {
        entry.spendInWindowCents += Math.max(0, repair.costCents ?? 0)
      }
    }
    if (OPEN_REPAIR_STATUSES.has((repair.status ?? '').toLowerCase())) {
      entry.openCount += 1
    }
    if (
      repair.repairDate &&
      (!entry.lastRepairDate || repair.repairDate > entry.lastRepairDate)
    ) {
      entry.lastRepairDate = repair.repairDate
    }
    out.set(repair.assetId, entry)
  }
  return out
}

function peso(cents: number | null): string {
  if (cents === null || !Number.isFinite(cents)) return 'not recorded'
  const abs = Math.abs(Math.round(cents))
  const sign = cents < 0 ? '-' : ''
  return `${sign}₱${Math.floor(abs / 100).toLocaleString('en-PH')}.${String(abs % 100).padStart(2, '0')}`
}

function assetLabel(asset: PrescriptiveAsset): string {
  return (
    asset.propertyNumber?.trim() ||
    asset.description?.trim() ||
    asset.accountTitle?.trim() ||
    `Asset ${asset.id.slice(0, 8)}`
  )
}

function assetsHref(base: string, asset: PrescriptiveAsset): string {
  const q = asset.propertyNumber?.trim() || asset.description?.trim() || ''
  return q ? `${base}/assets?q=${encodeURIComponent(q)}` : `${base}/assets`
}

function ageEvidence(asset: PrescriptiveAsset, now: Date): string {
  const source = asset.dateAcquired ?? asset.createdAt
  if (!source) return 'Acquisition date not recorded'
  const days = ageInDays(source, now)
  return `${days.toLocaleString('en-PH')} days since ${asset.dateAcquired ? 'acquisition' : 'registration'} (context only)`
}

/**
 * Build replacement/disposal recommendations.
 *
 * Precedence per asset:
 * - retired without disposal paperwork → documentation check (low)
 * - unserviceable with an open repair → compare repair vs replacement (high)
 * - unserviceable without an open repair → disposal review (high)
 * - otherwise repair-heavy → replacement review (medium)
 */
export function buildReplacementRecommendations(
  assets: PrescriptiveAsset[],
  repairsByAsset: Map<string, AssetRepairHistory>,
  disposalDocumentAssetIds: Set<string> = new Set(),
  portalBase = '/personnel',
  now: Date = new Date(),
  config: PrescriptiveConfig = PRESCRIPTIVE_CONFIG
): Recommendation[] {
  const out: Recommendation[] = []
  for (const asset of assets) {
    const history = repairsByAsset.get(asset.id)
    const condition = classifyCondition(asset.condition)
    const retired = (asset.status ?? '').toLowerCase() === 'retired'
    const label = assetLabel(asset)
    const evidence = [
      { label: 'Property no.', value: asset.propertyNumber ?? 'not recorded' },
      {
        label: 'Condition',
        value: asset.condition?.trim() || 'not recorded',
      },
      { label: 'Status', value: asset.status ?? 'not recorded' },
      { label: 'Age', value: ageEvidence(asset, now) },
      {
        label: 'Repairs in last 12 months',
        value: String(history?.countInWindow ?? 0),
      },
      {
        label: 'Repair spend (12 months)',
        value: peso(history?.spendInWindowCents ?? 0),
      },
      {
        label: 'Recorded cost',
        value: peso(asset.recordedCostCents),
      },
    ]
    if (history?.lastRepairDate) {
      evidence.push({
        label: 'Last repair',
        value: history.lastRepairDate,
      })
    }

    if (retired) {
      if (!disposalDocumentAssetIds.has(asset.id)) {
        out.push({
          id: `replacement:retired-docs:${asset.id}`,
          group: 'replacement',
          rule: 'RETIRED_DOCUMENTATION',
          title: `Verify disposal documents — ${label}`,
          subject: asset.description ?? asset.accountTitle ?? label,
          priority: 'low',
          reason:
            'This asset is marked retired but no disposal/condemnation document is linked to it. The registry and the paper trail should agree before an audit.',
          action: 'Review the asset record and attach or verify the disposal document. Do not change the status from this page.',
          href: assetsHref(portalBase, asset),
          evidence,
        })
      }
      continue
    }

    if (condition === 'unserviceable' && (history?.openCount ?? 0) > 0) {
      out.push({
        id: `replacement:repair-or-replace:${asset.id}`,
        group: 'replacement',
        rule: 'REPAIR_OR_REPLACE',
        title: `Compare repair vs replacement — ${label}`,
        subject: asset.description ?? asset.accountTitle ?? label,
        priority: 'high',
        reason:
          `The asset is unserviceable and has ${history?.openCount ?? 0} open repair ticket(s). ` +
          `Recorded cost is ${peso(asset.recordedCostCents)}; repair spend in the last 12 months is ${peso(history?.spendInWindowCents ?? 0)}. ` +
          'A repair quote versus replacement cost comparison is needed before deciding.',
        action:
          'Review the open repair ticket and obtain a repair quotation. Compare it with replacement cost and document the decision.',
        href: assetsHref(portalBase, asset),
        evidence,
      })
      continue
    }

    if (condition === 'unserviceable') {
      out.push({
        id: `replacement:dispose:${asset.id}`,
        group: 'replacement',
        rule: 'DISPOSE_UNSERVICEABLE',
        title: `Disposal review — ${label}`,
        subject: asset.description ?? asset.accountTitle ?? label,
        priority: 'high',
        reason:
          `The recorded condition is "${asset.condition ?? 'unserviceable'}" and there is no open repair ticket. ` +
          `Recorded cost is ${peso(asset.recordedCostCents)}.`,
        action:
          'Review for disposal/condemnation following the property disposal process. This is a recommendation only; no status was changed.',
        href: assetsHref(portalBase, asset),
        evidence,
      })
      continue
    }

    const repairHeavy =
      (history?.countInWindow ?? 0) >= config.repairCountThreshold
    const costHeavy =
      (history?.spendInWindowCents ?? 0) > 0 &&
      (asset.recordedCostCents ?? 0) > 0 &&
      (history?.spendInWindowCents ?? 0) >=
        (asset.recordedCostCents ?? 0) * config.repairCostRatio
    if (repairHeavy || costHeavy) {
      const why = repairHeavy
        ? `${history?.countInWindow} repairs in the last 12 months reached the ${config.repairCountThreshold}-repair threshold`
        : `repair spend (${peso(history?.spendInWindowCents ?? 0)}) reached at least ${Math.round(config.repairCostRatio * 100)}% of the recorded cost (${peso(asset.recordedCostCents)})`
      out.push({
        id: `replacement:repair-heavy:${asset.id}`,
        group: 'replacement',
        rule: 'REPLACE_REPAIR_HEAVY',
        title: `Replacement review — ${label}`,
        subject: asset.description ?? asset.accountTitle ?? label,
        priority: 'medium',
        reason: `This asset is repair-heavy: ${why}. A replacement review is advisable before another repair cycle.`,
        action:
          'Compare the next repair quotation with a replacement unit. Confirm with the end-user and property custodian.',
        href: assetsHref(portalBase, asset),
        evidence,
      })
    }
  }
  return out
}
