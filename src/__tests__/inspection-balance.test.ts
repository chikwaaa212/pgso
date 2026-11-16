import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { remainingOf, type PoItem } from '../lib/inspection-rules'

/**
 * The inspections list/detail show "balance due" as
 * `sum(max(0, PO qty - stocked_qty))` — the same derivation the stocking
 * watermark uses (`stocked_qty`), so the badge can never drift from stocks.
 */
function balanceDue(items: PoItem[]) {
  return items.reduce((sum, item) => sum + remainingOf(item), 0)
}

function item(overrides: Partial<PoItem> = {}): PoItem {
  return { id: 'item-1', quantity: 10, stocked_qty: 0, ...overrides }
}

describe('inspection balance due', () => {
  it('returns the full PO quantity before anything is stocked', () => {
    assert.equal(balanceDue([item({ quantity: 10, stocked_qty: 0 })]), 10)
  })

  it('returns only the outstanding quantity after a partial arrival', () => {
    assert.equal(balanceDue([item({ quantity: 10, stocked_qty: 6 })]), 4)
  })

  it('is zero once the delivery is fully stocked (passed unlocks)', () => {
    assert.equal(balanceDue([item({ quantity: 10, stocked_qty: 10 })]), 0)
  })

  it('never goes negative when stocked exceeds the PO quantity', () => {
    assert.equal(balanceDue([item({ quantity: 10, stocked_qty: 12 })]), 0)
  })

  it('sums per-item balances across a multi-item delivery', () => {
    assert.equal(
      balanceDue([
        item({ id: 'a', quantity: 10, stocked_qty: 6 }),
        item({ id: 'b', quantity: 5, stocked_qty: 0 }),
        item({ id: 'c', quantity: 2, stocked_qty: 2 }),
      ]),
      9
    )
  })
})
