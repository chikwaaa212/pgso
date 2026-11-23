'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  ArrowUpRight,
  Boxes,
  ChartColumn,
  CircleCheck,
  Clock3,
  PackagePlus,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wrench,
} from 'lucide-react'
import { useCachedAction } from '@/hooks/use-cached-action'
import { buildQueryKey } from '@/lib/query-keys'
import { label } from '@/lib/labels'
import { fetchPrescriptiveRecommendations } from '@/lib/prescriptive-actions'
import type {
  Priority,
  Recommendation,
  RecommendationGroupKey,
} from '@/lib/prescriptive/types'
import styles from './recommendations.module.css'

type Portal = 'personnel' | 'super-admin'
type GroupFilter = 'all' | RecommendationGroupKey
type PriorityFilter = 'all' | Priority

interface FlatRow {
  row: Recommendation
  group: RecommendationGroupKey
}

interface Turn {
  id: number
  group: GroupFilter
  priority: PriorityFilter
}

const PRIORITY_LABEL: Record<Priority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

/** Plain-language headline for each rule, so no machine codes reach the UI. */
const RULE_LABEL: Record<string, string> = {
  REPLENISH_OUT_OF_STOCK: 'Out of stock',
  REPLENISH_CRITICAL: 'Almost out',
  REPLENISH_BELOW_THRESHOLD: 'Below reorder point',
  DISPOSE_UNSERVICEABLE: 'Unserviceable',
  REPAIR_OR_REPLACE: 'Repair or replace',
  REPLACE_REPAIR_HEAVY: 'Repaired often',
  RETIRED_DOCUMENTATION: 'Missing disposal papers',
  IDLE_AVAILABLE: 'Unused for 180+ days',
  IDLE_MATCHED_DEMAND: 'Matches a request',
  DUPLICATE_CUSTODY: 'Assigned twice',
  CONSUMPTION_HISTORY: 'Past usage',
}

const GROUP_META: Record<
  RecommendationGroupKey,
  { label: string; blurb: string }
> = {
  replenishment: {
    label: 'Restock soon',
    blurb: 'Items running low or already out of stock.',
  },
  replacement: {
    label: 'Repair or replace',
    blurb: 'Assets that are broken, costly to repair, or missing paperwork.',
  },
  dispose: {
    label: 'Disposal review',
    blurb: 'Unserviceable or retired assets ready for condemnation.',
  },
  idle: {
    label: 'Unused assets',
    blurb: 'Items sitting idle that another office may need.',
  },
  consumption: {
    label: 'Buying plan hints',
    blurb: 'Purchase quantities suggested by your past issuance history.',
  },
}

const GROUP_ORDER: RecommendationGroupKey[] = [
  'replenishment',
  'dispose',
  'replacement',
  'idle',
  'consumption',
]

/** Each action keeps one label for its destination, so the buttons stay consistent. */
const LINK_LABEL: Record<RecommendationGroupKey, string> = {
  replenishment: 'Open inventory',
  replacement: 'Open asset',
  dispose: 'Open asset',
  idle: 'Open asset',
  consumption: 'Open buying plan',
}

/** A few rules lead somewhere else than their group's usual destination. */
const RULE_LINK_LABEL: Record<string, string> = {
  IDLE_MATCHED_DEMAND: 'Open request',
}

function linkLabel(group: RecommendationGroupKey, rule: string): string {
  return RULE_LINK_LABEL[rule] ?? LINK_LABEL[group]
}

const PRIORITY_ORDER: Record<Priority, number> = { high: 0, medium: 1, low: 2 }

function GroupIcon({
  group,
  size = 15,
}: {
  group: RecommendationGroupKey | 'all'
  size?: number
}) {
  if (group === 'all') return <Sparkles size={size} aria-hidden="true" />
  if (group === 'replenishment') return <PackagePlus size={size} aria-hidden="true" />
  if (group === 'dispose') return <Trash2 size={size} aria-hidden="true" />
  if (group === 'replacement') return <Wrench size={size} aria-hidden="true" />
  if (group === 'idle') return <Boxes size={size} aria-hidden="true" />
  return <ChartColumn size={size} aria-hidden="true" />
}

function formatGenerated(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'just now'
  return d.toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Manila',
  })
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many
}

function sortRows(rows: FlatRow[]): FlatRow[] {
  return [...rows].sort(
    (a, b) =>
      PRIORITY_ORDER[a.row.priority] - PRIORITY_ORDER[b.row.priority] ||
      a.row.title.localeCompare(b.row.title)
  )
}

