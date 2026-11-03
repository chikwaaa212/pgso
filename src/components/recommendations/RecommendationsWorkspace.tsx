'use client'

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import { Lightbulb, RefreshCw } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { useCachedAction } from '@/hooks/use-cached-action'
import { buildQueryKey } from '@/lib/query-keys'
import { label } from '@/lib/labels'
import { fetchPrescriptiveRecommendations } from '@/lib/prescriptive-actions'
import type {
  Priority,
  Recommendation,
  RecommendationGroupKey,
  PrescriptiveOverview,
} from '@/lib/prescriptive/types'
import styles from './recommendations.module.css'

type Portal = 'personnel' | 'super-admin'
type GroupFilter = 'all' | RecommendationGroupKey

const PRIORITY_LABEL: Record<Priority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

const RULE_LABEL: Record<string, string> = {
  REPLENISH_OUT_OF_STOCK: 'Out of stock',
  REPLENISH_CRITICAL: 'Critically low',
  REPLENISH_BELOW_THRESHOLD: 'Below threshold',
  DISPOSE_UNSERVICEABLE: 'Disposal review',
  REPAIR_OR_REPLACE: 'Repair vs replace',
  REPLACE_REPAIR_HEAVY: 'Repair-heavy',
  RETIRED_DOCUMENTATION: 'Retired paperwork',
  IDLE_AVAILABLE: 'Idle asset',
  IDLE_MATCHED_DEMAND: 'Idle + demand',
  DUPLICATE_CUSTODY: 'Duplicate custody',
  CONSUMPTION_HISTORY: 'Issuance history',
}

function formatGenerated(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'just now'
  return d.toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Manila',
  })
}

