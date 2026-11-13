'use client'

import { useMemo } from 'react'
import type { MonthlyRange } from '@/app/personnel/inspections/actions'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import styles from './monthly-range-filter.module.css'

const ALL_MONTHS = 'all'

/** Newest-first month options for the last 24 months. */
function monthOptions(): { value: string; label: string }[] {
  const now = new Date()
  const options: { value: string; label: string }[] = []
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    options.push({
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('en-PH', {
        month: 'long',
        year: 'numeric',
      }),
    })
  }
  return options
}

/**
 * Month selector used by both dashboard trend charts. Choosing a month
 * switches the chart to one bucket per day for that month; "Last 6 months"
 * restores the default monthly trend.
 */
export function MonthlyRangeFilter({
  value,
  onChange,
  loading = false,
}: {
  value: MonthlyRange
  onChange: (next: MonthlyRange) => void
  loading?: boolean
}) {
  const options = useMemo(() => monthOptions(), [])
  const selected = value.month || ALL_MONTHS

  return (
    <div className={styles.filters}>
      <Select
        value={selected}
        onValueChange={(next) =>
          onChange({ month: next === ALL_MONTHS ? '' : next })
        }
      >
        <SelectTrigger
          size="sm"
          className={styles.trigger}
          aria-label="Filter chart by month"
        >
          <SelectValue placeholder="Last 6 months" />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectItem value={ALL_MONTHS}>Last 6 months</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {loading ? (
        <span className={styles.updating} role="status">
          Updating…
        </span>
      ) : null}
    </div>
  )
}