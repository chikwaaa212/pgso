'use server'

import { revalidatePath } from 'next/cache'
import prisma from '@/lib/prisma'
import { writeAuditLog } from '@/lib/audit'
import { requireSuperAdmin } from '@/lib/auth-guard'

export interface UnitRow {
  id: string
  name: string
  abbreviation: string | null
  status: string
  usage: number
  created_at: string | null
}

export interface CatalogRow {
  id: string
  account_code: string
  account_title: string
  asset_type: string
  description: string | null
  status: string
  usage: number
  created_at: string | null
}

function revalidate() {
  revalidatePath('/super-admin/master-data')
  revalidatePath('/super-admin/dashboard')
}

async function unitUsage(name: string): Promise<number> {
  try {
    const [a, s, d] = await Promise.all([
      prisma.asset.count({ where: { unit: { equals: name, mode: 'insensitive' } } }),
      prisma.inventoryItem.count({ where: { unit: { equals: name, mode: 'insensitive' } } }),
      prisma.deliveryItem.count({ where: { unit: { equals: name, mode: 'insensitive' } } }),
    ])
    return a + s + d
  } catch {
    return 0
  }
}

async function catalogUsage(code: string): Promise<number> {
  try {
    const [a, d] = await Promise.all([
      prisma.asset.count({ where: { account_code: code } }),
      prisma.delivery.count({ where: { account_code: code } }),
    ])
    return a + d
  } catch {
    return 0
  }
}

export async function getUnits(): Promise<UnitRow[]> {
  try {
    await requireSuperAdmin()
  } catch {
    return []
  }
  try {
    const rows = await prisma.unit.findMany({ orderBy: { name: 'asc' } })
    return await Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        name: r.name,
        abbreviation: r.abbreviation,
        status: r.status,
        usage: await unitUsage(r.name),
        created_at: r.created_at?.toISOString() ?? null,
      }))
    )
  } catch (e) {
    console.error('[getUnits]', e)
    return []
  }
}

export async function getCatalog(): Promise<CatalogRow[]> {
  try {
    await requireSuperAdmin()
  } catch {
    return []
  }
  try {
    const rows = await prisma.accountCatalog.findMany({ orderBy: { account_code: 'asc' } })
    return await Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        account_code: r.account_code,
        account_title: r.account_title,
        asset_type: r.asset_type,
        description: r.description,
        status: r.status,
        usage: await catalogUsage(r.account_code),
        created_at: r.created_at?.toISOString() ?? null,
      }))
    )
  } catch (e) {
    console.error('[getCatalog]', e)
    return []
  }
}

