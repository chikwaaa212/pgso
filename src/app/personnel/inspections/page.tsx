'use client'

import { useMemo, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getInspectionsCounts, getInspectionsPage, type UnifiedInspectionRow } from './actions'
import {
  getEmptyPendingAir,
  getEmptyPendingInspectionResults,
  getPendingAir,
  getPendingInspectionResults,
  subscribePendingAir,
  subscribePendingInspectionResults,
} from './optimistic-inspections'
import { IarDialog } from '@/components/personnel/IarDialog'
import { IarAttachButton } from '@/components/personnel/IarAttach'
import { InspectConfirmButton } from '@/components/personnel/InspectConfirmDialog'
import { InspectionHistoryDialog } from './components/inspection-history-dialog'
import { ViewIarDialog } from './components/view-iar-dialog'
import { ViewInspectionDialog } from './components/view-inspection-dialog'
import { TablePager, FIXED_PAGE_SIZE } from '@/components/personnel/TablePager'
import { pageWindow } from '@/components/ui/pagination'
import { useCachedAction } from '@/hooks/use-cached-action'
import { buildQueryKey, resourcePrefix } from '@/lib/query-keys'
import { inspectionHref } from '@/lib/inspection-ref'
import { portalFromPathname } from '@/lib/portal-path'
import { CLIENT_CACHE_KEYS, bustClientCache } from '@/lib/client-cache'
import { cn } from '@/lib/utils'
import styles from '../dashboard/page.module.css'
import air from './air-section.module.css'

function resultTone(result: string | null) {
  if (result === 'passed') return 'ok'
  if (result === 'failed') return 'bad'
  if (result === 'partial') return 'warn'
  return 'warn'
}

function fmt(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Manila',
  })
}

function resultLabel(d: UnifiedInspectionRow) {
  // Same verdict vocabulary as the Deliveries page's Inspection column.
  const verdict = d.inspection_status
  if (!verdict || verdict === 'pending') return 'Pending'
  if (verdict === 'failed') return 'Returned to supplier'
  return verdict.charAt(0).toUpperCase() + verdict.slice(1)
}

function resultChipTone(d: UnifiedInspectionRow) {
  if (d.inspection_status === 'pending') return 'info'
  return resultTone(d.inspection_status)
}

function isRevisableStatus(value: string | null | undefined) {
  const v = (value ?? '').toLowerCase()
  return v === 'partial' || v === 'failed'
}

/**
 * A delivered inspection is editable when EITHER the latest inspection
 * result OR the delivery-level status is Partial/Failed. The two can drift
 * on legacy rows — either one means there is still an outstanding balance
 * to collect, and the form (`inspection-form.tsx`) accepts the same set,
 * so the list and the form can never disagree about Edit.
 */
function canEditInspection(d: UnifiedInspectionRow) {
  if (d.inspection_status === 'pending') return false
  return isRevisableStatus(d.result) || isRevisableStatus(d.inspection_status)
}

function hasAir(d: UnifiedInspectionRow) {
  return !!(d.iar_no || d.iar_image_url)
}

/** One fetch loads the newest rows; search + pagination then run in memory. */
const FETCH_LIMIT = 100

/** Row actions mirror the Deliveries table buttons (24px, amber tint). */
const ROW_ACTION_CLASS = cn(
  "inline-flex h-6 items-center justify-center rounded-[4px] px-3",
  "border border-yellow-500/40 bg-yellow-500/20 text-xs font-semibold",
  "text-navy-900 transition-colors hover:bg-yellow-500/30"
)
const ROW_PRIMARY_CLASS = cn(
  "inline-flex h-6 items-center justify-center rounded-[4px] px-3",
  "border border-yellow-500 bg-yellow-500 text-xs font-semibold",
  "text-navy-900 transition-colors hover:bg-yellow-400"
)

const FILTERS = [
  { value: 'all', label: 'All verdicts' },
  { value: 'pending', label: 'Pending' },
  { value: 'passed', label: 'Passed' },
  { value: 'partial', label: 'Partial' },
  { value: 'failed', label: 'Returned to supplier' },
] as const

const AIR_STATUS_FILTERS = [
  { value: 'all', label: 'AIR status: All' },
  { value: 'issued', label: 'With AIR / IAR' },
  { value: 'awaiting', label: 'Without AIR' },
] as const

const AIR_RESULT_FILTERS = [
  { value: 'all', label: 'Result: All' },
  { value: 'passed', label: 'Passed' },
  { value: 'partial', label: 'Partial' },
  { value: 'pending', label: 'Pending' },
] as const

