import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  AGING_BUCKETS,
  DELAYED_THRESHOLD_DAYS,
  ageInDays,
  agingBucket,
  agingBucketLabel,
  classifyCondition,
  conditionLabel,
  isAgingBucket,
  isDelayed,
  lastQuarters,
  normalizeCondition,
  parseAgingBucket,
  parseReportModule,
  parseReportYear,
  percentage,
  quarterEnd,
  quarterKey,
  quarterLabel,
  quarterOf,
  quarterRefOf,
  quarterStart,
  quartersForYear,
} from '../lib/reporting'

describe('aging buckets', () => {
  it('uses the assessment bucket boundaries (inclusive)', () => {
    assert.equal(agingBucket(0), '0-3')
    assert.equal(agingBucket(3), '0-3')
    assert.equal(agingBucket(4), '4-7')
    assert.equal(agingBucket(7), '4-7')
    assert.equal(agingBucket(8), '8-14')
    assert.equal(agingBucket(14), '8-14')
    assert.equal(agingBucket(15), '15+')
    assert.equal(agingBucket(999), '15+')
  })

  it('floors negative/invalid ages to the 0-3 bucket', () => {
    assert.equal(agingBucket(-5), '0-3')
    assert.equal(agingBucket(Number.NaN), '0-3')
  })

  it('exposes four ordered buckets with labels', () => {
    assert.deepEqual(
      AGING_BUCKETS.map((b) => b.key),
      ['0-3', '4-7', '8-14', '15+']
    )
    assert.equal(agingBucketLabel('0-3'), '0–3 days')
    assert.equal(agingBucketLabel('unknown'), 'unknown')
  })

  it('marks a record delayed only once it exceeds the uniform threshold', () => {
    assert.equal(DELAYED_THRESHOLD_DAYS, 7)
    assert.equal(isDelayed(7), false)
    assert.equal(isDelayed(8), true)
    assert.equal(isDelayed(Number.NaN), false)
  })

  it('parses filters fail-closed', () => {
    assert.equal(isAgingBucket('15+'), true)
    assert.equal(isAgingBucket('30+'), false)
    assert.equal(parseAgingBucket('4-7'), '4-7')
    assert.equal(parseAgingBucket('bogus'), 'all')
    assert.equal(parseReportModule('repairs'), 'repairs')
    assert.equal(parseReportModule('bogus'), 'inspections')
  })

  it('computes whole elapsed days', () => {
    const now = Date.parse('2026-03-10T12:00:00.000Z')
    assert.equal(ageInDays('2026-03-03T12:00:00.000Z', now), 7)
    assert.equal(ageInDays('2026-03-10T13:00:00.000Z', now), 0)
    assert.equal(ageInDays(null, now), 0)
    assert.equal(ageInDays('not-a-date', now), 0)
  })
})

describe('calendar quarters', () => {
  it('maps months to calendar quarters (Q1 = Jan–Mar)', () => {
    assert.equal(quarterOf(new Date(2026, 0, 15)), 1)
    assert.equal(quarterOf(new Date(2026, 2, 31)), 1)
    assert.equal(quarterOf(new Date(2026, 3, 1)), 2)
    assert.equal(quarterOf(new Date(2026, 6, 1)), 3)
    assert.equal(quarterOf(new Date(2026, 9, 1)), 4)
    assert.equal(quarterOf(new Date(2026, 11, 31)), 4)
  })

  it('builds inclusive start and exclusive end instants', () => {
    const q2 = { year: 2026, quarter: 2 as const }
    assert.equal(quarterStart(q2).getMonth(), 3)
    assert.equal(quarterStart(q2).getDate(), 1)
    assert.equal(quarterEnd(q2).getMonth(), 6)
    assert.equal(quarterKey(q2), '2026-Q2')
    assert.equal(quarterLabel(q2), 'Q2 2026')
  })

  it('refs come from the local date', () => {
    assert.deepEqual(quarterRefOf(new Date(2025, 10, 20)), {
      year: 2025,
      quarter: 4,
    })
  })

  it('returns four quarters per year', () => {
    assert.deepEqual(
      quartersForYear(2024).map((q) => q.quarter),
      [1, 2, 3, 4]
    )
  })

  it('lastQuarters returns oldest → newest ending at the reference date', () => {
    const refs = lastQuarters(4, new Date(2026, 1, 15))
    assert.deepEqual(
      refs.map((r) => quarterLabel(r)),
      ['Q2 2025', 'Q3 2025', 'Q4 2025', 'Q1 2026']
    )
  })

  it('clamps the quarter count and parses report years', () => {
    assert.equal(lastQuarters(0).length, 1)
    assert.equal(lastQuarters(500).length, 40)
    assert.equal(parseReportYear('2024'), 2024)
    assert.equal(parseReportYear('1800', 2026), 2026)
    assert.equal(parseReportYear(undefined, 2026), 2026)
  })
})

describe('asset conditions', () => {
  it('normalizes case, whitespace and blanks', () => {
    assert.equal(normalizeCondition(' Serviceable '), 'serviceable')
    assert.equal(normalizeCondition('UNSERVICEABLE'), 'unserviceable')
    assert.equal(normalizeCondition(''), 'unspecified')
    assert.equal(normalizeCondition(null), 'unspecified')
    assert.equal(conditionLabel('serviceable'), 'Serviceable')
    assert.equal(conditionLabel(null), 'Unspecified')
  })

  it('classifies serviceable/unserviceable without guessing unknowns', () => {
    assert.equal(classifyCondition('Serviceable'), 'serviceable')
    assert.equal(classifyCondition('good'), 'serviceable')
    assert.equal(classifyCondition('Unserviceable'), 'unserviceable')
    assert.equal(classifyCondition('damaged'), 'unserviceable')
    assert.equal(classifyCondition('non-functional'), 'unserviceable')
    assert.equal(classifyCondition(''), 'unspecified')
    assert.equal(classifyCondition('weird-value'), 'unspecified')
  })

  it('computes rounded percentages safely', () => {
    assert.equal(percentage(1, 3), 33)
    assert.equal(percentage(3, 3), 100)
    assert.equal(percentage(1, 0), 0)
    assert.equal(percentage(Number.NaN, 10), 0)
  })
})
