'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
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
  getInventoryItems,
  saveInventoryItem,
  syncUnstockedInspections,
  type InventoryRow,
} from './actions'
import { TablePager } from '@/components/personnel/TablePager'
import { usePageSize } from '@/hooks/use-page-size'
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
  // Cached rows: back-navigation paints instantly from memory /
  // sessionStorage and only revalidates silently when stale — no skeleton
  // flash over data the user already saw.
  const {
    data: cachedRows,
    loading,
    refresh: refreshRows,
  } = useCachedAction(CLIENT_CACHE_KEYS.inventory, getInventoryItems, {
    staleTime: 60_000,
  })
  const rows = useMemo(() => cachedRows ?? [], [cachedRows])
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<'all' | 'stock' | 'asset'>('all')
  const [accountCode, setAccountCode] = useState('all')
  const [level, setLevel] = useState('all')
  const [pageSize, setPageSize] = usePageSize('pgso:page-size:inventory', 10)
  const [page, setPage] = useState(1)
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

  const accountCodes = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows) {
      if (r.account_code?.trim()) set.add(r.account_code.trim())
    }
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [rows])

  const stats = useMemo(() => {
    let low = 0
    let critical = 0
    let out = 0
    let units = 0
    for (const r of rows) {
      units += r.quantity
      const lv = levelOf(r)
      if (lv === 'low') low += 1
      if (lv === 'critical') critical += 1
      if (lv === 'out') out += 1
    }
    return { skus: rows.length, units, low, critical, out }
  }, [rows])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) => {
      if (kind !== 'all' && (r.delivery_kind ?? '') !== kind) return false
      if (accountCode !== 'all' && (r.account_code ?? '') !== accountCode)
        return false
      if (level !== 'all') {
        const lv = levelOf(r)
        if (level === 'none' ? lv !== null : lv !== level) return false
      }
      if (q) {
        const hay = [r.item_name, r.account_code, r.location, r.unit]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [rows, query, kind, accountCode, level])

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(Math.max(1, page), pageCount)
  const visible = filtered.slice(
    (safePage - 1) * pageSize,
    (safePage - 1) * pageSize + pageSize
  )

  function openAdd() {
    setDraft(EMPTY_DRAFT)
    setError('')
    setDialogOpen(true)
  }

  async function onSave() {
    setSaving(true)
    setError('')
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
    setSaving(false)
    if (!res.success) {
      setError(res.error ?? 'Failed to save the stock item.')
      return
    }
    setDialogOpen(false)
    reload()
  }

  async function onSync() {
    setSyncing(true)
    const res = await syncUnstockedInspections()
    setSyncing(false)
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
            {loading ? (
              <span
                className="mt-1 block h-4 w-48 animate-pulse rounded bg-navy-100"
                aria-hidden="true"
              />
            ) : (
              <>
                {filtered.length} of {rows.length} stock item
                {rows.length !== 1 ? 's' : ''} shown
              </>
            )}
          </p>
        </div>
        <div className={styles.actions}>
          <Button
            type="button"
            variant="outline"
            onClick={() => void onSync()}
            disabled={syncing}
            className="h-8 gap-2 rounded-[4px] px-3.5 text-xs font-semibold"
          >
            {syncing ? 'Syncing…' : 'Sync from inspections'}
          </Button>
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
            { label: 'Items tracked', value: loading ? null : String(stats.skus) },
            {
              label: 'Total units on hand',
              value: loading ? null : stats.units.toLocaleString(),
            },
            {
              label: 'Low / critical items',
              value: loading ? null : String(stats.low + stats.critical),
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

      {!loading && stats.out + stats.low + stats.critical > 0 ? (
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
        {loading ? (
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

        {filtered.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.panelSub}>
              {rows.length === 0
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
        {filtered.length > 0 ? (
          <TablePager
            id="inventory"
            total={filtered.length}
            pageSize={pageSize}
            page={safePage}
            onPageSizeChange={setPageSize}
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
            <Button
              type="button"
              disabled={!canSave || saving}
              onClick={() => void onSave()}
              className="h-8 rounded-[4px] px-3.5 text-xs font-semibold"
            >
              {saving ? 'Saving…' : draft.id ? 'Save changes' : 'Add stock'}
            </Button>
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
