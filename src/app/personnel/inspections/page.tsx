'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getInspectionsList, type UnifiedInspectionRow } from './actions'
import { IarDialog } from '@/components/personnel/IarDialog'
import { IarAttachButton } from '@/components/personnel/IarAttach'
import { TablePager } from '@/components/personnel/TablePager'
import { usePageSize } from '@/hooks/use-page-size'
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
  if (d.inspection_status === 'pending') return 'Pending'
  return d.result
    ? d.result.charAt(0).toUpperCase() + d.result.slice(1)
    : '—'
}

function resultChipTone(d: UnifiedInspectionRow) {
  if (d.inspection_status === 'pending') return 'info'
  return resultTone(d.result)
}

function hasAir(d: UnifiedInspectionRow) {
  return !!(d.iar_no || d.iar_image_url)
}

const FILTERS = [
  { value: 'all', label: 'All inspections' },
  { value: 'pending', label: 'Pending inspection' },
  { value: 'passed', label: 'Complete — Passed' },
  { value: 'partial', label: 'Complete — Partial' },
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

export default function PersonnelInspectionsPage() {
  const [rows, setRows] = useState<UnifiedInspectionRow[]>([])
  const [tab, setTab] = useState<'inspections' | 'air'>('inspections')
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [airStatus, setAirStatus] = useState('all')
  const [airResult, setAirResult] = useState('all')
  const [inspPageSize, setInspPageSize] = usePageSize(
    'pgso:page-size:inspections',
    10
  )
  const [inspPage, setInspPage] = useState(1)
  const [airPageSize, setAirPageSize] = usePageSize('pgso:page-size:air', 10)
  const [airPage, setAirPage] = useState(1)

  const reload = useCallback(() => {
    void getInspectionsList().then(setRows)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const filtered = useMemo(() => {
    if (filter === 'all') return rows
    return rows.filter((r) => r.inspection_status === filter)
  }, [rows, filter])

  const airStats = useMemo(
    () => ({
      total: rows.length,
      issued: rows.filter((r) => hasAir(r)).length,
      awaiting: rows.filter(
        (r) => r.inspection_status !== 'pending' && !hasAir(r)
      ).length,
    }),
    [rows]
  )

  const airRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) => {
      if (airStatus === 'issued' && !hasAir(r)) return false
      if (
        airStatus === 'awaiting' &&
        !(r.inspection_status !== 'pending' && !hasAir(r))
      )
        return false
      if (airResult !== 'all' && r.inspection_status !== airResult)
        return false
      if (q) {
        const hay = [r.delivery_ref, r.supplier, r.po_reference, r.iar_no, r.inspector_name]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [rows, query, airStatus, airResult])

  const inspPageCount = Math.max(1, Math.ceil(filtered.length / inspPageSize))
  const inspSafePage = Math.min(Math.max(1, inspPage), inspPageCount)
  const inspVisible = filtered.slice(
    (inspSafePage - 1) * inspPageSize,
    (inspSafePage - 1) * inspPageSize + inspPageSize
  )

  const airPageCount = Math.max(1, Math.ceil(airRows.length / airPageSize))
  const airSafePage = Math.min(Math.max(1, airPage), airPageCount)
  const airVisible = airRows.slice(
    (airSafePage - 1) * airPageSize,
    (airSafePage - 1) * airPageSize + airPageSize
  )

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Personnel / Inspections</p>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Inspections</h1>
          <p className={styles.subtitle}>
            {tab === 'inspections'
              ? rows.length === 0
                ? 'No inspections found.'
                : `${filtered.length} of ${rows.length} inspection${rows.length !== 1 ? 's' : ''} listed`
              : `${airRows.length} of ${rows.length} record${rows.length !== 1 ? 's' : ''} shown`}
          </p>
        </div>
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
          <div className={styles.headerRow}>
            <div>
              <h2 className={styles.panelTitle}>Inspections</h2>
              <p className={styles.panelSub}>
                Deliveries awaiting cross-verification and completed inspections.
              </p>
            </div>
            <div className={styles.actions}>
              <Select
                value={filter}
                onValueChange={(v) => {
                  setFilter(v)
                  setInspPage(1)
                }}
              >
                <SelectTrigger className="w-48">
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
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className={styles.emptyState}>
              <p className={styles.panelSub}>
                No inspections match the selected filter.
              </p>
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Delivery ref</th>
                    <th>Supplier</th>
                    <th>PO ref</th>
                    <th>Date delivered</th>
                    <th>Inspector</th>
                    <th>Date inspected</th>
                    <th>Result</th>
                    <th>History</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {inspVisible.map((d) => {
                    const isPending = d.inspection_status === 'pending'
                    const isPartialOrFailed = d.result === 'partial' || d.result === 'failed'
                    const isEditable = !isPending && isPartialOrFailed
                    return (
                      <tr key={d.delivery_id}>
                        <td>{d.delivery_ref}</td>
                        <td>{d.supplier ?? '—'}</td>
                        <td>{d.po_reference ?? '—'}</td>
                        <td>{fmt(d.date_delivered)}</td>
                        <td>{d.inspector_name ?? '—'}</td>
                        <td>{fmt(d.inspection_date)}</td>
                        <td>
                          {isPending ? (
                            <span className={styles.status} data-tone="warn">
                              Pending
                            </span>
                          ) : (
                            <span
                              className={styles.status}
                              data-tone={resultTone(d.result)}
                            >
                              {d.result
                                ? d.result.charAt(0).toUpperCase() + d.result.slice(1)
                                : '—'}
                            </span>
                          )}
                        </td>
                        <td className="text-left">
                          {d.created_at ? fmt(d.created_at) : '—'}
                        </td>
                        <td className="text-left">
                          {!isPending ? (
                            <Link
                              href={`/personnel/inspections/${d.delivery_id}/receipt`}
                              className={styles.inspectLink}
                            >
                              View Details
                            </Link>
                          ) : null}
                          {!isPending ? (
                            <>
                              {' '}
                              <Link
                                href={`/personnel/inspections/${d.delivery_id}/receipts`}
                                className={styles.inspectLink}
                              >
                                History
                              </Link>
                            </>
                          ) : null}
                          {isEditable ? (
                            <>
                              {' '}
                              <Link
                                href={`/personnel/inspections/${d.delivery_id}`}
                                className={styles.inspectLink}
                              >
                                Edit
                              </Link>
                            </>
                          ) : null}
                          {isPending ? (
                            <Link
                              href={`/personnel/inspections/${d.delivery_id}`}
                              className={styles.inspectLink}
                            >
                              Inspect
                            </Link>
                          ) : null}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {filtered.length > 0 ? (
            <TablePager
              id="inspections"
              total={filtered.length}
              pageSize={inspPageSize}
              page={inspSafePage}
              onPageSizeChange={setInspPageSize}
              onPageChange={setInspPage}
            />
          ) : null}
        </Card>
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

          <div className={air.controls}>
            <Input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setAirPage(1)
              }}
              placeholder="Search ref, supplier, PO, IAR no., inspector…"
              className={air.search}
              aria-label="Search AIR records"
            />
            <Select
              value={airStatus}
              onValueChange={(v) => {
                setAirStatus(v)
                setAirPage(1)
              }}
            >
              <SelectTrigger className="w-44">
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
              <SelectTrigger className="w-40">
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

          {airRows.length === 0 ? (
            <div className={air.empty}>
              No AIR / IAR records match your search or filters.
            </div>
          ) : (
            <div className={air.grid}>
              {airVisible.map((d) => {
                const isPending = d.inspection_status === 'pending'
                return (
                  <article key={d.delivery_id} className={air.card}>
                    <div className={air.cardTop}>
                      <span className={air.ref}>{d.delivery_ref}</span>
                      <span className={air.chips}>
                        {d.iar_no ? (
                          <span className={air.chip} data-tone="ok">
                            AIR issued
                          </span>
                        ) : d.iar_image_url ? (
                          <span className={air.chip} data-tone="ok">
                            Scan attached
                          </span>
                        ) : isPending ? (
                          <span className={air.chip} data-tone="info">
                            Pending
                          </span>
                        ) : (
                          <span className={air.chip} data-tone="warn">
                            No AIR
                          </span>
                        )}
                        <span className={air.chip} data-tone={resultChipTone(d)}>
                          {resultLabel(d)}
                        </span>
                        {d.stocked_at ? (
                          <span className={air.chip} data-tone="ok">
                            Stocked
                          </span>
                        ) : null}
                      </span>
                    </div>

                    <dl className={air.meta}>
                      <div>
                        <dt>Supplier</dt>
                        <dd>{d.supplier ?? '—'}</dd>
                      </div>
                      <div>
                        <dt>PO ref</dt>
                        <dd>{d.po_reference ?? '—'}</dd>
                      </div>
                      <div>
                        <dt>Delivered</dt>
                        <dd>{fmt(d.date_delivered)}</dd>
                      </div>
                      <div>
                        <dt>Inspector</dt>
                        <dd>{d.inspector_name ?? '—'}</dd>
                      </div>
                      <div>
                        <dt>Inspected</dt>
                        <dd>{fmt(d.inspection_date)}</dd>
                      </div>
                      <div>
                        <dt>Items</dt>
                        <dd>{d.item_count}</dd>
                      </div>
                      <div className={air.metaFull}>
                        <dt>IAR No.</dt>
                        <dd className={d.iar_no ? air.mono : undefined}>
                          {d.iar_no ?? (d.iar_image_url ? 'Attached scan' : '—')}
                        </dd>
                      </div>
                    </dl>

                    <div className={air.actions}>
                      {hasAir(d) ? (
                        <Link
                          href={`/personnel/inspections/${d.delivery_id}/iar`}
                          className={air.primary}
                        >
                          View IAR
                        </Link>
                      ) : isPending ? (
                        <Link
                          href={`/personnel/inspections/${d.delivery_id}`}
                          className={air.primary}
                        >
                          Continue inspection
                        </Link>
                      ) : (
                        <>
                          <IarAttachButton
                            deliveryId={d.delivery_id}
                            label="Attach"
                            onDone={reload}
                          />
                          <IarDialog
                            deliveryId={d.delivery_id}
                            deliveryRef={d.delivery_ref}
                            hasSavedInspection
                          />
                        </>
                      )}
                      {!isPending ? (
                        <Link
                          href={`/personnel/inspections/${d.delivery_id}/receipt`}
                          className={air.secondary}
                        >
                          Details
                        </Link>
                      ) : null}
                    </div>
                  </article>
                )
              })}
            </div>
          )}
          {airRows.length > 0 ? (
            <div style={{ marginTop: '1rem' }}>
              <TablePager
                id="air"
                total={airRows.length}
                pageSize={airPageSize}
                page={airSafePage}
                onPageSizeChange={setAirPageSize}
                onPageChange={setAirPage}
              />
            </div>
          ) : null}
        </div>
      )}
    </section>
  )
}
