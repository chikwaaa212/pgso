'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { ActionButton } from '@/components/ui/action-button'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
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
  getInventoryFilterOptions,
  getInventoryPage,
  getInventoryStats,
  saveInventoryItem,
  syncUnstockedInspections,
  type InventoryRow,
} from './actions'
import { TablePager, FIXED_PAGE_SIZE } from '@/components/personnel/TablePager'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { useCachedAction } from '@/hooks/use-cached-action'
import { CLIENT_CACHE_KEYS, bustClientCache } from '@/lib/client-cache'
import { useMasterData } from '@/hooks/use-master-data'
import styles from '../dashboard/page.module.css'
import air from '../inspections/air-section.module.css'

type Level = 'ok' | 'low' | 'critical' | 'out'

function levelOf(item: InventoryRow): Level | null {
  if (item.quantity <= 0) return 'out'
  if (item.reorder_threshold == null) return null
  if (item.quantity <= Math.floor(item.reorder_threshold / 2)) return 'critical'
  if (item.quantity <= item.reorder_threshold) return 'low'
  return 'ok'
}

function levelTone(level: Level | null) {
  if (level === 'critical' || level === 'out') return 'bad'
  if (level === 'low') return 'warn'
  return 'ok'
}

function levelLabel(level: Level | null) {
  if (level === 'out') return 'Out of stock'
  if (level === 'critical') return 'Critical'
  if (level === 'low') return 'Low stock'
  if (level === 'ok') return 'OK'
  return 'No threshold'
}

const LEVEL_FILTERS = [
  { value: 'all', label: 'Level: All' },
  { value: 'ok', label: 'OK' },
  { value: 'low', label: 'Low stock' },
  { value: 'critical', label: 'Critical' },
  { value: 'out', label: 'Out of stock' },
  { value: 'none', label: 'No threshold' },
] as const

interface Draft {
  id?: string
  item_name: string
  account_code: string
  quantity: string
  unit: string
  unit_cost: string
  location: string
}

const EMPTY_DRAFT: Draft = {
  item_name: '',
  account_code: '',
  quantity: '0',
  unit: '',
  unit_cost: '',
  location: '',
}

