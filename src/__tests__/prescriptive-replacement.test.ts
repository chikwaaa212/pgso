import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  buildReplacementRecommendations,
  summarizeRepairs,
  type PrescriptiveAsset,
  type RepairLike,
} from '../lib/prescriptive/replacement'

const NOW = new Date('2026-06-01T00:00:00.000Z')

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString()
}

function asset(overrides: Partial<PrescriptiveAsset> = {}): PrescriptiveAsset {
  return {
    id: 'a1',
    propertyNumber: 'PROP-001',
    description: 'Laptop',
    category: 'IT',
    accountCode: '10605010',
    accountTitle: 'Laptop computer',
    condition: 'good',
    status: 'in use',
    dateAcquired: daysAgo(400),
    createdAt: daysAgo(400),
    recordedCostCents: 5_000_000,
    quantity: 1,
    assignedTo: 'u1',
    assignedToName: 'Ana Cruz',
    location: 'IT Office',
    ...overrides,
  }
}

function repair(overrides: Partial<RepairLike> = {}): RepairLike {
  return {
    assetId: 'a1',
    repairDate: daysAgo(20),
    status: 'completed',
    costCents: 100_000,
    ...overrides,
  }
}

describe('prescriptive replacement rules', () => {
  it('recommends disposal review for an unserviceable asset with no open repair', () => {
    const rows = buildReplacementRecommendations(
      [asset({ condition: 'unserviceable' })],
      new Map(),
      new Set(),
      '/personnel',
      NOW
    )
    assert.equal(rows.length, 1)
    assert.equal(rows[0].rule, 'DISPOSE_UNSERVICEABLE')
    assert.equal(rows[0].priority, 'high')
  })

  it('recommends repair-vs-replace when an unserviceable asset has an open ticket', () => {
    const history = summarizeRepairs(
      [repair({ status: 'pending' })],
      NOW
    )
    const rows = buildReplacementRecommendations(
      [asset({ condition: 'unserviceable' })],
      history,
      new Set(),
      '/personnel',
      NOW
    )
    assert.equal(rows[0].rule, 'REPAIR_OR_REPLACE')
    assert.equal(rows[0].priority, 'high')
  })

  it('flags exactly 3 repairs in the window as repair-heavy', () => {
    const history = summarizeRepairs(
      [repair(), repair(), repair()],
      NOW
    )
    const rows = buildReplacementRecommendations(
      [asset()],
      history,
      new Set(),
      '/personnel',
      NOW
    )
    assert.equal(rows.length, 1)
    assert.equal(rows[0].rule, 'REPLACE_REPAIR_HEAVY')
    assert.equal(rows[0].priority, 'medium')
  })

  it('does not flag 2 repairs under the default threshold', () => {
    const history = summarizeRepairs([repair(), repair()], NOW)
    const rows = buildReplacementRecommendations(
      [asset()],
      history,
      new Set(),
      '/personnel',
      NOW
    )
    assert.equal(rows.length, 0)
  })

  it('flags repair spend at exactly 50% of recorded cost', () => {
    const history = summarizeRepairs(
      [repair({ costCents: 2_500_000 })],
      NOW
    )
    const rows = buildReplacementRecommendations(
      [asset()],
      history,
      new Set(),
      '/personnel',
      NOW
    )
    assert.equal(rows[0]?.rule, 'REPLACE_REPAIR_HEAVY')
  })

  it('does not flag spend just below 50% of recorded cost', () => {
    const history = summarizeRepairs(
      [repair({ costCents: 2_499_999 })],
      NOW
    )
    const rows = buildReplacementRecommendations(
      [asset()],
      history,
      new Set(),
      '/personnel',
      NOW
    )
    assert.equal(rows.length, 0)
  })

  it('flags retired assets without disposal paperwork only', () => {
    const retired = asset({ status: 'retired', condition: 'unserviceable' })
    const missing = buildReplacementRecommendations(
      [retired],
      new Map(),
      new Set(),
      '/personnel',
      NOW
    )
    assert.equal(missing[0].rule, 'RETIRED_DOCUMENTATION')
    assert.equal(missing[0].priority, 'low')

    const documented = buildReplacementRecommendations(
      [retired],
      new Map(),
      new Set(['a1']),
      '/personnel',
      NOW
    )
    assert.equal(documented.length, 0)
  })

  it('ignores repairs outside the 12-month window', () => {
    const history = summarizeRepairs(
      [
        repair({ repairDate: daysAgo(500) }),
        repair({ repairDate: daysAgo(500) }),
        repair({ repairDate: daysAgo(500) }),
      ],
      NOW
    )
    const rows = buildReplacementRecommendations(
      [asset()],
      history,
      new Set(),
      '/personnel',
      NOW
    )
    assert.equal(rows.length, 0)
  })
})
