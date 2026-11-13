'use client'

import { useEffect, useRef, useState } from 'react'
import {
  getMonthlyOverview,
  type MonthlyPoint,
  type MonthlyRange,
} from '@/app/personnel/inspections/actions'

/**
 * Loads the Deliveries vs inspections trend for the selected month.
 * The initial payload comes from the server (or the dashboard snapshot) so
 * the chart paints immediately; only filter changes hit the server action.
 */
export function useMonthlyOverview(initialData: MonthlyPoint[]) {
  const [data, setData] = useState<MonthlyPoint[]>(initialData)
  const [range, setRange] = useState<MonthlyRange>({ month: '' })
  const [loading, setLoading] = useState(false)
  const firstRun = useRef(true)
  const requestId = useRef(0)

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    const id = ++requestId.current
    setLoading(true)
    void getMonthlyOverview(undefined, range)
      .then((rows) => {
        if (id !== requestId.current) return
        setData(rows)
        setLoading(false)
      })
      .catch(() => {
        if (id !== requestId.current) return
        setLoading(false)
      })
  }, [range])

  return { data, range, setRange, loading }
}

/** "November 2026" for a `YYYY-MM` value, or null when unset/invalid. */
export function monthLabel(value: string | undefined): string | null {
  if (!value) return null
  const m = /^(\d{4})-(\d{2})$/.exec(value)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, 1)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })
}

/** Subtitle for the chart card. */
export function monthlyRangeLabel(range: MonthlyRange): string {
  const label = monthLabel(range.month)
  return label
    ? `${label} — per day`
    : 'Last 6 months — live from records'
}

/** One-line “what this means” summary for the trend chart. */
export function monthlyInsight(
  data: MonthlyPoint[],
  range: MonthlyRange
): string {
  const totalDeliveries = data.reduce((n, m) => n + m.deliveries, 0)
  const totalInspections = data.reduce((n, m) => n + m.inspections, 0)
  const deliveryGap = totalDeliveries - totalInspections
  const busiest = [...data].sort((a, b) => b.deliveries - a.deliveries)[0]
  const daily = Boolean(range.month)
  const scope = daily ? 'in the selected month' : 'in the last 6 months'
  const preposition = daily ? 'on' : 'in'

  if (totalDeliveries === 0) {
    return `No deliveries ${scope} — the trend will build here once receiving starts.`
  }
  return `${totalDeliveries} deliveries vs ${totalInspections} inspections ${scope}${
    busiest && busiest.deliveries > 0
      ? `, busiest ${preposition} ${busiest.month} (${busiest.deliveries})`
      : ''
  }. ${
    deliveryGap > 0
      ? `${deliveryGap} deliver${deliveryGap === 1 ? 'y still needs' : 'ies still need'} inspection — the gap between the bars and the line is your inspection backlog.`
      : 'Inspections are keeping pace with receipts — no backlog building up.'
  }`
}