/**
 * Skeleton for the AIR / IAR tab — same stats, filter row, data table, and
 * pager as the real data so nothing jumps when records arrive.
 */
function AirTabSkeleton() {
  return (
    <div aria-hidden="true">
      <div className={air.stats}>
        {['Total records', 'AIR / IAR issued', 'Awaiting AIR'].map((label) => (
          <div key={label} className={air.stat}>
            <p className={air.statValue}>
              <span className="block h-7 w-12 animate-pulse rounded bg-navy-100" />
            </p>
            <p className={air.statLabel}>{label}</p>
          </div>
        ))}
      </div>

      <Card className={styles.panel}>
        <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
          <div className="h-8 w-72 max-w-full animate-pulse rounded-md bg-navy-100" />
          <div className="h-8 w-44 animate-pulse rounded-md bg-navy-100" />
          <div className="h-8 w-40 animate-pulse rounded-md bg-navy-100" />
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>PO ref</th>
                <th>Supplier</th>
                <th>Target arrival</th>
                <th>Date inspected</th>
                <th>AIR / IAR</th>
                <th>Result</th>
                <th>IAR No.</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 8 }).map((_, r) => (
                <tr key={r} style={{ opacity: 1 - r * 0.05 }}>
                  <td>
                    <div className="h-3.5 w-20 animate-pulse rounded bg-navy-100" />
                  </td>
                  <td>
                    <div className="h-3.5 w-24 animate-pulse rounded bg-navy-100" />
                  </td>
                  <td>
                    <div className="h-3.5 w-20 animate-pulse rounded bg-navy-100" />
                  </td>
                  <td>
                    <div className="h-3.5 w-20 animate-pulse rounded bg-navy-100" />
                  </td>
                  <td>
                    <div className="h-[22px] w-20 animate-pulse rounded-full bg-navy-100" />
                  </td>
                  <td>
                    <div className="h-[22px] w-16 animate-pulse rounded-full bg-navy-100" />
                  </td>
                  <td>
                    <div className="h-3.5 w-24 animate-pulse rounded bg-navy-100" />
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-1.5">
                      <span className={ROW_ACTION_CLASS}>View IAR</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={styles.pager}>
          <span className={styles.pagerInfo}>
            <span className="block h-3 w-36 animate-pulse rounded bg-navy-100" />
          </span>
          <div className={styles.pagerControls}>
            <span className={styles.pageSizeWrap}>
              <span>Rows</span>
              <span className="h-8 w-[5.5rem] animate-pulse rounded-md bg-navy-100" />
            </span>
            <span className={styles.pageBtn}>‹</span>
            <span className={styles.pageBtn} data-active="true">
              1
            </span>
            <span className={styles.pageBtn}>›</span>
          </div>
        </div>
      </Card>
    </div>
  )
}

