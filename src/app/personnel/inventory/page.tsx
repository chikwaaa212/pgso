'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
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
  deleteInventoryItem,
  getInventoryItems,
  saveInventoryItem,
  syncUnstockedInspections,
  type InventoryRow,
} from './actions'
import { TablePager } from '@/components/personnel/TablePager'
import { usePageSize } from '@/hooks/use-page-size'
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
  const [rows, setRows] = useState<InventoryRow[]>([])
  const [query, setQuery] = useState('')
  const [accountCode, setAccountCode] = useState('all')
  const [level, setLevel] = useState('all')
  const [pageSize, setPageSize] = usePageSize('pgso:page-size:inventory', 10)
  const [page, setPage] = useState(1)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [error, setError] = useState('')
  // Strict mode: code + unit come from Master Data.
  const master = useMasterData()

  const reload = () => {
    void getInventoryItems().then(setRows)
  }

  useEffect(() => {
    reload()
  }, [])

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
  }, [rows, query, accountCode, level])

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

  function openEdit(item: InventoryRow) {
    setDraft({
      id: item.id,
      item_name: item.item_name,
      account_code: item.account_code ?? '',
      quantity: String(item.quantity),
      unit: item.unit ?? '',
      unit_cost: item.unit_cost != null ? String(item.unit_cost) : '',
      location: item.location ?? '',
    })
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

  async function onDelete(item: InventoryRow) {
    if (!window.confirm(`Delete "${item.item_name}" from stocks?`)) return
    const res = await deleteInventoryItem(item.id)
    if (!res.success) {
      window.alert(res.error ?? 'Failed to delete the stock item.')
      return
    }
    reload()
  }

  async function onSync() {
    setSyncing(true)
    setSyncMsg('')
    const res = await syncUnstockedInspections()
    setSyncing(false)
    if (!res.success) {
      setSyncMsg(res.error ?? 'Sync failed. Please try again.')
      return
    }
    setSyncMsg(
      res.stocked === 0 && (res.costsFixed ?? 0) === 0
        ? 'Everything is already in stocks — nothing to sync.'
        : [
            res.stocked
              ? `Moved ${res.stocked} inspection${res.stocked !== 1 ? 's' : ''} into stocks.`
              : '',
            res.costsFixed
              ? `Restored unit costs on ${res.costsFixed} stock item${res.costsFixed !== 1 ? 's' : ''} from deliveries.`
              : '',
          ]
            .filter(Boolean)
            .join(' ')
    )
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
            {filtered.length} of {rows.length} stock item
            {rows.length !== 1 ? 's' : ''} shown
          </p>
        </div>
        <div className={styles.actions}>
          <Button
            type="button"
            variant="outline"
            onClick={() => void onSync()}
            disabled={syncing}
            className="gap-2"
          >
            {syncing ? 'Syncing…' : 'Sync from inspections'}
          </Button>
          <Button type="button" onClick={openAdd} className="gap-2">
            Add stock
          </Button>
        </div>
      </div>

      {syncMsg ? (
        <p className={air.syncMsg} role="status">
          {syncMsg}
        </p>
      ) : null}

      <div className={air.stats}>
        <div className={air.stat}>
          <p className={air.statValue}>{stats.skus}</p>
          <p className={air.statLabel}>Items tracked</p>
        </div>
        <div className={air.stat}>
          <p className={air.statValue}>{stats.units.toLocaleString()}</p>
          <p className={air.statLabel}>Total units on hand</p>
        </div>
        <div className={air.stat}>
          <p className={air.statValue}>
            {stats.low + stats.critical}
          </p>
          <p className={air.statLabel}>Low / critical items</p>
        </div>
      </div>

      {stats.out + stats.low + stats.critical > 0 ? (
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
            Recommendation: file a supply request so Super Admin can replenish
            these stocks before they run out.{' '}
            <Link href="/personnel/requests" className="font-semibold underline">
              Go to Requests
            </Link>
          </p>
        </div>
      ) : null}

      <Card className={styles.panel}>
        <div className={air.controls}>
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
                  <th>Quantity</th>
                  <th>Unit</th>
                  <th>Unit cost</th>
                  <th>Location</th>
                  <th>Stock level</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => {
                  const lv = levelOf(item)
                  return (
                    <tr key={item.id}>
                          <td>{item.item_name}</td>
                          <td>{item.account_code ?? '—'}</td>
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
                      <td className="text-left">
                        <button
                          type="button"
                          className={`${styles.inspectLink} cursor-pointer`}
                          onClick={() => openEdit(item)}
                          aria-label={`Edit ${item.item_name}`}
                        >
                          Edit
                        </button>{' '}
                        <button
                          type="button"
                          className={`${styles.inspectLink} cursor-pointer`}
                          onClick={() => void onDelete(item)}
                          aria-label={`Delete ${item.item_name}`}
                        >
                          Delete
                        </button>
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
            <div className="grid gap-1.5">
              <Label htmlFor="stock-code">Account code</Label>
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
            </div>
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
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!canSave || saving}
              onClick={() => void onSave()}
            >
              {saving ? 'Saving…' : draft.id ? 'Save changes' : 'Add stock'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
