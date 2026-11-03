import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  buildIdleRecommendations,
  type PrescriptiveRequest,
} from '../lib/prescriptive/idle'
import type { PrescriptiveAsset } from '../lib/prescriptive/replacement'

const NOW = new Date('2026-06-01T00:00:00.000Z')

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString()
}

function asset(overrides: Partial<PrescriptiveAsset> = {}): PrescriptiveAsset {
  return {
    id: 'a1',
    propertyNumber: 'PROP-001',
    description: 'Foldable table',
    category: 'Furniture',
    accountCode: '10604010',
    accountTitle: 'Furniture and fixtures',
    condition: 'good',
    status: 'available',
    dateAcquired: daysAgo(181),
    createdAt: daysAgo(181),
    recordedCostCents: 1_000_000,
    quantity: 1,
    assignedTo: null,
    assignedToName: null,
    location: 'Stockroom',
    ...overrides,
  }
}

function request(overrides: Partial<PrescriptiveRequest> = {}): PrescriptiveRequest {
  return {
    id: 'r1',
    employeeId: 'u2',
    employeeName: 'Ben Santos',
    office: 'Admin',
    dateRequested: daysAgo(3),
    items: [
      {
        description: 'Foldable table',
        quantity: 1,
        unit: 'unit',
        assetId: null,
      },
    ],
    ...overrides,
  }
}

describe('prescriptive idle rules', () => {
  it('does not flag an available asset at exactly the 180-day boundary', () => {
    const rows = buildIdleRecommendations(
      [asset({ dateAcquired: daysAgo(180) })],
      [],
      '/personnel',
      NOW
    )
    assert.equal(rows.length, 0)
  })

  it('flags an available unassigned asset older than 180 days', () => {
    const rows = buildIdleRecommendations([asset()], [], '/personnel', NOW)
    assert.equal(rows[0].rule, 'IDLE_AVAILABLE')
    assert.equal(rows[0].priority, 'medium')
    // Age is measured from the recorded acquisition date, not from the moment
    // the asset became unassigned — the wording must not claim otherwise.
    assert.match(rows[0].reason, /available and unassigned/)
    assert.match(rows[0].reason, /idle reference window/)
    assert.doesNotMatch(rows[0].reason, /has been available and unassigned for/)
    const age = rows[0].evidence.find((e) => e.label === 'Recorded age')
    assert.ok(age)
    assert.match(age.value, /181 days ago/)
    assert.match(age.value, /date acquired/)
  })

  it('falls back to the record-creation date when no acquisition date exists', () => {
    const rows = buildIdleRecommendations(
      [asset({ dateAcquired: null })],
      [],
      '/personnel',
      NOW
    )
    assert.equal(rows.length, 1)
    assert.match(rows[0].reason, /record creation date/)
  })

  it('ignores assigned and non-available assets', () => {
    const rows = buildIdleRecommendations(
      [
        asset({ assignedTo: 'u1', assignedToName: 'Ana Cruz' }),
        asset({ id: 'a2', status: 'in use' }),
        asset({ id: 'a3', status: 'retired' }),
      ],
      [],
      '/personnel',
      NOW
    )
    assert.equal(rows.length, 0)
  })

  it('raises priority and links the request when pending demand matches', () => {
    const rows = buildIdleRecommendations(
      [asset()],
      [request()],
      '/personnel',
      NOW
    )
    assert.equal(rows[0].rule, 'IDLE_MATCHED_DEMAND')
    assert.equal(rows[0].priority, 'high')
    assert.match(rows[0].href ?? '', /\/requests$/)
  })

  it('matches a pending request by asset id even when wording differs', () => {
    const rows = buildIdleRecommendations(
      [asset()],
      [
        request({
          items: [
            {
              description: 'Different wording',
              quantity: 1,
              unit: 'unit',
              assetId: 'a1',
            },
          ],
        }),
      ],
      '/personnel',
      NOW
    )
    assert.equal(rows[0].rule, 'IDLE_MATCHED_DEMAND')
  })

  it('reports duplicate custody once for the excess units', () => {
    const rows = buildIdleRecommendations(
      [
        asset({
          id: 'a1',
          status: 'in use',
          assignedTo: 'u1',
          assignedToName: 'Ana Cruz',
          propertyNumber: 'PROP-001',
        }),
        asset({
          id: 'a2',
          status: 'in use',
          assignedTo: 'u1',
          assignedToName: 'Ana Cruz',
          propertyNumber: 'PROP-002',
        }),
      ],
      [],
      '/personnel',
      NOW
    )
    assert.equal(rows.length, 1)
    assert.equal(rows[0].rule, 'DUPLICATE_CUSTODY')
    assert.match(rows[0].title, /holds 2 units/)
    assert.match(rows[0].reason, /1 unit/)
  })
})
