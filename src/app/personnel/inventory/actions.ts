'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { writeAuditLog } from '@/lib/audit'
import { stockInspectionItems } from '@/lib/stock'
import prisma from '@/lib/prisma'

export interface InventoryRow {
  id: string
  item_name: string
  account_code: string | null
  quantity: number
  unit: string | null
  unit_cost: number | null
  reorder_threshold: number | null
  location: string | null
}

export interface InventoryState {
  success?: boolean
  error?: string
}

export async function getInventoryItems(): Promise<InventoryRow[]> {
  try {
    const rows = await prisma.inventoryItem.findMany({
      orderBy: { item_name: 'asc' },
      select: {
        id: true,
        item_name: true,
        account_code: true,
        quantity: true,
        unit: true,
        unit_cost: true,
        reorder_threshold: true,
        location: true,
      },
    })
    return rows.map((r) => ({
      ...r,
      unit_cost: r.unit_cost != null ? Number(r.unit_cost) : null,
    }))
  } catch (e) {
    console.error('[getInventoryItems]', e)
    return []
  }
}

export interface SaveItemInput {
  id?: string
  item_name: string
  account_code: string
  quantity: number
  unit: string
  unit_cost: number | null
  reorder_threshold: number | null
  location: string
}

async function requireUser() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

/** Creates a new stock item or updates an existing one. */
export async function saveInventoryItem(
  input: SaveItemInput
): Promise<InventoryState> {
  const name = input.item_name?.trim() ?? ''
  if (!name) return { error: 'Item name is required.' }
  if (!Number.isInteger(input.quantity) || input.quantity < 0) {
    return { error: 'Quantity must be a whole number of zero or more.' }
  }
  if (
    input.reorder_threshold != null &&
    (!Number.isInteger(input.reorder_threshold) || input.reorder_threshold < 0)
  ) {
    return { error: 'Reorder threshold must be a whole number of zero or more.' }
  }
  if (
    input.unit_cost != null &&
    (!Number.isFinite(input.unit_cost) || input.unit_cost < 0)
  ) {
    return { error: 'Unit cost must be zero or more.' }
  }

  const user = await requireUser()
  if (!user) return { error: 'You must be signed in to manage stocks.' }

  const data = {
    item_name: name,
    account_code: input.account_code?.trim() || null,
    quantity: input.quantity,
    unit: input.unit?.trim() || null,
    unit_cost: input.unit_cost,
    reorder_threshold: input.reorder_threshold,
    location: input.location?.trim() || null,
  }

  try {
    if (input.id) {
      const exists = await prisma.inventoryItem.findUnique({
        where: { id: input.id },
        select: { id: true },
      })
      if (!exists) return { error: 'Stock item not found.' }
      await prisma.inventoryItem.update({ where: { id: input.id }, data })
    } else {
      await prisma.inventoryItem.create({ data })
    }
    await writeAuditLog({
      userId: user.id,
      action: input.id ? 'inventory:update' : 'inventory:create',
      module: 'inventory',
      details: {
        purpose: `${input.id ? 'Update' : 'Add'} stock item ${name}`,
        summary: `${name} · Qty ${input.quantity}${input.unit ? ` ${input.unit}` : ''}`,
        reference_id: input.id ?? null,
      },
    })
    revalidatePath('/personnel/inventory')
    return { success: true }
  } catch (e) {
    console.error('[saveInventoryItem]', e)
    return { error: 'Failed to save the stock item. Please try again.' }
  }
}

export async function deleteInventoryItem(id: string): Promise<InventoryState> {
  if (!id) return { error: 'Stock item ID is required.' }

  const user = await requireUser()
  if (!user) return { error: 'You must be signed in to manage stocks.' }

  try {
    await prisma.inventoryItem.delete({ where: { id } })
    await writeAuditLog({
      userId: user.id,
      action: 'inventory:delete',
      module: 'inventory',
      details: {
        purpose: 'Remove stock item',
        summary: `Deleted stock ${id.slice(0, 8).toUpperCase()}`,
        reference_id: id,
      },
    })
    revalidatePath('/personnel/inventory')
    return { success: true }
  } catch (e) {
    console.error('[deleteInventoryItem]', e)
    return { error: 'Failed to delete the stock item. Please try again.' }
  }
}

export interface SyncState extends InventoryState {
  stocked?: number
  skipped?: number
  costsFixed?: number
}

/**
 * Stocks every passed/partial inspection that has an AIR but still has
 * unstocked received quantities (e.g. completed before auto-stocking),
 * and backfills stock unit costs from delivery items for rows that were
 * stocked before costs were copied over. Idempotent — quantities are
 * never counted twice.
 */
export async function syncUnstockedInspections(): Promise<SyncState> {
  const user = await requireUser()
  if (!user) return { error: 'You must be signed in to manage stocks.' }

  try {
    const pending = await prisma.inspection.findMany({
      where: {
        result: { in: ['passed', 'partial'] },
        iar_records: { some: {} },
      },
      select: { id: true },
    })

    let stocked = 0
    let costsFixed = 0
    for (const p of pending) {
      try {
        const res = await stockInspectionItems(p.id)
        if (res.stocked) stocked += 1
        costsFixed += res.costsFixed ?? 0
      } catch (e) {
        console.error('[syncUnstockedInspections]', p.id, e)
      }
    }

    revalidatePath('/personnel/inventory')
    revalidatePath('/personnel/inspections')
    return { success: true, stocked, skipped: pending.length - stocked, costsFixed }
  } catch (e) {
    console.error('[syncUnstockedInspections]', e)
    return { error: 'Failed to sync inspections. Please try again.' }
  }
}