export default function PersonnelInspectionsPage() {
  const pathname = usePathname()
  const portal = portalFromPathname(pathname)
  const readOnly = portal === 'super-admin'
  const [tab, setTab] = useState<'inspections' | 'air'>('inspections')
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [airStatus, setAirStatus] = useState('all')
  const [airResult, setAirResult] = useState('all')
  // Fixed 20 rows/page (no selector) — the DB returns only this window.
  const inspPageSize = FIXED_PAGE_SIZE
  const airPageSize = FIXED_PAGE_SIZE
  const [inspPage, setInspPage] = useState(1)
  const [airPage, setAirPage] = useState(1)
  // Row clicks open overlays instead of dedicated pages.
  const [historyTarget, setHistoryTarget] = useState<{
    deliveryId: string
    deliveryRef: string
  } | null>(null)
  const [viewTarget, setViewTarget] = useState<{
    deliveryId: string
    deliveryRef: string
  } | null>(null)

  // One fetch loads the newest rows; search + pagination then run entirely in
  // memory so typing filters instantly (matching Deliveries — no debounce,
  // no "Updating…", no stale page stack).
  const {
    data: inspData,
    loading: inspLoading,
    refresh: refreshInsp,
  } = useCachedAction(
    buildQueryKey({
      module: 'personnel',
      resource: 'inspections',
      page: 1,
      pageSize: FETCH_LIMIT,
      filters: { scope: 'inspections-log' },
    }),
    () => getInspectionsPage({ page: 1, pageSize: FETCH_LIMIT }),
    { staleTime: 30_000 }
  )
  // AIR tab keeps the DB-side AIR/result filters; its search runs locally too.
  const {
    data: airData,
    loading: airLoading,
    refresh: refreshAir,
  } = useCachedAction(
    buildQueryKey({
      module: 'personnel',
      resource: 'inspections-air',
      page: 1,
      pageSize: FETCH_LIMIT,
      filters: { scope: 'air-log', air: airStatus, result: airResult },
    }),
    () =>
      getInspectionsPage({
        page: 1,
        pageSize: FETCH_LIMIT,
        status: airResult,
        air: airStatus as 'all' | 'issued' | 'awaiting',
      }),
    { staleTime: 30_000 }
  )
  // Cheap counts for the AIR stats cards (no row payload).
  const { data: countsData } = useCachedAction(
    buildQueryKey({ module: 'personnel', resource: 'inspections-counts' }),
    getInspectionsCounts,
    { staleTime: 60_000 }
  )
  // Cold start only per tab: keep stale rows visible on filter/page changes
  // instead of flashing the skeleton again.
  const inspCold = inspLoading && !inspData
  const airCold = airLoading && !airData

  const reload = () => {
    // Own write (IAR attach etc.) — force fresh rows now and drop the
    // sibling snapshots (deliveries / dashboard / stocks) so their next
    // visit refetches instead of serving the pre-write payload.
    bustClientCache([
      CLIENT_CACHE_KEYS.deliveries,
      CLIENT_CACHE_KEYS.dashboard,
      CLIENT_CACHE_KEYS.inventory,
      resourcePrefix("personnel", "deliveries"),
      resourcePrefix("personnel", "dashboard"),
      resourcePrefix("personnel", "inventory"),
      resourcePrefix("personnel", "inventory-stats"),
    ])
    refreshInsp()
    refreshAir()
  }

  // Results submitted from the inspection form but not yet acknowledged by
  // the server. They overlay the matching row instantly; the cache bust on
  // success keeps them on screen until the revalidated list lands.
  const pendingResults = useSyncExternalStore(
    subscribePendingInspectionResults,
    getPendingInspectionResults,
    getEmptyPendingInspectionResults
  )

  // AIR generations submitted from the IAR dialog but not yet acknowledged by
  // the server — the row flips to "AIR issued" immediately.
  const pendingAir = useSyncExternalStore(
    subscribePendingAir,
    getPendingAir,
    getEmptyPendingAir
  )

  // Local filter + search over the loaded window — instant, no server round
  // trip while typing and no stale page shown mid-request.
  const filtered = useMemo(() => {
    const rows = (inspData?.rows ?? []).map((row): UnifiedInspectionRow => {
      const pending = pendingResults[row.delivery_id]
      if (!pending) return row
      return {
        ...row,
        result: pending.result,
        inspection_status: pending.result,
        inspector_name: pending.inspectorName || row.inspector_name,
        inspection_date: pending.inspectionDate || row.inspection_date,
      }
    })
    const q = query.trim().toLowerCase()
    return rows.filter((d) => {
      if (filter !== 'all' && d.inspection_status !== filter) return false
      if (!q) return true
      return [
        d.delivery_ref,
        d.supplier,
        d.po_reference,
        d.inspector_name,
        resultLabel(d),
      ].some((v) => (v ?? '').toLowerCase().includes(q))
    })
  }, [inspData, pendingResults, filter, query])

  const airMatches = (d: UnifiedInspectionRow) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return [
      d.delivery_ref,
      d.supplier,
      d.po_reference,
      d.inspector_name,
      d.iar_no,
      resultLabel(d),
    ].some((v) => (v ?? '').toLowerCase().includes(q))
  }
  const airRows = useMemo(
    () =>
      (airData?.rows ?? [])
        .map((row) => {
          const pending = pendingAir[row.delivery_id]
          return pending ? { ...row, iar_no: pending.iarNo } : row
        })
        .filter(airMatches),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [airData, query, pendingAir]
  )
  const inspTotal = filtered.length
  const airTotal = airRows.length
  const airStats = {
    total: countsData?.total ?? 0,
    issued: countsData?.issued ?? 0,
    awaiting: countsData?.awaiting ?? 0,
  }

  const inspPageCount = Math.max(1, Math.ceil(inspTotal / inspPageSize))
  const inspSafePage = Math.min(Math.max(1, inspPage), inspPageCount)
  const inspStart = (inspSafePage - 1) * inspPageSize
  const inspVisible = filtered.slice(inspStart, inspStart + inspPageSize)
  const inspPages = pageWindow(inspSafePage, inspPageCount)
  const inspFrom = inspTotal === 0 ? 0 : inspStart + 1
  const inspTo = Math.min(inspSafePage * inspPageSize, inspTotal)

  const airPageCount = Math.max(1, Math.ceil(airTotal / airPageSize))
  const airSafePage = Math.min(Math.max(1, airPage), airPageCount)
  const airStart = (airSafePage - 1) * airPageSize
  const airVisible = airRows.slice(airStart, airStart + airPageSize)

  return (
    <section className={styles.section}>
      <div className={styles.headerRow}>
        <h1 className={styles.title}>Inspections</h1>
        <div className={styles.actions}>
          <div className={air.tabs} role="tablist" aria-label="Inspections sections">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'inspections'}
              className={air.tab}
              data-active={tab === 'inspections'}
              onClick={() => {
                setTab('inspections')
                setInspPage(1)
              }}
            >
              Inspections
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'air'}
              className={air.tab}
              data-active={tab === 'air'}
              onClick={() => {
                setTab('air')
                setAirPage(1)
              }}
            >
              AIR / IAR
            </button>
          </div>
        </div>
      </div>

      {tab === 'inspections' ? (
        <Card className={styles.panel}>
          <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
            <Select
              value={filter}
              onValueChange={(v) => {
                setFilter(v)
                setInspPage(1)
              }}
            >
              <SelectTrigger className="h-8 w-48">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                {FILTERS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setInspPage(1)
              }}
              placeholder="Search supplier, PO, inspector, or ref…"
              aria-label="Search inspections"
              className="h-8 w-80 max-w-full rounded-md border border-navy-300 bg-white px-3 text-sm text-navy-900 placeholder:text-navy-400 focus-visible:outline-2 focus-visible:outline-offset-2"
            />
          </div>
          {inspCold ? (
            <div className={styles.tableWrap} aria-hidden="true">
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>PO ref</th>
                    <th>Supplier</th>
                    <th>Target arrival</th>
                    <th>Date inspected</th>
                    <th>Result</th>
                    <th style={{ textAlign: "right" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: inspPageSize }).map((_, r) => (
                    <tr key={r} style={{ opacity: 1 - r * 0.05 }}>
                      <td>
                        <div className="h-3.5 w-20 animate-pulse rounded bg-navy-100" />
                      </td>
                      <td>
                        <div className="h-3.5 w-24 animate-pulse rounded bg-navy-100" />
                      </td>
                      <td>
                        <div className="h-3.5 w-20 animate-pulse rounded bg-navy-100" />
                      </td>
                      <td>
                        <div className="h-3.5 w-20 animate-pulse rounded bg-navy-100" />
                      </td>
                      <td>
                        <div className="h-[22px] w-16 animate-pulse rounded-full bg-navy-100" />
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1.5">
                          <span className="inline-flex h-6 items-center justify-center rounded-[4px] border border-yellow-500/40 bg-yellow-500/20 px-3 text-xs font-semibold text-navy-900">
                            Edit
                          </span>
                          <span className="inline-flex h-6 items-center justify-center rounded-[4px] border border-yellow-500 bg-yellow-500 px-3 text-xs font-semibold text-navy-900">
                            Inspect
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : inspVisible.length === 0 ? (
            <div className={cn(styles.emptyState, "flex-1")}>
              <div className={styles.emptyCard}>
                <p className={styles.emptyCardText}>
                  No inspections match your search or filter.
                </p>
              </div>
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>PO ref</th>
                    <th>Supplier</th>
                    <th>Target arrival</th>
                    <th>Date inspected</th>
                    <th>Result</th>
                    <th style={{ textAlign: "right" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {inspVisible.map((d) => {
                    const isPending = d.inspection_status === 'pending'
                    const isEditable = canEditInspection(d)
                    return (
                      <tr
                        key={d.delivery_id}
                        className={!isPending ? 'cursor-pointer' : undefined}
                        onClick={() => {
                          if (isPending) return
                          setHistoryTarget({
                            deliveryId: d.delivery_id,
                            deliveryRef: d.delivery_ref,
                          })
                        }}
                      >
                        <td>{d.po_reference ?? '—'}</td>
                        <td>{d.supplier ?? '—'}</td>
                        <td>{fmt(d.expected_arrival_date)}</td>
                        <td>{fmt(d.inspection_date)}</td>
                        <td>
                          <span
                            className={styles.status}
                            data-tone={
                              isPending ? 'warn' : resultTone(d.inspection_status)
                            }
                          >
                            {resultLabel(d)}
                          </span>
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            {readOnly ? (
                              <ViewInspectionDialog
                                deliveryId={d.delivery_id}
                                deliveryRef={d.delivery_ref}
                                triggerClassName={ROW_ACTION_CLASS}
                              />
                            ) : null}
                            {!readOnly && isEditable ? (
                              <Link
                                href={inspectionHref(d.delivery_id, '', portal)}
                                className={ROW_ACTION_CLASS}
                                aria-label={`Edit inspection for ${d.delivery_ref} (currently ${resultLabel(d)})`}
                              >
                                Edit
                              </Link>
                            ) : null}
                            {!readOnly && isPending ? (
                              <InspectConfirmButton
                                deliveryId={d.delivery_id}
                                deliveryRef={d.delivery_ref}
                                supplier={d.supplier}
                                poReference={d.po_reference}
                                triggerClassName={ROW_PRIMARY_CLASS}
                              />
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {inspCold ? (
            <div className={styles.pager} aria-hidden="true">
              <span className={styles.pagerInfo}>
                <span className="block h-3 w-36 animate-pulse rounded bg-navy-100" />
              </span>
              <div className={styles.pagerControls}>
                <span className={styles.pageBtn}>‹</span>
                <span className={styles.pageBtn} data-active="true">
                  1
                </span>
                <span className={styles.pageBtn}>›</span>
              </div>
            </div>
          ) : inspTotal > 0 ? (
            <div
              className={cn(styles.pager, "pt-3")}
              style={{ marginTop: "auto" }}
            >
              <span className={styles.pagerInfo}>
                Showing {inspFrom}–{inspTo} of {inspTotal}
              </span>
              <div className={styles.pagerControls}>
                <button
                  type="button"
                  className={styles.pageBtn}
                  disabled={inspSafePage === 1}
                  onClick={() => setInspPage(inspSafePage - 1)}
                  aria-label="Previous page"
                >
                  ‹
                </button>
                {inspPages.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={styles.pageBtn}
                    data-active={p === inspSafePage}
                    onClick={() => setInspPage(p)}
                    aria-label={`Page ${p}`}
                    aria-current={p === inspSafePage ? "page" : undefined}
                  >
                    {p}
                  </button>
                ))}
                <button
                  type="button"
                  className={styles.pageBtn}
                  disabled={inspSafePage === inspPageCount}
                  onClick={() => setInspPage(inspSafePage + 1)}
                  aria-label="Next page"
                >
                  ›
                </button>
              </div>
            </div>
          ) : null}
        </Card>
      ) : airCold ? (
        <AirTabSkeleton />
      ) : (
        <div>
          <div className={air.stats}>
            <div className={air.stat}>
              <p className={air.statValue}>{airStats.total}</p>
              <p className={air.statLabel}>Total records</p>
            </div>
            <div className={air.stat}>
              <p className={air.statValue}>{airStats.issued}</p>
              <p className={air.statLabel}>AIR / IAR issued</p>
            </div>
            <div className={air.stat}>
              <p className={air.statValue}>{airStats.awaiting}</p>
              <p className={air.statLabel}>Awaiting AIR</p>
            </div>
          </div>

          <Card className={styles.panel}>
            <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
              <Input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setAirPage(1)
                }}
                placeholder="Search ref, supplier, PO, IAR no., inspector…"
                className={cn(air.search, "h-8")}
                aria-label="Search AIR records"
              />
              <Select
                value={airStatus}
                onValueChange={(v) => {
                  setAirStatus(v)
                  setAirPage(1)
                }}
              >
                <SelectTrigger className="h-8 w-44">
                  <SelectValue placeholder="Filter by AIR" />
                </SelectTrigger>
                <SelectContent>
                  {AIR_STATUS_FILTERS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={airResult}
                onValueChange={(v) => {
                  setAirResult(v)
                  setAirPage(1)
                }}
              >
                <SelectTrigger className="h-8 w-40">
                  <SelectValue placeholder="Filter by result" />
                </SelectTrigger>
                <SelectContent>
                  {AIR_RESULT_FILTERS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {airVisible.length === 0 ? (
              <div className={cn(styles.emptyState, "flex-1")}>
                <div className={styles.emptyCard}>
                  <p className={styles.emptyCardText}>
                    No AIR / IAR records match your search or filters.
                  </p>
                </div>
              </div>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>PO ref</th>
                      <th>Supplier</th>
                      <th>Target arrival</th>
                      <th>Date inspected</th>
                      <th>AIR / IAR</th>
                      <th>Result</th>
                      <th>IAR No.</th>
                      <th style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {airVisible.map((d) => {
                      const isPending = d.inspection_status === 'pending'
                      const airTone = d.iar_no || d.iar_image_url
                        ? 'ok'
                        : isPending
                          ? 'info'
                          : 'warn'
                      return (
                        <tr
                          key={d.delivery_id}
                          className="cursor-pointer"
                          onClick={() => {
                            if (hasAir(d)) {
                              setViewTarget({
                                deliveryId: d.delivery_id,
                                deliveryRef: d.delivery_ref,
                              })
                              return
                            }
                            toast.info(
                              readOnly
                                ? 'No AIR / IAR has been recorded for this delivery yet.'
                                : isPending
                                  ? 'This delivery still needs an inspection. Use “Continue inspection” to record it first.'
                                  : 'No AIR / IAR yet. Use “Attach” or “Generate IAR” in the Action column.',
                              { duration: 3000, closeButton: true }
                            )
                          }}
                        >
                          <td>{d.po_reference ?? '—'}</td>
                          <td>{d.supplier ?? '—'}</td>
                          <td>{fmt(d.expected_arrival_date)}</td>
                          <td>{fmt(d.inspection_date)}</td>
                          <td>
                            <span className="flex flex-wrap items-center gap-1.5">
                              <span className={styles.status} data-tone={airTone}>
                                {d.iar_no
                                  ? 'AIR issued'
                                  : d.iar_image_url
                                    ? 'Scan attached'
                                    : isPending
                                      ? 'Pending'
                                      : 'No AIR'}
                              </span>
                              {d.stocked_at ? (
                                <span className={styles.status} data-tone="ok">
                                  Stocked
                                </span>
                              ) : null}
                            </span>
                          </td>
                          <td>
                            <span
                              className={styles.status}
                              data-tone={resultChipTone(d)}
                            >
                              {resultLabel(d)}
                            </span>
                          </td>
                          <td className={d.iar_no ? 'font-mono text-xs' : undefined}>
                            {d.iar_no ?? (d.iar_image_url ? 'Attached scan' : '—')}
                          </td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1.5">
                              {hasAir(d) ? (
                                <ViewIarDialog
                                  deliveryId={d.delivery_id}
                                  deliveryRef={d.delivery_ref}
                                  triggerClassName={ROW_PRIMARY_CLASS}
                                />
                              ) : isPending ? (
                                readOnly ? (
                                  <ViewInspectionDialog
                                    deliveryId={d.delivery_id}
                                    deliveryRef={d.delivery_ref}
                                    triggerClassName={ROW_ACTION_CLASS}
                                  />
                                ) : (
                                  <Link
                                    href={inspectionHref(d.delivery_id, '', portal)}
                                    className={ROW_PRIMARY_CLASS}
                                  >
                                    Continue inspection
                                  </Link>
                                )
                              ) : readOnly ? (
                                <ViewInspectionDialog
                                  deliveryId={d.delivery_id}
                                  deliveryRef={d.delivery_ref}
                                  triggerClassName={ROW_ACTION_CLASS}
                                />
                              ) : (
                                <>
                                  <IarAttachButton
                                    deliveryId={d.delivery_id}
                                    label="Attach"
                                    onDone={reload}
                                    triggerClassName={ROW_ACTION_CLASS}
                                  />
                                  <IarDialog
                                    deliveryId={d.delivery_id}
                                    deliveryRef={d.delivery_ref}
                                    hasSavedInspection
                                    triggerClassName={ROW_ACTION_CLASS}
                                  />
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {airTotal > 0 ? (
              <div style={{ marginTop: '1rem' }}>
                <TablePager
                  id="air"
                  total={airTotal}
                  page={airSafePage}
                  onPageChange={setAirPage}
                />
              </div>
            ) : null}
          </Card>
        </div>
      )}

      {historyTarget ? (
        <InspectionHistoryDialog
          hideTrigger
          deliveryId={historyTarget.deliveryId}
          deliveryRef={historyTarget.deliveryRef}
          open
          onOpenChange={(next) => {
            if (!next) setHistoryTarget(null)
          }}
        />
      ) : null}

      {viewTarget ? (
        <ViewIarDialog
          hideTrigger
          deliveryId={viewTarget.deliveryId}
          deliveryRef={viewTarget.deliveryRef}
          open
          onOpenChange={(next) => {
            if (!next) setViewTarget(null)
          }}
        />
      ) : null}
    </section>
  )
}
