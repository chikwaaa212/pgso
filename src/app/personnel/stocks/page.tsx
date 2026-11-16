'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  Boxes,
  Eye,
  Layers3,
  PackageSearch,
  QrCode,
  Send,
  TriangleAlert,
  Users,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/personnel/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  getInventoryPage,
  getInventoryStats,
  type InventoryRow,
} from './actions'
import { getUnifiedAsset } from '../assets/actions'
import {
  IssuanceEvaluateDialog,
  type IssuanceOptimisticLine,
} from '@/components/personnel/IssuanceDialog'
import { TablePager } from '@/components/personnel/TablePager'
import { EmptySearchState } from '@/components/personnel/EmptySearchState'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { useCachedAction } from '@/hooks/use-cached-action'
import { buildQueryKey, resourcePrefix } from '@/lib/query-keys'
import { assetOptionDisabledReason } from '@/lib/asset-option'
import { CLIENT_CACHE_KEYS, bustClientCache } from '@/lib/client-cache'
import { cn } from '@/lib/utils'
import { STOCKS_PAGE_SIZE } from './constants'
import InventoryLoading from './loading'
import assetStyles from '../assets/page.module.css'
import styles from './page.module.css'

type Level = 'ok' | 'low' | 'critical' | 'out' | 'none'

/** On-demand QR target — the list window never carries 1000 data URLs. */
type QrTarget = { id: string; label: string; qr_data_url?: string }

function levelOf(item: InventoryRow): Level {
  if (item.quantity <= 0) return 'out'
  if (item.reorder_threshold == null) return 'none'
  if (item.quantity <= Math.floor(item.reorder_threshold / 2)) return 'critical'
  if (item.quantity <= item.reorder_threshold) return 'low'
  return 'ok'
}

function levelLabel(level: Level) {
  if (level === 'out') return 'Out of stock'
  if (level === 'critical') return 'Critical'
  if (level === 'low') return 'Low'
  if (level === 'ok') return 'In stock'
  return 'No reorder point'
}

function levelTone(level: Level): 'ok' | 'warn' | 'bad' | 'neutral' {
  if (level === 'critical' || level === 'out') return 'bad'
  if (level === 'low') return 'warn'
  if (level === 'ok') return 'ok'
  return 'neutral'
}

const NUMBER = new Intl.NumberFormat('en-PH')