function turnTitle(turn: Turn): string {
  const category = turn.group === 'all' ? 'All suggestions' : GROUP_META[turn.group].label
  if (turn.priority === 'all') return category
  return `${PRIORITY_LABEL[turn.priority]} priority · ${category}`
}

function turnPrompt(turn: Turn): string {
  const category =
    turn.group === 'all' ? 'all suggestions' : GROUP_META[turn.group].label
  if (turn.priority === 'all') return `Show ${category}`
  return `Show ${PRIORITY_LABEL[turn.priority].toLowerCase()} priority · ${category}`
}

function replyFor(turn: Turn, count: number): string {
  const category =
    turn.group === 'all' ? 'all suggestions' : GROUP_META[turn.group].label.toLowerCase()
  const priority =
    turn.priority === 'all' ? '' : ` ${PRIORITY_LABEL[turn.priority].toLowerCase()}-priority`

  if (count === 0) {
    return `I couldn't find any${priority} suggestions in ${category} right now. Try another tab below — the other categories may have what you need.`
  }

  return `Here ${count === 1 ? 'is' : 'are'} ${count}${priority} ${plural(
    count,
    'suggestion',
    'suggestions'
  )} in ${category}. Every detail is expanded below.`
}

/** One recommendation, fully expanded — no extra click to read the evidence. */
function RecommendationCard({
  row,
  group,
}: {
  row: Recommendation
  group: RecommendationGroupKey
}) {
  return (
    <article className={styles.recCard} data-priority={row.priority}>
      <header className={styles.recHead}>
        <div className={styles.recMeta}>
          <span className={styles.groupTag}>
            <GroupIcon group={group} size={13} />
            {GROUP_META[group].label}
          </span>
          <span className={styles.priority} data-priority={row.priority}>
            {PRIORITY_LABEL[row.priority]}
          </span>
          <span className={styles.ruleTag}>
            {RULE_LABEL[row.rule] ?? label(row.rule)}
          </span>
        </div>
        <h3 className={styles.recTitle}>{row.title}</h3>
        <p className={styles.recSubject}>{row.subject}</p>
      </header>

      <div className={styles.detail}>
        <section className={styles.detailSection}>
          <h4 className={styles.detailLabel}>
            <Sparkles size={13} aria-hidden="true" /> Why this was suggested
          </h4>
          <p className={styles.detailText}>{row.reason}</p>
        </section>

        <section className={styles.detailSection}>
          <h4 className={styles.detailLabel}>
            <ArrowRight size={13} aria-hidden="true" /> What to do next
          </h4>
          <p className={styles.detailText}>{row.action}</p>
        </section>

        <section className={styles.detailSection}>
          <h4 className={styles.detailLabel}>
            <ChartColumn size={13} aria-hidden="true" /> The numbers behind it
          </h4>
          <dl className={styles.evidence}>
            {row.evidence.map((item, index) => (
              <div key={`${item.label}-${index}`} className={styles.evidenceItem}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <div className={styles.detailFooter}>
          <span className={styles.detailGroup}>
            <GroupIcon group={group} size={13} />
            {GROUP_META[group].label}
          </span>
          {row.href ? (
            <Link href={row.href} className={styles.actionPrimary}>
              {linkLabel(group, row.rule)}
              <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  )
}

export function RecommendationsWorkspace({ portal }: { portal: Portal }) {
  const [groupFilter, setGroupFilter] = useState<GroupFilter>('all')
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all')
  const [turns, setTurns] = useState<Turn[]>([])

  const turnSeq = useRef(0)
  const latestTurnRef = useRef<HTMLDivElement>(null)

  const load = useCallback(
    () => fetchPrescriptiveRecommendations(portal),
    [portal]
  )
  const { data, loading, isValidating, error, refresh } = useCachedAction(
    buildQueryKey({ module: portal, resource: 'recommendations' }),
    load,
    { staleTime: 60_000 }
  )

  const allRows = useMemo<FlatRow[]>(() => {
    const rows =
      data?.groups.flatMap((group) =>
        group.rows.map((row) => ({ row, group: group.key }))
      ) ?? []
    return sortRows(rows)
  }, [data])

  const groupRows = useMemo<FlatRow[]>(
    () =>
      groupFilter === 'all'
        ? allRows
        : allRows.filter(({ row }) => row.group === groupFilter),
    [allRows, groupFilter]
  )

  const priorityCounts = useMemo(
    () => ({
      all: groupRows.length,
      high: groupRows.filter(({ row }) => row.priority === 'high').length,
      medium: groupRows.filter(({ row }) => row.priority === 'medium').length,
      low: groupRows.filter(({ row }) => row.priority === 'low').length,
    }),
    [groupRows]
  )

  const addTurn = (group: GroupFilter, priority: PriorityFilter) => {
    turnSeq.current += 1
    setTurns((prev) => [...prev, { id: turnSeq.current, group, priority }])
  }

  const chooseGroup = (key: GroupFilter) => {
    setGroupFilter(key)
    addTurn(key, priorityFilter)
  }

  const choosePriority = (key: PriorityFilter) => {
    setPriorityFilter(key)
    addTurn(groupFilter, key)
  }

  useEffect(() => {
    if (turns.length === 0) return
    latestTurnRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [turns.length])

  if (loading && !data) {
    return (
      <section className={styles.page} aria-busy="true">
        <div className={styles.content}>
          <div className={styles.skeletonHeader} />
          <div className={styles.skeletonMsg}>
            <div className={styles.skeletonAvatar} />
            <div className={styles.skeletonLines}>
              <div className={styles.skeletonLine} />
              <div className={styles.skeletonLine} />
            </div>
          </div>
          <div className={styles.skeletonCards}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className={styles.skeletonCard} />
            ))}
          </div>
        </div>
      </section>
    )
  }

  if (!data) {
    return (
      <section className={styles.page}>
        <div className={styles.content}>
          <header className={styles.topbar}>
            <div className={styles.brand}>
              <span className={styles.brandMark} aria-hidden="true">
                <Sparkles size={16} />
              </span>
              <div>
                <h1 className={styles.title}>Recommendations</h1>
                <p className={styles.topbarSub}>PGSO Assistant</p>
              </div>
            </div>
          </header>
          <div className={styles.msg}>
            <span className={styles.avatar} aria-hidden="true">
              <Sparkles size={15} />
            </span>
            <div className={styles.msgBody}>
              <p className={styles.msgMeta}>PGSO Assistant</p>
              <p className={styles.msgText}>
                I couldn&apos;t load your suggestions right now.{' '}
                {error || 'Please try again in a moment.'}
              </p>
              <div>
                <button type="button" className={styles.actionPrimary} onClick={refresh}>
                  Try again
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    )
  }

  const { counts } = data

  const headline =
    counts.total === 0
      ? 'Everything looks good today.'
      : counts.high > 0
        ? `${counts.high} ${plural(counts.high, 'item needs', 'items need')} attention soon.`
        : `${counts.total} ${plural(counts.total, 'suggestion', 'suggestions')} to review.`

  const summary =
    counts.total === 0
      ? 'I watch stock levels, asset condition and past usage. When something crosses a threshold, it will show up here.'
      : `I found ${counts.total} in total: ${counts.replenishment} for restocking, ${counts.dispose} for disposal review, ${counts.replacement} for repair or replacement, ${counts.idle} for unused assets and ${counts.consumption} for planning purchases. Every suggestion is already expanded below — click a tab at the bottom and I'll add a focused answer to the conversation.`

  return (
    <section className={styles.page}>
      <div className={styles.content}>
        <header className={styles.topbar}>
          <div className={styles.brand}>
            <span className={styles.brandMark} aria-hidden="true">
              <Sparkles size={16} />
            </span>
            <div>
              <h1 className={styles.title}>Recommendations</h1>
              <p className={styles.topbarSub}>
                PGSO Assistant
                <span className={styles.dot} aria-hidden="true" />
                <Clock3 size={12} aria-hidden="true" />
                Updated {formatGenerated(data.generatedAt)}
                {isValidating ? <span className={styles.updating}>Checking…</span> : null}
              </p>
            </div>
          </div>
        </header>

        <div className={styles.thread}>
          <div className={styles.msg}>
            <span className={styles.avatar} aria-hidden="true">
              <Sparkles size={15} />
            </span>
            <div className={styles.msgBody}>
              <p className={styles.msgMeta}>PGSO Assistant</p>
              <p className={styles.msgText}>
                <strong className={styles.msgLead}>{headline}</strong> {summary}
              </p>
              <p className={styles.advisoryNote}>
                <ShieldCheck size={13} aria-hidden="true" />
                {portal === 'super-admin'
                  ? 'Advisory only — this view covers every asset, stock item, repair, issuance and request across the province. Nothing is changed automatically.'
                  : 'Advisory only — suggestions come from records you handle, plus unserviceable equipment and low-stock items. Nothing is changed automatically.'}
              </p>

              {counts.total === 0 ? (
                <div className={styles.noResults}>
                  <CircleCheck size={18} aria-hidden="true" />
                  <p>
                    Nothing needs your attention right now. No record is above its
                    threshold — new suggestions will appear here as they come in.
                  </p>
                </div>
              ) : (
                <>
                  <div className={styles.resultsHead}>
                    <h2 className={styles.resultsTitle}>All suggestions</h2>
                    <span className={styles.resultsCount}>
                      {allRows.length} of {counts.total}
                    </span>
                  </div>
                  <div className={styles.results}>
                    {allRows.map(({ row, group }) => (
                      <RecommendationCard key={row.id} row={row} group={group} />
                    ))}
                  </div>
                  {allRows.length < counts.total ? (
                    <p className={styles.moreNote}>
                      Only the highest-priority {allRows.length} of {counts.total}{' '}
                      {plural(counts.total, 'suggestion', 'suggestions')} are listed.
                      Pick a category below to see the rest.
                    </p>
                  ) : null}
                </>
              )}
            </div>
          </div>

          {turns.map((turn, index) => {
            const rows = allRows.filter(
              ({ row }) =>
                (turn.group === 'all' || row.group === turn.group) &&
                (turn.priority === 'all' || row.priority === turn.priority)
            )
            const total =
              turn.group === 'all' ? counts.total : counts[turn.group]
            const isLatest = index === turns.length - 1

            return (
              <div
                key={turn.id}
                className={styles.turn}
                ref={isLatest ? latestTurnRef : undefined}
              >
                <div className={styles.userMsg}>
                  <div className={styles.userBubble}>{turnPrompt(turn)}</div>
                </div>

                <div className={styles.msg}>
                  <span className={styles.avatar} aria-hidden="true">
                    <Sparkles size={15} />
                  </span>
                  <div className={styles.msgBody}>
                    <p className={styles.msgMeta}>PGSO Assistant</p>
                    <p className={styles.msgText}>{replyFor(turn, rows.length)}</p>

                    {rows.length > 0 ? (
                      <>
                        <div className={styles.resultsHead}>
                          <h2 className={styles.resultsTitle}>{turnTitle(turn)}</h2>
                          <span className={styles.resultsCount}>
                            {rows.length} of {total}
                          </span>
                        </div>
                        <div className={styles.results}>
                          {rows.map(({ row, group }) => (
                            <RecommendationCard key={row.id} row={row} group={group} />
                          ))}
                        </div>
                        {turn.priority === 'all' && rows.length < total ? (
                          <p className={styles.moreNote}>
                            Only the highest-priority {rows.length} of {total}{' '}
                            {plural(total, 'suggestion', 'suggestions')} are listed.
                          </p>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className={styles.bottomBar}>
        <div className={styles.dockInner}>
          <div className={styles.filterRow} role="group" aria-label="What to display">
            <span className={styles.filterLabel}>Show</span>
            <button
              type="button"
              className={styles.optionChip}
              data-active={groupFilter === 'all'}
              aria-pressed={groupFilter === 'all'}
              onClick={() => chooseGroup('all')}
            >
              <GroupIcon group="all" size={13} />
              All suggestions
              <span className={styles.chipCount}>{counts.total}</span>
            </button>
            {GROUP_ORDER.map((key) => (
              <button
                key={key}
                type="button"
                className={styles.optionChip}
                data-active={groupFilter === key}
                aria-pressed={groupFilter === key}
                title={GROUP_META[key].blurb}
                onClick={() => chooseGroup(key)}
              >
                <GroupIcon group={key} size={13} />
                {GROUP_META[key].label}
                <span className={styles.chipCount}>{counts[key]}</span>
              </button>
            ))}
          </div>

          {counts.total > 0 ? (
            <div
              className={styles.priorityRow}
              role="group"
              aria-label="Filter by priority"
            >
              <span className={styles.filterLabel}>Priority</span>
              {(
                [
                  { key: 'all', label: 'Any' },
                  { key: 'high', label: 'High' },
                  { key: 'medium', label: 'Medium' },
                  { key: 'low', label: 'Low' },
                ] as { key: PriorityFilter; label: string }[]
              ).map((option) => (
                <button
                  key={option.key}
                  type="button"
                  className={styles.priorityChip}
                  data-active={priorityFilter === option.key}
                  aria-pressed={priorityFilter === option.key}
                  onClick={() => choosePriority(option.key)}
                >
                  {option.key !== 'all' ? (
                    <span
                      className={styles.priorityDot}
                      data-priority={option.key}
                      aria-hidden="true"
                    />
                  ) : null}
                  {option.label}
                  <span className={styles.chipCount}>
                    {priorityCounts[option.key]}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
