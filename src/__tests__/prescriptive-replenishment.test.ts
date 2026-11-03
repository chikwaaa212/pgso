import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  buildReplenishmentRecommendations,
  replenishmentLevel,
  suggestedOrderQuantity,
  type PrescriptiveInventoryItem,
} from '../lib/prescriptive/replenishment'
import type { ConsumptionSuggestion } from '../lib/ppmp/analytics/consumption'

function item(overrides: Partial<PrescriptiveInventoryItem> = {}): PrescriptiveInventoryItem {
  return {
    id: 'inv1',
    itemName: 'Bond paper',
    quantity: 5,
    unit: 'ream',
    reorderThreshold: 10,
    category: 'Supplies',
    accountCode: '10402010',
    ...overrides,
  }
}

function suggestion(overrides: Partial<ConsumptionSuggestion> = {}): ConsumptionSuggestion {
  return {
    itemKey: 'bondpaper|ream',
    description: 'Bond paper',
    unit: 'ream',
    years: [],
    total: 120,
    averageAnnual: 120,
    low: 80,
    high: 160,
    usableYears: 3,
    lastIssuedAt: null,
    evidence: [],
    onHand: 5,
    qtyLow: 75,
    qtyBase: 115,
    qtyHigh: 155,
    confidence: 'high',
    note: '',
    ...overrides,
  }
}

describe('prescriptive replenishment', () => {
  it('classifies out, critical, low and healthy stock', () => {
    assert.equal(replenishmentLevel({ quantity: 0, reorderThreshold: 10 }), 'out')
    assert.equal(replenishmentLevel({ quantity: 5, reorderThreshold: 10 }), 'critical')
    assert.equal(replenishmentLevel({ quantity: 10, reorderThreshold: 10 }), 'low')
    assert.equal(replenishmentLevel({ quantity: 11, reorderThreshold: 10 }), null)
    assert.equal(replenishmentLevel({ quantity: 1, reorderThreshold: null }), null)
  })

  it('computes the 60-day lead + 15-day safety order quantity', () => {
    // 10/month × 2.5 months = 25, minus 5 on hand = 20.
    assert.equal(suggestedOrderQuantity(10, 5), 20)
    assert.equal(suggestedOrderQuantity(0, 5), 0)
    assert.equal(suggestedOrderQuantity(10, 50), 0)
  })

  it('uses issuance history and on-hand stock in the recommendation', () => {
    const result = buildReplenishmentRecommendations(
      [item()],
      new Map([['bondpaper|ream', suggestion()]]),
      '/personnel'
    )
    assert.equal(result.matchedHistory, 1)
    assert.equal(result.rows[0].suggestedOrderQty, 20)
    assert.match(result.rows[0].recommendation.title, /Order about 20 ream/)
  })

  it('falls back to a labelled threshold restock without history', () => {
    const result = buildReplenishmentRecommendations([item()], new Map(), '/personnel')
    assert.equal(result.withoutHistory, 1)
    assert.equal(result.rows[0].suggestedOrderQty, 15)
    assert.match(result.rows[0].basis, /No matching 3-year issuance history/)
  })

  it('keeps out-of-stock rows first and high priority', () => {
    const result = buildReplenishmentRecommendations(
      [
        item({ id: 'low', quantity: 10 }),
        item({ id: 'out', quantity: 0, itemName: 'Toner' }),
      ],
      new Map(),
      '/personnel'
    )
    assert.equal(result.rows[0].recommendation.rule, 'REPLENISH_OUT_OF_STOCK')
    assert.equal(result.rows[0].recommendation.priority, 'high')
    assert.equal(result.rows[1].recommendation.priority, 'medium')
  })
})
