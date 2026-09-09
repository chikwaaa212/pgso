'use client'

import { useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
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
import styles from '../dashboard/page.module.css'
import air from '../inspections/air-section.module.css'

type Level = 'ok' | 'low' | 'critical'

function levelOf(item: InventoryRow): Level | null {
  if (item.reorder_threshold == null) return null
  if (item.quantity <= Math.floor(item.reorder_threshold / 2)) return 'critical'
  if (item.quantity <= item.reorder_threshold) return 'low'
  return 'ok'
}

function levelTone(level: Level | null) {
  if (level === 'critical') return 'bad'
  if (level === 'low') return 'warn'
  return 'ok'
}

function levelLabel(level: Level | null) {
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
  { value: 'none', label: 'No threshold' },
] as const

interface Draft {
  id?: string
  item_name: string
  account_code: string
  quantity: string
  unit: string
  reorder_threshold: string
  location: string
}

const EMPTY_DRAFT: Draft = {
  item_name: '',
  account_code: '',
  quantity: '0',
  unit: '',
  reorder_threshold: '',
  location: '',
}

export default function PersonnelInventoryPage() {
  const [rows, setRows] = useState<InventoryRow[]>([])
  const [query, setQuery] = useState('')
  const [accountCode, setAccountCode] = useState('all')
  const [level, setLevel] = useState('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [error, setError] = useState('')

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
    let units = 0
    for (const r of rows) {
      units += r.quantity
      const lv = levelOf(r)
      if (lv === 'low') low += 1
      if (lv === 'critical') critical += 1
    }
    return { skus: rows.length, units, low, critical }
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
      reorder_threshold:
        item.reorder_threshold != null ? String(item.reorder_threshold) : '',
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
      reorder_threshold:
        draft.reorder_threshold.trim() === ''
          ? null
          : Number(draft.reorder_threshold),
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
      res.stocked === 0
        ? 'Everything is already in stocks — nothing to sync.'
        : `Moved ${res.stocked} inspection${res.stocked !== 1 ? 's' : ''} into stocks.`
    )
    reload()
  }

  const canSave =
    draft.item_name.trim() !== '' &&
    draft.quantity.trim() !== '' &&
    Number.isInteger(Number(draft.quantity)) &&
    Number(draft.quantity) >= 0 &&
    (draft.reorder_threshold.trim() === '' ||
      (Number.isInteger(Number(draft.reorder_threshold)) &&
        Number(draft.reorder_threshold) >= 0))

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
            <Plus className="h-4 w-4" />
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

      <Card className={styles.panel}>
        <div className={air.controls}>
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search item, account code, location…"
            className={air.search}
            aria-label="Search stocks"
          />
<Select value={accountCode} onValueChange={setAccountCode}>
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
          <Select value={level} onValueChange={setLevel}>
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
                  <th>Location</th>
                  <th>Stock level</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const lv = levelOf(item)
                  return (
                    <tr key={item.id}>
                      <td>{item.item_name}</td>
                      <td>{item.account_code ?? '—'}</td>
                      <td>{item.quantity}</td>
                      <td>{item.unit ?? '—'}</td>
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
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="stock-unit">Unit</Label>
              <Input
                id="stock-unit"
                type="text"
                value={draft.unit}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, unit: e.target.value }))
                }
                placeholder="e.g. ream, pc, box"
              />
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
              <Label htmlFor="stock-threshold">Reorder threshold</Label>
              <Input
                id="stock-threshold"
                type="number"
                min={0}
                step={1}
                value={draft.reorder_threshold}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, reorder_threshold: e.target.value }))
                }
                placeholder="Optional"
              />
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
