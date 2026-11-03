/**
 * Idle-asset and duplicate-custody recommendations.
 *
 * Deliberately evidence-based: only available/unassigned assets whose recorded
 * acquisition date is older than the configured window, plus duplicate custody
 * of the same accountable item.
 *
 * Important limitation: `assets` has no "became available on" timestamp, so the
 * age is measured from `date_acquired` (falling back to the record-creation
 * date). The UI must not claim the item has been unassigned for that many days —
 * it is an age-based prompt to review, not a measured idle period.
 */

import { ageInDays } from '@/lib/reporting'
import { fmtDate } from '@/lib/format'
import { PRESCRIPTIVE_CONFIG, type PrescriptiveConfig } from './config'
import { normalizeConsumptionText } from '@/lib/ppmp/analytics/consumption'
import type { Recommendation } from './types'
import type { PrescriptiveAsset } from './replacement'

export interface PrescriptiveRequestItem {
  description: string
  quantity: number
  unit: string | null
  assetId: string | null
}

export interface PrescriptiveRequest {
  id: string
  employeeId: string
  employeeName: string | null
  office: string | null
  dateRequested: string | null
  items: PrescriptiveRequestItem[]
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

function normalized(value: string | null | undefined): string {
  return normalizeConsumptionText(value)
}

function descriptionsMatch(
  asset: PrescriptiveAsset,
  item: PrescriptiveRequestItem
): boolean {
  if (item.assetId && item.assetId === asset.id) return true
  const a = normalized(asset.description)
  const b = normalized(item.description)
  if (!a || !b) return false
  if (a === b) return true
  // Conservative containment for long descriptions only; avoids matching
  // generic words such as "paper" against every supply line.
  if (a.length >= 8 && b.length >= 8 && (a.includes(b) || b.includes(a))) {
    return true
  }
  return false
}

function requestItemLabel(item: PrescriptiveRequestItem): string {
  return `${item.description}${item.unit ? ` (${item.unit})` : ''} × ${item.quantity}`
}

/**
 * Build idle + duplicate-custody recommendations.
 *
 * A pending `new_assignment` request is treated as demand: when an idle asset
 * matches a requested item, the suggestion becomes "transfer to this employee"
 * and priority rises to high.
 */
export function buildIdleRecommendations(
  assets: PrescriptiveAsset[],
  requests: PrescriptiveRequest[] = [],
  portalBase = '/personnel',
  now: Date = new Date(),
  config: PrescriptiveConfig = PRESCRIPTIVE_CONFIG
): Recommendation[] {
  const out: Recommendation[] = []
  const pending = requests.filter((r) => r.items.length > 0)

  for (const asset of assets) {
    const status = (asset.status ?? '').trim().toLowerCase()
    if (status !== 'available' || asset.assignedTo) continue
    const acquired = asset.dateAcquired ?? asset.createdAt
    if (!acquired) continue
    const days = ageInDays(acquired, now)
    if (days <= config.idleDays) continue

    const match = pending.find((request) =>
      request.items.some((item) => descriptionsMatch(asset, item))
    )
    const matchedItem = match?.items.find((item) => descriptionsMatch(asset, item))
    const label = assetLabel(asset)
    const ageBasis = asset.dateAcquired ? 'date acquired' : 'record creation date'
    const agePhrase = `${days.toLocaleString('en-PH')} days ago (${ageBasis}: ${fmtDate(acquired)})`
    const evidence = [
      { label: 'Property no.', value: asset.propertyNumber ?? 'not recorded' },
      { label: 'Location', value: asset.location ?? 'not recorded' },
      {
        label: 'Recorded age',
        value: `${agePhrase}; idle reference window ${config.idleDays} days`,
      },
      { label: 'Status', value: asset.status ?? 'available' },
      {
        label: 'Condition',
        value: asset.condition?.trim() || 'not recorded',
      },
      {
        label: 'Account',
        value: asset.accountTitle ?? asset.accountCode ?? 'not recorded',
      },
    ]
    if (match && matchedItem) {
      evidence.push({
        label: 'Matching request',
        value: `${match.employeeName ?? 'Employee'} · ${requestItemLabel(matchedItem)}`,
      })
      evidence.push({
        label: 'Requested',
        value: match.dateRequested ?? 'date not recorded',
      })
    }

    out.push({
      id: `idle:${match ? 'matched' : 'available'}:${asset.id}`,
      group: 'idle',
      rule: match ? 'IDLE_MATCHED_DEMAND' : 'IDLE_AVAILABLE',
      title: match
        ? `Reassign idle asset to a waiting request — ${label}`
        : `Redeploy idle asset — ${label}`,
      subject: asset.description ?? asset.accountTitle ?? label,
      priority: match ? 'high' : 'medium',
      reason: match
        ? `This asset is available and unassigned and was recorded ${agePhrase}. A pending new-assignment request matches it (${match.employeeName ?? 'employee'}).`
        : `This asset is available and unassigned and was recorded ${agePhrase}, beyond the ${config.idleDays}-day idle reference window. The system does not store when it became unassigned, so treat this as an age-based prompt to review.`,
      action: match
        ? 'Review the pending request and, if the asset fits, prepare a transfer. This page does not create or approve the request.'
        : 'Review whether another office or employee can use this asset. If not, consider disposal or retention review.',
      href: match ? `${portalBase}/requests` : assetsHref(portalBase, asset),
      evidence,
    })
  }

  // Duplicate custody: one custodian with more than one asset of the same
  // accountable item. Group by custodian + account/description.
  const custody = new Map<string, PrescriptiveAsset[]>()
  for (const asset of assets) {
    if (!asset.assignedTo) continue
    if ((asset.status ?? '').toLowerCase() === 'retired') continue
    const key =
      normalized(asset.accountCode) ||
      normalized(asset.accountTitle) ||
      normalized(asset.description)
    if (!key) continue
    const groupKey = `${asset.assignedTo}|${key}`
    const list = custody.get(groupKey) ?? []
    list.push(asset)
    custody.set(groupKey, list)
  }
  for (const list of custody.values()) {
    if (list.length <= 1) continue
    const first = list[0]
    const names = list
      .map((a) => a.propertyNumber)
      .filter((v): v is string => Boolean(v))
    const excess = list.length - 1
    out.push({
      id: `idle:duplicate-custody:${first.assignedTo}:${normalized(first.accountCode ?? first.accountTitle ?? first.description)}`,
      group: 'idle',
      rule: 'DUPLICATE_CUSTODY',
      title: `Duplicate custody — ${first.assignedToName ?? 'custodian'} holds ${list.length} units`,
      subject: first.accountTitle ?? first.description ?? 'Accountable item',
      priority: 'medium',
      reason:
        `${first.assignedToName ?? 'This custodian'} holds ${list.length} assets of the same accountable item. ` +
        `Review whether ${excess} unit${excess === 1 ? '' : 's'} can be transferred to another user.`,
      action:
        'Check the custody list with the employee and transfer the excess unit if it is not needed.',
      href: assetsHref(portalBase, first),
      evidence: [
        {
          label: 'Custodian',
          value: first.assignedToName ?? first.assignedTo ?? 'unknown',
        },
        { label: 'Units held', value: String(list.length) },
        {
          label: 'Property numbers',
          value: names.length > 0 ? names.slice(0, 8).join(', ') : 'not recorded',
        },
        {
          label: 'Account',
          value: first.accountTitle ?? first.accountCode ?? 'not recorded',
        },
      ],
    })
  }
  return out
}