export default function PersonnelInventoryPage() {
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<'all' | 'stock' | 'asset'>('all')
  const [accountCode, setAccountCode] = useState('all')
  const [level, setLevel] = useState('all')
  // Fixed 20 rows/page (no selector) — the DB returns only this window.
  const pageSize = FIXED_PAGE_SIZE
  const [page, setPage] = useState(1)
  // Debounced server search — the DB query fires only after typing pauses.
  const debouncedQuery = useDebouncedValue(query, 250)
  const searching = query.trim() !== debouncedQuery.trim()
  // Server-paged stocks: search/kind/code/level/page all filter in the DB.
  const {
    data: pageData,
    loading,
    isValidating,
    refresh: refreshRows,
  } = useCachedAction(
    `${CLIENT_CACHE_KEYS.inventory}:${page}:${debouncedQuery}:${kind}:${accountCode}:${level}`,
    () =>
      getInventoryPage({
        page,
        pageSize,
        q: debouncedQuery,
        kind,
        accountCode,
        level,
      }),
    { staleTime: 60_000 }
  )
  const rows = useMemo(() => pageData?.rows ?? [], [pageData])
  const total = pageData?.total ?? 0
  // Cheap global stats + bounded filter options (no row payload).
  const { data: statsData } = useCachedAction(
    `${CLIENT_CACHE_KEYS.inventory}-stats`,
    getInventoryStats,
    { staleTime: 60_000 }
  )
  const { data: filterOptions } = useCachedAction(
    `${CLIENT_CACHE_KEYS.inventory}-filters`,
    getInventoryFilterOptions,
    { staleTime: 300_000 }
  )
  const [dialogOpen, setDialogOpen] = useState(false)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')
  // Strict mode: code + unit come from Master Data.
  const master = useMasterData()

  const reload = () => {
    // Own write (save / sync) — force fresh rows now and drop the dashboard
    // snapshot (low-stock card) so its next visit refetches too.
    bustClientCache(CLIENT_CACHE_KEYS.dashboard)
    refreshRows()
  }

  const accountCodes = useMemo(
    () => filterOptions?.accountCodes ?? [],
    [filterOptions]
  )

  // Server already filtered + paged — visible is the page window; stats
  // come from the global counts endpoint.
  const stats = {
    skus: statsData?.skus ?? 0,
    units: statsData?.units ?? 0,
    low: statsData?.low ?? 0,
    critical: statsData?.critical ?? 0,
    out: statsData?.out ?? 0,
  }
  const visible = rows

  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(Math.max(1, page), pageCount)

  function openAdd() {
    setDraft(EMPTY_DRAFT)
    setError('')
    setDialogOpen(true)
  }

  async function onSave() {
    if (saving) return
    setSaving(true)
    setError('')
    try {
      const res = await saveInventoryItem({
        id: draft.id,
        item_name: draft.item_name,
        account_code: draft.account_code,
        quantity: Number(draft.quantity),
        unit: draft.unit,
        unit_cost:
          draft.unit_cost.trim() === '' ? null : Number(draft.unit_cost),
        location: draft.location,
      })
      if (!res.success) {
        const msg = res.error ?? 'Failed to save the stock item.'
        setError(msg)
        toast.error(msg, { duration: 2000, closeButton: true })
        return
      }
      setDialogOpen(false)
      reload()
      toast.success('Stock item saved successfully.', {
        duration: 2000,
        closeButton: true,
      })
    } catch {
      const msg = 'Failed to save the stock item. Please try again.'
      setError(msg)
      toast.error(msg, { duration: 2000, closeButton: true })
    } finally {
      setSaving(false)
    }
  }

  async function onSync() {
    if (syncing) return
    setSyncing(true)
    try {
      const res = await syncUnstockedInspections()
      if (!res.success) {
        toast.error(res.error ?? 'Sync failed. Please try again.', {
          duration: 2000,
          closeButton: true,
        })
        return
      }
    if (res.stocked === 0 && (res.costsFixed ?? 0) === 0) {
      toast.info('Everything is already in stocks — nothing to sync.', {
        duration: 2000,
        closeButton: true,
      })
    } else {
      toast.success(
        [
          res.stocked
            ? `Moved ${res.stocked} inspection${res.stocked !== 1 ? 's' : ''} into stocks.`
            : '',
          res.costsFixed
            ? `Restored unit costs on ${res.costsFixed} stock item${res.costsFixed !== 1 ? 's' : ''} from deliveries.`
            : '',
        ]
          .filter(Boolean)
          .join(' '),
        { duration: 2000, closeButton: true }
      )
    }
    reload()
    } catch {
      toast.error('Sync failed. Please try again.', {
        duration: 2000,
        closeButton: true,
      })
    } finally {
      setSyncing(false)
    }
  }

  const canSave =
    draft.item_name.trim() !== '' &&
    draft.quantity.trim() !== '' &&
    Number.isInteger(Number(draft.quantity)) &&
    Number(draft.quantity) >= 0 &&
    (draft.unit_cost.trim() === '' ||
      (!Number.isNaN(Number(draft.unit_cost)) &&
        Number(draft.unit_cost) >= 0))

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Personnel / Inventory</p>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Stocks</h1>
          <p className={styles.subtitle}>
            {loading && rows.length === 0 ? (
              <span
                className="mt-1 block h-4 w-48 animate-pulse rounded bg-navy-100"
                aria-hidden="true"
              />
            ) : (
              <>
                {total} stock item{total !== 1 ? 's' : ''} found
                {(isValidating || searching || loading) ? ' · updating…' : ''}
              </>
            )}
          </p>
        </div>
        <div className={styles.actions}>
          <ActionButton
            type="button"
            variant="outline"
            onClick={() => onSync()}
            disabled={syncing}
            loadingLabel="Syncing…"
            className="h-8 gap-2 rounded-[4px] px-3.5 text-xs font-semibold"
          >
            Sync from inspections
          </ActionButton>
          <Button
            type="button"
            onClick={openAdd}
            className="h-8 gap-2 rounded-[4px] px-3.5 text-xs font-semibold"
          >
            Add stock
          </Button>
        </div>
      </div>

      <div className={air.stats}>
        {(
          [
            { label: 'Items tracked', value: statsData ? String(stats.skus) : null },
            {
              label: 'Total units on hand',
              value: statsData ? stats.units.toLocaleString() : null,
            },
            {
              label: 'Low / critical items',
              value: statsData ? String(stats.low + stats.critical) : null,
            },
          ] as const
        ).map((s) => (
          <div key={s.label} className={air.stat}>
            <p className={air.statValue}>
              {s.value ?? (
                <span
                  className="block h-7 w-12 animate-pulse rounded bg-navy-100"
                  aria-hidden="true"
                />
              )}
            </p>
            <p className={air.statLabel}>{s.label}</p>
          </div>
        ))}
      </div>

      {statsData && stats.out + stats.low + stats.critical > 0 ? (
        <div
          role="alert"
          className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <p className="font-semibold">
            Replenishment needed: {stats.out + stats.low + stats.critical}{' '}
            item{stats.out + stats.low + stats.critical !== 1 ? 's' : ''} at or
            below threshold
            {stats.out > 0
              ? ` (${stats.out} out of stock${stats.low + stats.critical > 0 ? `, ${stats.low + stats.critical} low/critical` : ''})`
              : ` (${stats.low + stats.critical} low/critical)`}
            .
          </p>
          <p className="mt-1">
            File a stock replenishment request so the admin can add stock /
            restock these items before they run out.{' '}
            <Link href="/personnel/requests" className="font-semibold underline">
              Go to Requests
            </Link>
          </p>
        </div>
      ) : null}

      <Card className={styles.panel}>
        <div
          className={styles.filterBtns}
          role="group"
          aria-label="Filter by delivery type"
          style={{ marginBottom: '0.75rem' }}
        >
          {(
            [
              { value: 'all', label: 'All' },
              { value: 'stock', label: 'Stocks' },
              { value: 'asset', label: 'Assets' },
            ] as const
          ).map((t) => (
            <button
              key={t.value}
              type="button"
              className={styles.filterBtn}
              data-active={kind === t.value}
              onClick={() => {
                setKind(t.value)
                setPage(1)
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        {loading && rows.length === 0 ? (
          <>
            <div className={air.controls} aria-hidden="true">
              <div className={`${air.search} h-9 animate-pulse rounded-md bg-navy-100`} />
              <div className="h-9 w-44 animate-pulse rounded-md bg-navy-100" />
              <div className="h-9 w-40 animate-pulse rounded-md bg-navy-100" />
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Account code</th>
                    <th>Type</th>
                    <th>Quantity</th>
                    <th>Unit</th>
                    <th>Unit cost</th>
                    <th>Location</th>
                    <th>Stock level</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: pageSize }).map((_, r) => (
                    <tr key={r} style={{ opacity: 1 - r * 0.05 }}>
                      <td>
                        <div className="h-3.5 w-28 animate-pulse rounded bg-navy-100" />
                      </td>
                      <td>
                        <div className="h-3.5 w-20 animate-pulse rounded bg-navy-100" />
                      </td>
                      <td>
                        <div className="h-[22px] w-14 animate-pulse rounded-full bg-navy-100" />
                      </td>
                      <td>
                        <div className="h-3.5 w-10 animate-pulse rounded bg-navy-100" />
                      </td>
                      <td>
                        <div className="h-3.5 w-10 animate-pulse rounded bg-navy-100" />
                      </td>
                      <td>
                        <div className="h-3.5 w-16 animate-pulse rounded bg-navy-100" />
                      </td>
                      <td>
                        <div className="h-3.5 w-24 animate-pulse rounded bg-navy-100" />
                      </td>
                      <td>
                        <div className="h-[22px] w-20 animate-pulse rounded-full bg-navy-100" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={styles.pager} aria-hidden="true">
              <span className={styles.pagerInfo}>
                <span className="block h-3 w-36 animate-pulse rounded bg-navy-100" />
              </span>
              <div className={styles.pagerControls}>
                <span className={styles.pageSizeWrap}>
                  <span>Rows</span>
                  <span className="h-8 w-[5.5rem] animate-pulse rounded-md bg-navy-100" />
                </span>
                <span className={styles.pageBtn} aria-hidden="true">
                  ‹
                </span>
                <span className={styles.pageBtn} data-active="true">
                  1
                </span>
                <span className={styles.pageBtn} aria-hidden="true">
                  ›
                </span>
              </div>
            </div>
          </>
        ) : (
          <>
        <div className={air.controls} style={{ justifyContent: 'flex-end', marginLeft: 'auto' }}>
          <Input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPage(1)
            }}
            placeholder="Search item, account code, location…"
            className={air.search}
            aria-label="Search stocks"
          />
          <Select
            value={accountCode}
            onValueChange={(v) => {
              setAccountCode(v)
              setPage(1)
            }}
          >
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Account code" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Account code: All</SelectItem>
                {accountCodes.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          <Select
            value={level}
            onValueChange={(v) => {
              setLevel(v)
              setPage(1)
            }}
          >
            <SelectTrigger className="w-40">
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

        {visible.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.panelSub}>
              {total === 0
                ? 'No inventory items recorded yet. Passed inspections with an AIR add items here automatically, or add stock manually.'
                : 'No stock items match your search or filters.'}
            </p>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Account code</th>
                    <th>Type</th>
                    <th>Quantity</th>
                    <th>Unit</th>
                    <th>Unit cost</th>
                    <th>Location</th>
                    <th>Stock level</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((item) => {
                    const lv = levelOf(item)
                    const kindLabel =
                      item.delivery_kind === 'stock'
                        ? 'Stocks'
                        : item.delivery_kind === 'asset'
                          ? 'Assets'
                          : '—'
                    return (
                      <tr key={item.id}>
                        <td>{item.item_name}</td>
                        <td>{item.account_code ?? '—'}</td>
                        <td>
                          <span
                            className={styles.status}
                            data-tone={
                              kindLabel === 'Assets'
                                ? 'warn'
                                : 'info'
                            }
                          >
                            {kindLabel}
                          </span>
                        </td>
                        <td>{item.quantity}</td>
                        <td>{item.unit ?? '—'}</td>
                        <td>
                          {item.unit_cost != null
                            ? new Intl.NumberFormat('en-PH', {
                                style: 'currency',
                                currency: 'PHP',
                                minimumFractionDigits: 2,
                              }).format(item.unit_cost)
                            : '—'}
                        </td>
                        <td>{item.location ?? '—'}</td>
                        <td>
                          <span className={styles.status} data-tone={levelTone(lv)}>
                            {levelLabel(lv)}
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
          <TablePager
            id="inventory"
            total={total}
            page={safePage}
            onPageChange={setPage}
          />
        ) : null}
          </>
        )}
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {draft.id ? 'Edit stock item' : 'Add stock item'}
            </DialogTitle>
            <DialogDescription>
              {draft.id
                ? 'Update the details of this stock item.'
                : 'Record a new item into the stocks inventory.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-1 sm:grid-cols-2">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="stock-name">
                Item name <span className="text-red-600">*</span>
              </Label>
              <Input
                id="stock-name"
                type="text"
                value={draft.item_name}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, item_name: e.target.value }))
                }
                placeholder="e.g. Bond paper A4"
              />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="stock-code">
                Account code <span className="font-normal text-navy-500">(start here)</span>
              </Label>
              {master.loaded && master.catalog.length > 0 ? (
                <Select
                  value={draft.account_code || undefined}
                  onValueChange={(v) =>
                    setDraft((d) => ({ ...d, account_code: v === '__none__' ? '' : v }))
                  }
                >
                  <SelectTrigger id="stock-code">
                    <SelectValue placeholder="Select code (Master Data)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— No code —</SelectItem>
                    {master.catalog.map((c) => (
                      <SelectItem key={c.account_code} value={c.account_code}>
                        {c.account_code} — {c.account_title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <>
                  <Input
                    id="stock-code"
                    type="text"
                    value={draft.account_code}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, account_code: e.target.value }))
                    }
                    placeholder="e.g. 213 (account code from delivery)"
                    list="stock-codes"
                  />
                  <datalist id="stock-codes">
                    {accountCodes.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </>
              )}
              {(() => {
                const code = draft.account_code.trim()
                if (!code) {
                  return (
                    <p className="text-xs text-navy-500">
                      Start by picking the account code — asset type and account title
                      fill in automatically.
                    </p>
                  )
                }
                const hit = master.catalog.find((c) => c.account_code === code)
                if (hit) {
                  return (
                    <p className="text-xs font-medium text-emerald-700">
                      Known code — asset type and account title filled in automatically.
                    </p>
                  )
                }
                return (
                  <p className="text-xs text-amber-700">
                    Unknown code — ask your Super Admin to add it to Master Data.
                  </p>
                )
              })()}
            </div>
            {(() => {
              const hit = master.catalog.find(
                (c) => c.account_code === draft.account_code.trim()
              )
              return (
                <>
                  <div className="grid gap-1.5">
                    <Label htmlFor="stock-asset-type">
                      Asset type{' '}
                      {hit ? (
                        <span className="font-normal text-emerald-700">(auto-filled)</span>
                      ) : (
                        <span className="font-normal text-navy-500">(from code)</span>
                      )}
                    </Label>
                    <Input
                      id="stock-asset-type"
                      type="text"
                      value={hit?.asset_type ?? ''}
                      placeholder={hit ? 'Auto-filled from code' : 'Pick a code above'}
                      disabled
                      readOnly
                      aria-readonly="true"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="stock-account-title">
                      Account title{' '}
                      {hit ? (
                        <span className="font-normal text-emerald-700">(auto-filled)</span>
                      ) : (
                        <span className="font-normal text-navy-500">(from code)</span>
                      )}
                    </Label>
                    <Input
                      id="stock-account-title"
                      type="text"
                      value={hit?.account_title ?? ''}
                      placeholder={hit ? 'Auto-filled from code' : 'Pick a code above'}
                      disabled
                      readOnly
                      aria-readonly="true"
                    />
                  </div>
                </>
              )
            })()}
            <div className="grid gap-1.5">
              <Label htmlFor="stock-unit">Unit</Label>
              {master.loaded && master.units.length > 0 ? (
                <Select
                  value={draft.unit || undefined}
                  onValueChange={(v) =>
                    setDraft((d) => ({ ...d, unit: v === '__none__' ? '' : v }))
                  }
                >
                  <SelectTrigger id="stock-unit">
                    <SelectValue placeholder="Select unit" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— No unit —</SelectItem>
                    {master.units.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="stock-unit"
                  type="text"
                  value={draft.unit}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, unit: e.target.value }))
                  }
                  placeholder="e.g. ream, pc, box"
                />
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="stock-qty">
                Quantity <span className="text-red-600">*</span>
              </Label>
              <Input
                id="stock-qty"
                type="number"
                min={0}
                step={1}
                value={draft.quantity}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, quantity: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="stock-unit-cost">Unit cost (₱)</Label>
              <Input
                id="stock-unit-cost"
                type="number"
                min={0}
                step="0.01"
                value={draft.unit_cost}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, unit_cost: e.target.value }))
                }
                placeholder="e.g. 1250.00"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Reorder threshold</Label>
              <p className="rounded-md border border-dashed border-navy-200 px-3 py-2 text-sm text-navy-700">
                {(() => {
                  const current = draft.id
                    ? rows.find((r) => r.id === draft.id)?.reorder_threshold
                    : undefined
                  return current != null
                    ? `${current} (set by Super Admin)`
                    : 'Not set — Super Admin sets this'
                })()}
              </p>
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="stock-location">Location</Label>
              <Input
                id="stock-location"
                type="text"
                value={draft.location}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, location: e.target.value }))
                }
                placeholder="e.g. Stock room A, Shelf 2"
              />
            </div>
          </div>

          {error ? (
            <p
              role="alert"
              className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
            >
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
              className="h-8 rounded-[4px] px-3.5 text-xs font-semibold"
            >
              Cancel
            </Button>
            <ActionButton
              type="button"
              disabled={!canSave || saving}
              onClick={() => onSave()}
              loadingLabel="Saving…"
              className="h-8 rounded-[4px] px-3.5 text-xs font-semibold"
            >
              {draft.id ? 'Save changes' : 'Add stock'}
            </ActionButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Blocking loading overlay while syncing from inspections */}
      <Dialog open={syncing}>
        <DialogContent
          showCloseButton={false}
          aria-describedby={undefined}
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          className="bg-white sm:max-w-xs dark:bg-white"
        >
          <DialogHeader>
            <DialogTitle>Syncing from inspections</DialogTitle>
            <DialogDescription>
              Moving inspected items into stocks — please wait.
            </DialogDescription>
          </DialogHeader>
          <div
            className="flex items-center justify-center gap-3 py-4"
            role="status"
            aria-label="Syncing inspections"
          >
            <Loader2 className="h-6 w-6 animate-spin text-navy-800" />
            <span className="text-sm font-semibold text-navy-800">
              Syncing…
            </span>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}
