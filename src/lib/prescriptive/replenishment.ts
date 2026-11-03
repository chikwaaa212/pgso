/**
 * Replenishment recommendations with suggested order quantities.
 *
 * The suggestion is advisory: average monthly issuance over the consumption
 * window × (lead time + safety days) − on-hand. When no issuance history
 * matches, the row still tells the reader the stock is low but does not invent
 * a demand figure — it falls back to a clearly labelled threshold restock.
 */

import { PRESCRIPTIVE_CONFIG, type PrescriptiveConfig } from './config'
import {
  consumptionKey,
  type ConsumptionSuggestion,
} from '@/lib/ppmp/analytics/consumption'
import type { Recommendation } from './types'

export interface PrescriptiveInventoryItem {
  id: string
  itemName: string
  quantity: number
  unit: string | null
  reorderThreshold: number | null
  category: string | null
  accountCode: string | null
}

export interface ReplenishmentAdvice {
  recommendation: Recommendation
  level: 'out' | 'critical' | 'low'
  avgMonthlyUsage: number | null
  suggestedOrderQty: number | null
  basis: string
}

export interface ReplenishmentResult {
  rows: ReplenishmentAdvice[]
  matchedHistory: number
  withoutHistory: number
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export function replenishmentLevel(
  item: Pick<PrescriptiveInventoryItem, 'quantity' | 'reorderThreshold'>
): 'out' | 'critical' | 'low' | null {
  if (item.quantity <= 0) return 'out'
  if (item.reorderThreshold === null) return null
  if (item.quantity <= Math.floor(item.reorderThreshold / 2)) return 'critical'
  if (item.quantity <= item.reorderThreshold) return 'low'
  return null
}

/**
 * Compute the suggested order quantity from average monthly usage.
 * Exported so the formula can be unit-tested independently of UI wording.
 */
export function suggestedOrderQuantity(
  avgMonthlyUsage: number,
  onHand: number,
  config: PrescriptiveConfig = PRESCRIPTIVE_CONFIG
): number {
  const months = (config.leadTimeDays + config.safetyDays) / 30
  return Math.max(0, Math.ceil(avgMonthlyUsage * months - onHand))
}

export function buildReplenishmentRecommendations(
  items: PrescriptiveInventoryItem[],
  consumptionByKey: Map<string, ConsumptionSuggestion> = new Map(),
  portalBase = '/personnel',
  config: PrescriptiveConfig = PRESCRIPTIVE_CONFIG
): ReplenishmentResult {
  const rows: ReplenishmentAdvice[] = []
  let matchedHistory = 0
  let withoutHistory = 0

  for (const item of items) {
    const level = replenishmentLevel(item)
    if (!level) continue
    const key = consumptionKey(item.itemName, item.unit)
    const consumption = consumptionByKey.get(key)
    const avgMonthlyUsage =
      consumption && consumption.averageAnnual > 0
        ? round2(consumption.averageAnnual / 12)
        : null
    let suggestedOrderQty: number | null = null
    let basis: string
    if (avgMonthlyUsage !== null) {
      matchedHistory += 1
      suggestedOrderQty = suggestedOrderQuantity(
        avgMonthlyUsage,
        item.quantity,
        config
      )
      basis =
        `${avgMonthlyUsage.toLocaleString('en-PH')}/month average issuance × ` +
        `${config.leadTimeDays + config.safetyDays} days (${config.leadTimeDays}-day lead + ${config.safetyDays}-day safety) − ` +
        `${item.quantity.toLocaleString('en-PH')} on hand`
    } else {
      withoutHistory += 1
      if (item.reorderThreshold !== null) {
        suggestedOrderQty = Math.max(0, item.reorderThreshold * 2 - item.quantity)
        basis =
          'No matching 3-year issuance history — fallback restores two threshold cycles. Confirm actual usage before ordering.'
      } else {
        basis = 'No issuance history or reorder threshold — confirm the order quantity manually.'
      }
    }

    const label =
      level === 'out'
        ? `Out of stock — ${item.itemName}`
        : level === 'critical'
          ? `Critically low — ${item.itemName}`
          : `Below threshold — ${item.itemName}`
    const unit = item.unit ?? 'unit'
    const title =
      suggestedOrderQty !== null && suggestedOrderQty > 0
        ? `Order about ${suggestedOrderQty.toLocaleString('en-PH')} ${unit} — ${item.itemName}`
        : `Restock — ${item.itemName}`
    rows.push({
      level,
      avgMonthlyUsage,
      suggestedOrderQty,
      basis,
      recommendation: {
        id: `replenishment:${level}:${item.id}`,
        group: 'replenishment',
        rule:
          level === 'out'
            ? 'REPLENISH_OUT_OF_STOCK'
            : level === 'critical'
              ? 'REPLENISH_CRITICAL'
              : 'REPLENISH_BELOW_THRESHOLD',
        title,
        subject: item.itemName,
        priority: level === 'low' ? 'medium' : 'high',
        reason: `${label}. On hand: ${item.quantity.toLocaleString('en-PH')} ${unit}; reorder threshold: ${
          item.reorderThreshold === null
            ? 'not set'
            : item.reorderThreshold.toLocaleString('en-PH')
        }.`,
        action:
          suggestedOrderQty !== null && suggestedOrderQty > 0
            ? `Review a stock-replenishment request for about ${suggestedOrderQty.toLocaleString('en-PH')} ${unit}. Confirm with the end-user before submitting.`
            : 'Review a stock-replenishment request and confirm the quantity with the end-user.',
        href: `${portalBase}/inventory?q=${encodeURIComponent(item.itemName)}`,
        evidence: [
          { label: 'On hand', value: `${item.quantity.toLocaleString('en-PH')} ${unit}` },
          {
            label: 'Reorder threshold',
            value:
              item.reorderThreshold === null
                ? 'not set'
                : item.reorderThreshold.toLocaleString('en-PH'),
          },
          {
            label: 'Avg. monthly issuance',
            value:
              avgMonthlyUsage === null
                ? 'no matching history'
                : `${avgMonthlyUsage.toLocaleString('en-PH')} ${unit}`,
          },
          {
            label: 'Suggested order',
            value:
              suggestedOrderQty === null
                ? 'confirm manually'
                : `${suggestedOrderQty.toLocaleString('en-PH')} ${unit}`,
          },
          { label: 'Basis', value: basis },
          { label: 'Account code', value: item.accountCode ?? 'not recorded' },
        ],
      },
    })
  }

  rows.sort((a, b) => {
    const rank = (level: ReplenishmentAdvice['level']) =>
      level === 'out' ? 0 : level === 'critical' ? 1 : 2
    return (
      rank(a.level) - rank(b.level) ||
      (b.suggestedOrderQty ?? 0) - (a.suggestedOrderQty ?? 0) ||
      a.recommendation.subject.localeCompare(b.recommendation.subject)
    )
  })
  return { rows, matchedHistory, withoutHistory }
}