function RecommendationRow({ row }: { row: Recommendation }) {
  return (
    <article className={styles.row} data-priority={row.priority}>
      <div className={styles.rowHead}>
        <div className={styles.rowTitleWrap}>
          <div className={styles.badges}>
            <span className={styles.priority} data-priority={row.priority}>
              {PRIORITY_LABEL[row.priority]}
            </span>
            <span className={styles.rule}>{RULE_LABEL[row.rule] ?? label(row.rule)}</span>
          </div>
          <h3 className={styles.rowTitle}>{row.title}</h3>
          <p className={styles.rowSubject}>{row.subject}</p>
        </div>
        {row.href ? (
          <Link href={row.href} className={styles.rowLink}>
            Open record
          </Link>
        ) : null}
      </div>

      <p className={styles.reason}>{row.reason}</p>
      <p className={styles.action}>
        <strong>Suggested next step:</strong> {row.action}
      </p>

      <dl className={styles.evidence}>
        {row.evidence.map((item, index) => (
          <div key={`${item.label}-${index}`} className={styles.evidenceItem}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
    </article>
  )
}

function GroupPanel({
  group,
  filter,
}: {
  group: PrescriptiveOverview['groups'][number]
  filter: GroupFilter
}) {
  if (filter !== 'all' && filter !== group.key) return null
  return (
    <Card className={styles.panel}>
      <div className={styles.panelHead}>
        <div>
          <h2 className={styles.panelTitle}>
            {group.label}
            <span className={styles.count}>{group.total}</span>
          </h2>
          <p className={styles.panelSub}>{group.description}</p>
          {group.note ? <p className={styles.note}>{group.note}</p> : null}
        </div>
        <Link href={group.href} className={styles.panelLink}>
          Open module
        </Link>
      </div>

      {group.rows.length === 0 ? (
        <p className={styles.empty}>
          No recommendations in this group right now. That means no record
          currently exceeds the configured thresholds.
        </p>
      ) : (
        <div className={styles.rows}>
          {group.rows.map((row) => (
            <RecommendationRow key={row.id} row={row} />
          ))}
        </div>
      )}
      {group.total > group.rows.length ? (
        <p className={styles.more}>
          Showing the top {group.rows.length} of {group.total} recommendation
          {group.total === 1 ? '' : 's'} — highest priority first.
        </p>
      ) : null}
    </Card>
  )
}

export function RecommendationsWorkspace({ portal }: { portal: Portal }) {
  const [filter, setFilter] = useState<GroupFilter>('all')
  const load = useCallback(
    () => fetchPrescriptiveRecommendations(portal),
    [portal]
  )
  const { data, loading, error, refresh } = useCachedAction(
    buildQueryKey({ module: portal, resource: 'recommendations' }),
    load,
    { staleTime: 60_000 }
  )

  const tabs = useMemo(
    () => [
      { key: 'all' as const, label: 'All' },
      ...(data?.groups ?? []).map((g) => ({ key: g.key, label: g.label })),
    ],
    [data]
  )

  if (loading && !data) {
    return (
      <section className={styles.page} aria-busy="true">
        <div className={styles.skeletonHeader} />
        <div className={styles.kpis}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={styles.skeletonCard} />
          ))}
        </div>
        <div className={styles.skeletonPanel} />
      </section>
    )
  }

  if (!data) {
    return (
      <section className={styles.page}>
        <p className={styles.crumb}>
          {portal === 'super-admin' ? 'Super Admin' : 'Personnel'} / Recommendations
        </p>
        <h1 className={styles.title}>Recommendations</h1>
        <p className={styles.subtitle}>{error || 'Could not load recommendations.'}</p>
        <button type="button" className={styles.refresh} onClick={refresh}>
          <RefreshCw size={16} aria-hidden="true" /> Retry
        </button>
      </section>
    )
  }

  const { counts, groups } = data

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.crumb}>
            {portal === 'super-admin' ? 'Super Admin' : 'Personnel'} / Recommendations
          </p>
          <h1 className={styles.title}>Recommendations</h1>
          <p className={styles.subtitle}>
            Evidence-based advice for replenishment, replacement and disposal,
            idle assets, and PPMP quantities. Every row explains the numbers
            behind it and links to the record — nothing is changed automatically.
          </p>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.generated}>
            Generated {formatGenerated(data.generatedAt)}
          </span>
          <button type="button" className={styles.refresh} onClick={refresh}>
            <RefreshCw size={16} aria-hidden="true" /> Refresh
          </button>
        </div>
      </header>

      <div className={styles.advisory} role="note">
        <Lightbulb size={18} aria-hidden="true" />
        <div>
          <strong>Advisory only.</strong> These recommendations never change an
          asset status, create a disposal, or submit a request. Review the
          evidence, confirm with the custodian or end-user, and use the normal
          workflow to act.
        </div>
      </div>

      <div className={styles.kpis}>
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>All recommendations</span>
          <span className={styles.kpiValue}>{counts.total.toLocaleString('en-PH')}</span>
          <span className={styles.kpiSub}>
            {counts.high} high · {counts.medium} medium · {counts.low} low
          </span>
        </div>
        <div className={styles.kpi} data-tone="warn">
          <span className={styles.kpiLabel}>Replenishment</span>
          <span className={styles.kpiValue}>{counts.replenishment.toLocaleString('en-PH')}</span>
          <span className={styles.kpiSub}>Below threshold or out of stock</span>
        </div>
        <div className={styles.kpi} data-tone="bad">
          <span className={styles.kpiLabel}>Replacement / disposal</span>
          <span className={styles.kpiValue}>{counts.replacement.toLocaleString('en-PH')}</span>
          <span className={styles.kpiSub}>Unserviceable, repair-heavy, paperwork</span>
        </div>
        <div className={styles.kpi} data-tone="ok">
          <span className={styles.kpiLabel}>Idle / reassignment</span>
          <span className={styles.kpiValue}>{counts.idle.toLocaleString('en-PH')}</span>
          <span className={styles.kpiSub}>Available &gt; 180 days + custody</span>
        </div>
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>PPMP quantity signals</span>
          <span className={styles.kpiValue}>{counts.consumption.toLocaleString('en-PH')}</span>
          <span className={styles.kpiSub}>From 3 fiscal years of issuance</span>
        </div>
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Recommendation groups">
        {tabs.map((tab) => {
          const group = groups.find((g) => g.key === tab.key)
          const count = tab.key === 'all' ? counts.total : group?.total ?? 0
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={filter === tab.key}
              className={styles.tab}
              data-active={filter === tab.key}
              onClick={() => setFilter(tab.key)}
            >
              {tab.label}
              <span className={styles.tabCount}>{count}</span>
            </button>
          )
        })}
      </div>

      <div className={styles.groups}>
        {groups.map((group) => (
          <GroupPanel key={group.key} group={group} filter={filter} />
        ))}
      </div>
    </section>
  )
}