export async function createUnit(
  _prev: { ok: boolean; error?: string },
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  let actorId = ''
  try {
    ;({ userId: actorId } = await requireSuperAdmin())
    const name = ((formData.get('name') as string) ?? '').trim().toLowerCase()
    const abbreviation = ((formData.get('abbreviation') as string) ?? '').trim() || null
    if (!name) throw new Error('Unit name is required.')
    if (!/^[a-z0-9 .\-/]+$/.test(name)) {
      throw new Error('Use letters, numbers, spaces, dots, dashes only.')
    }
    const existing = await prisma.unit.findUnique({ where: { name } })
    if (existing) throw new Error(`Unit "${name}" already exists.`)
    const row = await prisma.unit.create({
      data: { name, abbreviation, status: 'active', created_by: actorId },
    })
    await writeAuditLog({
      userId: actorId,
      action: 'master-data:create_unit',
      module: 'master-data',
      details: { purpose: 'Create unit', summary: `Added unit "${name}"`, reference_id: row.id },
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to add unit.' }
  }
  revalidate()
  return { ok: true }
}

export async function setUnitStatus(
  id: string,
  status: 'active' | 'inactive'
): Promise<{ ok: boolean; error?: string }> {
  let actorId = ''
  try {
    ;({ userId: actorId } = await requireSuperAdmin())
    const row = await prisma.unit.findUnique({ where: { id } })
    if (!row) throw new Error('Unit not found.')
    if (status === 'inactive' && (await unitUsage(row.name)) > 0) {
      throw new Error(`"${row.name}" is in use and cannot be deactivated.`)
    }
    await prisma.unit.update({ where: { id }, data: { status } })
    await writeAuditLog({
      userId: actorId,
      action: status === 'active' ? 'master-data:reactivate_unit' : 'master-data:deactivate_unit',
      module: 'master-data',
      details: { purpose: 'Toggle unit', summary: `${status} unit "${row.name}"`, reference_id: id },
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Update failed.' }
  }
  revalidate()
  return { ok: true }
}

export async function createCatalogEntry(
  _prev: { ok: boolean; error?: string },
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  let actorId = ''
  try {
    ;({ userId: actorId } = await requireSuperAdmin())
    const account_code = ((formData.get('account_code') as string) ?? '').trim()
    const account_title = (((formData.get('account_title') as string) ?? '').trim() || 'GENERAL').toUpperCase()
    const asset_type = ((formData.get('asset_type') as string) ?? '').trim() || 'General'
    const description = ((formData.get('description') as string) ?? '').trim() || null
    if (!account_code) throw new Error('Account code is required.')
    const existing = await prisma.accountCatalog.findUnique({ where: { account_code } })
    if (existing) throw new Error(`Code "${account_code}" already exists.`)
    const row = await prisma.accountCatalog.create({
      data: { account_code, account_title, asset_type, description, status: 'active', created_by: actorId },
    })
    await writeAuditLog({
      userId: actorId,
      action: 'master-data:create_catalog',
      module: 'master-data',
      details: {
        purpose: 'Create account catalog entry',
        summary: `Added ${account_code} · ${account_title} · ${asset_type}`,
        reference_id: row.id,
      },
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to add entry.' }
  }
  revalidate()
  return { ok: true }
}

export async function updateCatalogEntry(
  id: string,
  input: { account_title: string; asset_type: string; description: string | null }
): Promise<{ ok: boolean; error?: string }> {
  let actorId = ''
  try {
    ;({ userId: actorId } = await requireSuperAdmin())
    const row = await prisma.accountCatalog.findUnique({ where: { id } })
    if (!row) throw new Error('Entry not found.')
    const account_title = (input.account_title ?? '').trim().toUpperCase()
    const asset_type = (input.asset_type ?? '').trim()
    if (!account_title || !asset_type) throw new Error('Title and asset type are required.')
    await prisma.accountCatalog.update({
      where: { id },
      data: { account_title, asset_type, description: (input.description ?? '').trim() || null },
    })
    await writeAuditLog({
      userId: actorId,
      action: 'master-data:update_catalog',
      module: 'master-data',
      details: { purpose: 'Update catalog entry', summary: `Updated ${row.account_code}`, reference_id: id },
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Update failed.' }
  }
  revalidate()
  return { ok: true }
}

export async function setCatalogStatus(
  id: string,
  status: 'active' | 'inactive'
): Promise<{ ok: boolean; error?: string }> {
  let actorId = ''
  try {
    ;({ userId: actorId } = await requireSuperAdmin())
    const row = await prisma.accountCatalog.findUnique({ where: { id } })
    if (!row) throw new Error('Entry not found.')
    if (status === 'inactive' && (await catalogUsage(row.account_code)) > 0) {
      throw new Error(`Code "${row.account_code}" is in use and cannot be deactivated.`)
    }
    await prisma.accountCatalog.update({ where: { id }, data: { status } })
    await writeAuditLog({
      userId: actorId,
      action: status === 'active' ? 'master-data:reactivate_catalog' : 'master-data:deactivate_catalog',
      module: 'master-data',
      details: { purpose: 'Toggle catalog entry', summary: `${status} ${row.account_code}`, reference_id: id },
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Update failed.' }
  }
  revalidate()
  return { ok: true }
}