function fmtNumber(value: number) {
  return NUMBER.format(value)
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

function assigneeDate(value: string | null) {
  if (!value) return ''
  const d = new Date(value.includes('T') ? value : `${value}T00:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Manila',
  })
}

/** Yellow 24px action buttons — same treatment as the assets page. */
const ACTION_BTN = cn(
  'h-6 gap-1.5 rounded-[4px] border border-yellow-500 bg-yellow-500 px-3 text-xs font-semibold',
  'text-navy-900 opacity-[0.85] transition-colors hover:bg-yellow-400 hover:text-navy-900 hover:opacity-100 disabled:opacity-40'
)

const LEVEL_FILTERS = [
  { value: 'all', label: 'All stock levels' },
  { value: 'ok', label: 'In stock' },
  { value: 'low', label: 'Low' },
  { value: 'critical', label: 'Critical' },
  { value: 'out', label: 'Out of stock' },
  { value: 'none', label: 'No reorder point' },
] as const

/** The whole stock window is loaded once; search/filter/page stay local. */
const FETCH_LIMIT = 1000

function PersonnelInventoryContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const [level, setLevel] = useState(searchParams.get('level') ?? 'all')
  const pageSize = STOCKS_PAGE_SIZE
  const [page, setPage] = useState(
    Math.max(1, Number(searchParams.get('page')) || 1)
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [issuanceOpen, setIssuanceOpen] = useState(false)
  const [presetAssetId, setPresetAssetId] = useState<string | null>(null)
  const [qrRow, setQrRow] = useState<QrTarget | null>(null)
  const [qrLoading, setQrLoading] = useState(false)
  const [assigneeRow, setAssigneeRow] = useState<InventoryRow | null>(null)
  // Only the URL write is debounced — the table reads `query` directly so
  // typing filters results on the same keystroke, with no fetch involved.
  const debouncedQuery = useDebouncedValue(query, 300)

  // URL persistence: page/search/filters survive reload + back-navigation.
  const setUrl = useCallback(
    (next: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [k, v] of Object.entries(next)) {
        if (v === null || v === '' || v === 'all') params.delete(k)
        else params.set(k, v)
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    },
    [searchParams, router, pathname]
  )

  useEffect(() => {
    setUrl({
      page: page === 1 ? null : String(page),
      q: debouncedQuery || null,
      level,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedQuery, level])

  // One stock-only read: rows a passed inspection fed. Everything after this
  // (search, account code, level, paging) runs in memory so results are
  // instant and never re-fetch or show a stale page.
  const {
    data: ledgerData,
    loading,
    error: pageError,
    refresh: refreshLedger,
    mutate: mutateLedger,
  } = useCachedAction(
    buildQueryKey({
      module: 'personnel',
      resource: 'inventory',
      page: 1,
      pageSize: FETCH_LIMIT,
      filters: { kind: 'stock', passedOnly: true },
    }),
    () =>
      getInventoryPage({
        page: 1,
        pageSize: FETCH_LIMIT,
        kind: 'stock',
        passedOnly: true,
      }),
    { staleTime: 60_000 }
  )
  const rows = useMemo(() => ledgerData?.rows ?? [], [ledgerData])

  const { data: statsData, refresh: refreshStats } = useCachedAction(
    buildQueryKey({
      module: 'personnel',
      resource: 'inventory-stats',
      filters: { kind: 'stock', passedOnly: true },
    }),
    () => getInventoryStats({ passedOnly: true, kind: 'stock' }),
    { staleTime: 60_000 }
  )

  const stats = {
    skus: statsData?.skus ?? 0,
    units: statsData?.units ?? 0,
    low: statsData?.low ?? 0,
    critical: statsData?.critical ?? 0,
    out: statsData?.out ?? 0,
    none: statsData?.none ?? 0,
  }
  const attention = stats.out + stats.critical + stats.low
  const attentionTone = stats.out > 0 || stats.critical > 0 ? 'bad' : 'warn'
  const attentionMeta =
    stats.skus === 0
      ? 'No stock records yet'
      : attention === 0
        ? stats.none > 0
          ? `${stats.none} item${stats.none !== 1 ? 's have' : ' has'} no reorder point`
          : 'All items are above their reorder point'
        : [
            stats.out > 0 ? `${stats.out} out of stock` : '',
            stats.critical > 0 ? `${stats.critical} critical` : '',
            stats.low > 0 ? `${stats.low} low` : '',
          ]
            .filter(Boolean)
            .join(' · ')

  // Local filtering + paging over the loaded stock window.
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return rows.filter((row) => {
      if (level !== 'all' && levelOf(row) !== level) return false
      if (!needle) return true
      return [row.item_name, row.account_code, row.account_title, row.account_name, row.location, row.unit, row.category].some(
        (value) => value != null && value.toLowerCase().includes(needle)
      )
    })
  }, [rows, query, level])

  const total = filtered.length
  const hasFilters = query.trim() !== '' || level !== 'all'
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(Math.max(1, page), pageCount)
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)

  const clearFilters = () => {
    setQuery('')
    setLevel('all')
    setPage(1)
    setSelectedId(null)
  }

  const selectedRow = rows.find((r) => r.id === selectedId) ?? null
  // Shared availability rule — the row action, the header action and the
  // issuance dialog all agree on what "assignable" means.
  const selectedAssignReason = selectedRow
    ? assetOptionDisabledReason({
        source: 'stock',
        quantity: selectedRow.quantity,
      })
    : null
  const selectedAssignable = selectedRow !== null && selectedAssignReason === null

  const reload = useCallback(() => {
    // Own write (issue/assign): drop the affected client caches, then refetch
    // this window and its header stats.
    bustClientCache([
      CLIENT_CACHE_KEYS.dashboard,
      CLIENT_CACHE_KEYS.issuances,
      CLIENT_CACHE_KEYS.logs,
      CLIENT_CACHE_KEYS.inventory,
      resourcePrefix('personnel', 'dashboard'),
      resourcePrefix('personnel', 'issuances'),
      resourcePrefix('personnel', 'logs'),
      resourcePrefix('personnel', 'inventory'),
      resourcePrefix('personnel', 'inventory-stats'),
      resourcePrefix('personnel', 'assets'),
      resourcePrefix('personnel', 'documents'),
    ])
    refreshLedger()
    refreshStats()
  }, [refreshLedger, refreshStats])

  /** Instant paint after confirming: decrement stock before the server replies. */
  const applyIssuanceOptimistic = useCallback(
    (lines: IssuanceOptimisticLine[]) => {
      const byId = new Map(lines.map((l) => [l.itemId, l]))
      const patchRow = (row: InventoryRow): InventoryRow => {
        const line = byId.get(row.id)
        if (!line) return row
        const assignees = row.assignees ?? []
        return {
          ...row,
          quantity: Math.max(0, row.quantity - line.quantity),
          assignees: assignees.some((a) => a.id === line.employeeId)
            ? assignees
            : [
                {
                  id: line.employeeId,
                  name: line.employeeName ?? 'New assignee',
                  doc_type: null,
                  doc_no: null,
                  date: null,
                  current: false,
                },
                ...assignees,
              ],
        }
      }
      mutateLedger((prev) =>
        prev
          ? {
              ...prev,
              rows: prev.rows.map(patchRow),
              data: prev.data.map(patchRow),
            }
          : prev
      )
    },
    [mutateLedger]
  )

  // QR is generated on demand for the one row you click.
  const openQr = useCallback(async (row: InventoryRow) => {
    setQrRow({ id: row.id, label: row.item_name })
    setQrLoading(true)
    try {
      const fresh = await getUnifiedAsset(row.id)
      if (fresh?.qr_data_url) {
        setQrRow((prev) =>
          prev && prev.id === row.id
            ? { ...prev, qr_data_url: fresh.qr_data_url }
            : prev
        )
      }
    } catch {
      /* keep the placeholder */
    } finally {
      setQrLoading(false)
    }
  }, [])

  if (loading && !ledgerData) return <InventoryLoading />

  return (
    <section className={styles.section}>
      <PageHeader
        eyebrow="Inventory"
        title="Stocks"
        subtitle="Inventory is filled automatically by passed inspections."
        meta={`${statsData ? fmtNumber(stats.skus) : "—"} SKU${
          stats.skus === 1 ? "" : "s"
        } · ${statsData ? fmtNumber(stats.units) : "—"} units on hand`}
        actions={
          <div className={styles.headerActions}>
            <Button
              type="button"
              disabled={selectedId !== null && !selectedAssignable}
              title={
                selectedId !== null && !selectedAssignable
                  ? `Cannot assign — ${(selectedAssignReason ?? 'unavailable').toLowerCase()}`
                  : 'Issue the selected stock item to an employee'
              }
              onClick={() => {
                setPresetAssetId(selectedId)
                setIssuanceOpen(true)
              }}
              className={ACTION_BTN}
            >
              <Send size={13} aria-hidden="true" />
              Issue / Assign
            </Button>
          </div>
        }
      />

      <div className={styles.summary}>
        <div className={styles.summaryCard}>
          <span className={styles.summaryIcon}>
            <Boxes size={16} aria-hidden="true" />
          </span>
          <div className={styles.summaryBody}>
            <p className={styles.summaryLabel}>Items in the ledger</p>
            <p className={styles.summaryValue}>
              {statsData ? fmtNumber(stats.skus) : '—'}
            </p>
            <p className={styles.summaryMeta}>
              Distinct items with stock records
            </p>
          </div>
        </div>

        <div className={styles.summaryCard}>
          <span className={styles.summaryIcon}>
            <Layers3 size={16} aria-hidden="true" />
          </span>
          <div className={styles.summaryBody}>
            <p className={styles.summaryLabel}>Units on hand</p>
            <p className={styles.summaryValue}>
              {statsData ? fmtNumber(stats.units) : '—'}
            </p>
            <p className={styles.summaryMeta}>
              Total quantity across all items
            </p>
          </div>
        </div>

        <div className={styles.summaryCard} data-tone={attention > 0 ? attentionTone : undefined}>
          <span className={styles.summaryIcon}>
            <TriangleAlert size={16} aria-hidden="true" />
          </span>
          <div className={styles.summaryBody}>
            <p className={styles.summaryLabel}>Needs replenishment</p>
            <p className={styles.summaryValue}>
              {statsData ? fmtNumber(attention) : '—'}
            </p>
            <p className={styles.summaryMeta}>{attentionMeta}</p>
          </div>
        </div>
      </div>

      {statsData && attention > 0 ? (
        <div className={styles.notice} role="alert">
          <TriangleAlert size={16} aria-hidden="true" />
          <p className={styles.noticeText}>
            <strong>
              {attention} item{attention !== 1 ? 's' : ''} at or below the
              reorder point.
            </strong>{' '}
            {stats.out > 0
              ? `${stats.out} out of stock${stats.low + stats.critical > 0 ? `, ${stats.low + stats.critical} low or critical` : ''}.`
              : `${stats.low + stats.critical} low or critical.`}{' '}
            File a replenishment request before operations are affected.{' '}
            <Link href="/personnel/requests" className={styles.noticeLink}>
              Go to Requests
            </Link>
          </p>
        </div>
      ) : null}

      <Card className={styles.panel}>
        <div className={styles.toolbar}>
          <p className={styles.toolbarInfo} aria-live="polite">
            {!ledgerData ? (
              'Loading stock ledger…'
            ) : hasFilters ? (
              <>
                Showing <strong>{fmtNumber(total)}</strong> of{' '}
                {fmtNumber(rows.length)} item{rows.length !== 1 ? 's' : ''}
              </>
            ) : (
              <>
                <strong>{fmtNumber(rows.length)}</strong> item
                {rows.length !== 1 ? 's' : ''} in stocks
              </>
            )}
            {ledgerData && ledgerData.total > rows.length
              ? ` · first ${fmtNumber(rows.length)} loaded`
              : ''}
          </p>

          <div className={styles.filters}>
            <Input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setPage(1)
              }}
              placeholder="Search item, code, or location…"
              className={styles.search}
              aria-label="Search stocks"
            />
            <Select
              value={level}
              onValueChange={(v) => {
                setLevel(v)
                setPage(1)
              }}
            >
              <SelectTrigger className={styles.levelSelect} aria-label="Filter by stock level">
                <SelectValue placeholder="Stock level" />
              </SelectTrigger>
              <SelectContent>
                {LEVEL_FILTERS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {pageError && rows.length === 0 && !loading ? (
          <div className={styles.empty} role="alert">
            <span className={styles.emptyIcon}>
              <TriangleAlert size={20} aria-hidden="true" />
            </span>
            <p className={styles.emptyTitle}>Could not load the stock ledger</p>
            <p className={styles.emptyText}>
              The inventories service did not respond. Refresh the page to try
              again.
            </p>
          </div>
        ) : visible.length === 0 ? (
          hasFilters ? (
            <EmptySearchState
              description="Try a different search term, account code, or stock level."
              onClear={clearFilters}
            />
          ) : (
            <div className={styles.empty}>
              <span className={styles.emptyIcon}>
                <PackageSearch size={20} aria-hidden="true" />
              </span>
              <p className={styles.emptyTitle}>No stock on hand yet</p>
              <p className={styles.emptyText}>
                Items appear here automatically once a delivery passes
                inspection. Record an inspection to start building the ledger.
              </p>
              <div className={styles.emptyActions}>
                <Link href="/personnel/inspections" className={styles.emptyPrimary}>
                  Go to Inspections
                </Link>
              </div>
            </div>
          )
        ) : (
          <div className={`${assetStyles.tableFit} ${assetStyles.tableLean}`}>
            <table className={styles.table} aria-label="Stock ledger">
              <thead>
                <tr>
                  <th className={assetStyles.cCode}>Account Code</th>
                  <th className={assetStyles.cType}>Type</th>
                  <th className={assetStyles.cTitle}>Stock Title</th>
                  <th className={assetStyles.cQty}>Qty Available</th>
                  <th className={assetStyles.cAvailability}>Availability</th>
                  <th className={assetStyles.cAssignee}>Assigned to</th>
                  <th className={`${assetStyles.cStatus} ${styles.statusCol}`}>Status</th>
                  <th className={assetStyles.cActions}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => {
                  const rowLevel = levelOf(item)
                  const isSelected = selectedId === item.id
                  const people = item.assignees ?? []
                  const assignBlockReason = assetOptionDisabledReason({
                    source: 'stock',
                    quantity: item.quantity,
                  })
                  const assignable = assignBlockReason === null
                  const accountText = [item.account_title, item.account_name]
                    .filter((v): v is string => !!v && v.trim() !== '')
                    .join(' · ')
                  return (
                    <tr
                      key={item.id}
                      className={
                        isSelected ? assetStyles.selectedRow : assetStyles.selectableRow
                      }
                      data-selected={isSelected ? 'true' : undefined}
                      aria-selected={isSelected}
                      tabIndex={0}
                      onClick={() =>
                        setSelectedId((prev) => (prev === item.id ? null : item.id))
                      }
                      onDoubleClick={() => router.push(`/personnel/stocks/${item.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setSelectedId((prev) => (prev === item.id ? null : item.id))
                        }
                      }}
                    >
                      <td
                        className={assetStyles.cCode}
                        title={[item.account_code, accountText].filter(Boolean).join(' — ') || undefined}
                      >
                        <span className={assetStyles.titleCell}>
                          <span className={assetStyles.titleMain}>
                            {item.account_code ?? '—'}
                          </span>
                          {accountText ? (
                            <span className={assetStyles.titleDesc}>{accountText}</span>
                          ) : null}
                        </span>
                      </td>
                      <td className={assetStyles.cType} title={item.category ?? undefined}>
                        {item.category ?? <span className={styles.muted}>—</span>}
                      </td>
                      <td
                        className={assetStyles.cTitle}
                        title={`${item.item_name}${item.location ? ` — ${item.location}` : ''}`}
                      >
                        <span className={assetStyles.titleCell}>
                          <span className={assetStyles.titleMain}>{item.item_name}</span>
                          <span className={assetStyles.titleDesc}>
                            {item.location ?? '—'}
                          </span>
                        </span>
                      </td>
                      <td
                        className={assetStyles.cQty}
                        title={`Reorder point: ${
                          item.reorder_threshold != null
                            ? `${fmtNumber(item.reorder_threshold)}${item.unit ? ` ${item.unit}` : ''}`
                            : 'not set'
                        }`}
                      >
                        <span className={assetStyles.qtyInline}>
                          {fmtNumber(item.quantity)}
                          {item.unit ? ` ${item.unit}` : ''}
                        </span>
                      </td>
                      <td className={assetStyles.cAvailability}>
                        {assignable ? (
                          <span className={styles.badge} data-tone="ok">
                            Available
                          </span>
                        ) : (
                          <span
                            className={styles.badge}
                            data-tone="bad"
                            title="No units left — restock before assigning to an employee."
                          >
                            {assignBlockReason ?? 'Unavailable'}
                          </span>
                        )}
                      </td>
                      <td className={assetStyles.cAssignee}>
                        {people.length === 0 ? (
                          <span className={assetStyles.assigneeEmpty}>—</span>
                        ) : (
                          <button
                            type="button"
                            className={assetStyles.assigneeBtn}
                            title={people.map((p) => p.name).join(', ')}
                            aria-label={`Show ${people.length} assigned employee${people.length === 1 ? '' : 's'}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              setAssigneeRow(item)
                            }}
                          >
                            <span className={assetStyles.assigneeName}>
                              {people[0].name}
                            </span>
                            {people.length > 1 ? (
                              <span className={assetStyles.assigneeMore}>
                                +{people.length - 1}
                              </span>
                            ) : null}
                          </button>
                        )}
                      </td>
                      <td className={`${assetStyles.cStatus} ${styles.statusCell}`}>
                        <span
                          className={styles.badge}
                          data-tone={levelTone(rowLevel)}
                          title={
                            item.reorder_threshold != null
                              ? `Reorder point: ${fmtNumber(item.reorder_threshold)}${item.unit ? ` ${item.unit}` : ''}`
                              : 'No reorder point has been set for this item.'
                          }
                        >
                          {levelLabel(rowLevel)}
                        </span>
                      </td>
                      <td className={assetStyles.cActions} onClick={(e) => e.stopPropagation()}>
                        <span className={assetStyles.actionsCell}>
                          <Link
                            href={`/personnel/stocks/${item.id}`}
                            className={assetStyles.rowActionMuted}
                            title="See details"
                            aria-label={`See details of ${item.item_name}`}
                          >
                            <Eye size={14} aria-hidden="true" />
                            View
                          </Link>
                          <button
                            type="button"
                            className={assetStyles.rowAction}
                            disabled={!assignable}
                            title={
                              assignBlockReason
                                ? `Cannot assign — ${assignBlockReason.toLowerCase()}`
                                : 'Assign this stock item to an employee'
                            }
                            onClick={() => {
                              setPresetAssetId(item.id)
                              setIssuanceOpen(true)
                            }}
                          >
                            <Send size={14} aria-hidden="true" />
                            Assign
                          </button>
                          <button
                            type="button"
                            className={assetStyles.rowIconAction}
                            title="Show QR code"
                            aria-label={`Show QR code of ${item.item_name}`}
                            onClick={() => void openQr(item)}
                          >
                            <QrCode size={14} />
                          </button>
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {total > 0 ? (
          <div className={styles.footer}>
            {total > pageSize ? (
              <TablePager
                id="inventory"
                total={total}
                page={safePage}
                pageSize={pageSize}
                onPageChange={setPage}
              />
            ) : (
              <span className={styles.footerInfo}>
                Showing all {fmtNumber(total)} item{total !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        ) : null}
      </Card>

      <Dialog
        open={assigneeRow !== null}
        onOpenChange={(v) => {
          if (!v) setAssigneeRow(null)
        }}
      >
        <DialogContent className="bg-white sm:max-w-md dark:bg-white">
          <DialogHeader>
            <DialogTitle>Assigned employees</DialogTitle>
            <DialogDescription>
              {assigneeRow
                ? `${assigneeRow.item_name} · ${(assigneeRow.assignees ?? []).length} assignment${(assigneeRow.assignees ?? []).length === 1 ? '' : 's'}`
                : '—'}
            </DialogDescription>
          </DialogHeader>
          <ul className={assetStyles.assigneeList}>
            {(assigneeRow?.assignees ?? []).map((person, i) => (
              <li key={`${person.id}-${i}`} className={assetStyles.assigneeItem}>
                <span className={assetStyles.assigneeAvatar} aria-hidden="true">
                  {initials(person.name) || <Users size={14} />}
                </span>
                <span className={assetStyles.assigneeInfo}>
                  <span className={assetStyles.assigneeItemName}>{person.name}</span>
                  <span className={assetStyles.assigneeItemMeta}>
                    {person.doc_type
                      ? `${person.doc_type}${person.doc_no ? ` · ${person.doc_no}` : ''}`
                      : 'Holder on record'}
                    {person.date ? ` · ${assigneeDate(person.date)}` : ''}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAssigneeRow(null)}
              className="h-8 rounded-[4px] px-3.5 text-xs font-semibold"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={qrRow !== null}
        onOpenChange={(v) => {
          if (!v) {
            setQrRow(null)
            setQrLoading(false)
          }
        }}
      >
        <DialogContent className="bg-white sm:max-w-xs dark:bg-white">
          <DialogHeader>
            <DialogTitle>QR code</DialogTitle>
            <DialogDescription>
              {qrRow ? `Stock — ${qrRow.label}` : '—'}
            </DialogDescription>
          </DialogHeader>
          <div className={assetStyles.qrOverlayBody}>
            {qrRow?.qr_data_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrRow.qr_data_url}
                alt={`QR code for ${qrRow.label}`}
                className={assetStyles.qrOverlayImg}
                width={96}
                height={96}
                loading="lazy"
                decoding="async"
              />
            ) : (
              <span className={assetStyles.qrPlaceholder}>
                {qrLoading ? 'Generating QR code…' : 'No QR code'}
              </span>
            )}
            <p className={assetStyles.qrValue}>{qrRow?.label ?? '—'}</p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setQrRow(null)}
              className="h-8 rounded-[4px] px-3.5 text-xs font-semibold"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {issuanceOpen ? (
        <IssuanceEvaluateDialog
          key={presetAssetId ?? 'direct'}
          open={issuanceOpen}
          onOpenChange={(v) => {
            setIssuanceOpen(v)
            if (!v) setPresetAssetId(null)
          }}
          mode="direct"
          presetAssetId={presetAssetId}
          onOptimisticSubmit={applyIssuanceOptimistic}
          onFailure={refreshLedger}
          onSuccess={() => {
            setIssuanceOpen(false)
            setPresetAssetId(null)
            reload()
          }}
        />
      ) : null}
    </section>
  )
}

export default function PersonnelInventoryPage() {
  return (
    <Suspense
      fallback={
        <section className={styles.section}>
          <div className={styles.header}>
            <div>
              <h1 className={styles.title}>Stocks</h1>
              <p className={styles.subtitle}>Loading stock ledger…</p>
            </div>
          </div>
        </section>
      }
    >
      <PersonnelInventoryContent />
    </Suspense>
  )
}
