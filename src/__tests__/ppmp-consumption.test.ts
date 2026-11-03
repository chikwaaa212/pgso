import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  aggregateConsumption,
  buildConsumptionSuggestions,
  compareToPlanned,
  consumptionKey,
  recentFiscalYears,
  type ConsumptionLine,
} from '../lib/ppmp/analytics/consumption'

function line(overrides: Partial<ConsumptionLine> = {}): ConsumptionLine {
  return {
    id: 'i1',
    docType: 'ICS',
    docNo: 'ICS-001',
    docDate: '2025-04-10T00:00:00.000Z',
    quantity: 10,
    description: 'Bond paper',
    unit: 'ream',
    ...overrides,
  }
}

describe('PPMP issuance consumption', () => {
  it('normalizes the same way as the PPMP parser item key', () => {
    assert.equal(consumptionKey('Bond Paper, A4', 'Ream'), 'bondpapera4|ream')
    assert.equal(consumptionKey('Bond Paper, A4', 'REAM'), 'bondpapera4|ream')
    assert.equal(consumptionKey('Bond Paper', 'box') === consumptionKey('Bond Paper', 'ream'), false)
  })

  it('aggregates quantity and documents per fiscal year and item', () => {
    const result = aggregateConsumption(
      [
        line({ quantity: 10, docNo: 'ICS-1' }),
        line({ quantity: 5, docNo: 'ICS-2' }),
        line({
          id: 'i2',
          docDate: '2024-04-10T00:00:00.000Z',
          quantity: 8,
        }),
        line({
          id: 'i3',
          description: 'Bond paper',
          unit: 'box',
          quantity: 2,
        }),
      ],
      [2024, 2025, 2026]
    )
    assert.equal(result.totalLines, 4)
    assert.equal(result.matchedLines, 4)
    assert.equal(result.unmatchedLines, 0)
    assert.equal(result.items.length, 2)
    const reams = result.items.find((i) => i.itemKey === 'bondpaper|ream')!
    assert.deepEqual(
      reams.years.map((y) => y.quantity),
      [8, 15, 0]
    )
    assert.equal(reams.total, 23)
    assert.equal(reams.averageAnnual, 7.67)
    assert.equal(reams.low, 8)
    assert.equal(reams.high, 15)
    assert.equal(reams.usableYears, 2)
  })

  it('counts lines with no description or outside the window as unmatched', () => {
    const result = aggregateConsumption(
      [
        line({ description: '   ' }),
        line({ docDate: '2020-01-01T00:00:00.000Z' }),
      ],
      [2024, 2025, 2026]
    )
    assert.equal(result.items.length, 0)
    assert.equal(result.unmatchedLines, 2)
  })

  it('deducts on-hand stock from every band and labels low confidence', () => {
    const result = aggregateConsumption([line({ quantity: 100 })], [2024, 2025, 2026])
    const [suggestion] = buildConsumptionSuggestions(
      result.items,
      new Map([['bondpaper|ream', 40]]),
      [2024, 2025, 2026]
    )
    assert.equal(suggestion.qtyLow, 60)
    assert.equal(suggestion.qtyBase, 0)
    assert.equal(suggestion.qtyHigh, 60)
    assert.equal(suggestion.onHand, 40)
    assert.equal(suggestion.confidence, 'low')
  })

  it('never suggests a negative quantity', () => {
    const result = aggregateConsumption([line({ quantity: 5 })], [2024, 2025, 2026])
    const [suggestion] = buildConsumptionSuggestions(
      result.items,
      new Map([['bondpaper|ream', 100]]),
      [2024, 2025, 2026]
    )
    assert.equal(suggestion.qtyLow, 0)
    assert.equal(suggestion.qtyBase, 0)
    assert.equal(suggestion.qtyHigh, 0)
  })

  it('compares planned quantity to the suggested band', () => {
    const result = aggregateConsumption(
      [line({ quantity: 100 })],
      [2024, 2025, 2026]
    )
    const [suggestion] = buildConsumptionSuggestions(result.items, new Map(), [2024, 2025, 2026])
    const aligned = compareToPlanned(33, suggestion)
    assert.equal(aligned.status, 'aligned')
    const under = compareToPlanned(10, suggestion)
    assert.equal(under.status, 'under')
    const over = compareToPlanned(100, suggestion)
    assert.equal(over.status, 'over')
    const unknown = compareToPlanned(10, null)
    assert.equal(unknown.status, 'unknown')
  })

  it('builds the last three fiscal years oldest first', () => {
    assert.deepEqual(recentFiscalYears(3, new Date('2026-11-03T00:00:00Z')), [
      2024, 2025, 2026,
    ])
  })
})
