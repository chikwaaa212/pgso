'use server'

import { revalidatePath } from 'next/cache'
import ExcelJS from 'exceljs'
import prisma from '@/lib/prisma'
import { writeAuditLog } from '@/lib/audit'
import { requireSuperAdmin } from '@/lib/auth-guard'
import {
  CATALOG_EXCEL_HEADERS,
  CATALOG_LEGACY_SHEET,
  CATALOG_TEMPLATE_SHEET,
} from '@/lib/account-catalog-excel'

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
  account_name: string | null
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
        account_name: r.account_name,
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
    const account_name = ((formData.get('account_name') as string) ?? '').trim() || null
    const asset_type = ((formData.get('asset_type') as string) ?? '').trim() || 'General'
    const description = ((formData.get('description') as string) ?? '').trim() || null
    if (!account_code) throw new Error('Account code is required.')
    const existing = await prisma.accountCatalog.findUnique({ where: { account_code } })
    if (existing) throw new Error(`Code "${account_code}" already exists.`)
    const row = await prisma.accountCatalog.create({
      data: { account_code, account_title, account_name, asset_type, description, status: 'active', created_by: actorId },
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
  input: { account_title: string; account_name?: string | null; asset_type: string; description: string | null }
): Promise<{ ok: boolean; error?: string }> {
  let actorId = ''
  try {
    ;({ userId: actorId } = await requireSuperAdmin())
    const row = await prisma.accountCatalog.findUnique({ where: { id } })
    if (!row) throw new Error('Entry not found.')
    const account_title = (input.account_title ?? '').trim().toUpperCase()
    const account_name = (input.account_name ?? '').trim() || null
    const asset_type = (input.asset_type ?? '').trim()
    if (!account_title || !asset_type) throw new Error('Title and asset type are required.')
    await prisma.accountCatalog.update({
      where: { id },
      data: { account_title, account_name, asset_type, description: (input.description ?? '').trim() || null },
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

// ── Bulk import from Excel (template OR the client's existing file) ──
// Only columns whose header matches one of CATALOG_EXCEL_HEADERS
// (case-insensitive, trimmed, any order — extra columns are ignored).
// Each row is handled independently: duplicates (repeated in the file or
// already in the catalog) are skipped with a message; only new codes are
// added. Existing records are never overwritten by an import.

export interface ImportCatalogState {
  ok?: boolean
  success?: boolean
  error?: string
  created?: number
  skipped?: number
  errors?: string[]
  /** Rows omitted from `errors` when the per-row list exceeds the cap. */
  omitted?: number
  matched?: string[]
}

/** Max per-row messages returned to the client (the result modal scrolls). */
const MAX_IMPORT_MESSAGES = 200

function capMessages(messages: string[]): Pick<ImportCatalogState, 'errors' | 'omitted'> {
  return {
    errors: messages.slice(0, MAX_IMPORT_MESSAGES),
    omitted: Math.max(0, messages.length - MAX_IMPORT_MESSAGES),
  }
}

function cellToValue(value: unknown): unknown {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return value
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>
    if ('result' in v && v.result !== undefined && v.result !== null) return v.result
    if ('text' in v && typeof v.text === 'string') return v.text
    if ('richText' in v && Array.isArray(v.richText))
      return (v.richText as Array<{ text?: string }>).map((r) => r.text ?? '').join('')
    if ('hyperlink' in v && typeof v.hyperlink === 'string') return v.hyperlink
  }
  return String(value)
}

function strVal(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (v instanceof Date) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

function pickWorksheet(wb: ExcelJS.Workbook): ExcelJS.Worksheet | undefined {
  const named =
    wb.getWorksheet(CATALOG_TEMPLATE_SHEET) ?? wb.getWorksheet(CATALOG_LEGACY_SHEET)
  if (named) return named
  // Fall back to the first sheet whose header row contains ACCOUNT CODE
  // (covers re-saved client files with a renamed tab).
  for (const ws of wb.worksheets) {
    let found = false
    ws.getRow(1).eachCell({ includeEmpty: true }, (cell) => {
      const raw = cellToValue(cell.value)
      if (raw !== null && String(raw).trim().toUpperCase() === 'ACCOUNT CODE') found = true
    })
    if (found) return ws
  }
  return wb.worksheets[0]
}

export async function importCatalogFromExcel(
  _prev: ImportCatalogState,
  formData: FormData
): Promise<ImportCatalogState> {
  let actorId = ''
  try {
    ;({ userId: actorId } = await requireSuperAdmin())
  } catch {
    return { ok: false, success: false, error: 'Unauthorized.' }
  }

  const file = formData.get('file')
  if (!file || !(file instanceof File) || file.size === 0)
    return { ok: false, success: false, error: 'Choose an .xlsx file to import.' }
  if (file.size > 10 * 1024 * 1024)
    return { ok: false, success: false, error: 'File is too large (max 10 MB).' }

  let wb: ExcelJS.Workbook
  try {
    wb = new ExcelJS.Workbook()
    const buf = await file.arrayBuffer()
    await wb.xlsx.load(buf)
  } catch (e) {
    console.error('[importCatalogFromExcel] load', e)
    return {
      ok: false,
      success: false,
      error: 'Could not read that Excel file. Use the downloaded template (.xlsx).',
    }
  }

  const ws = pickWorksheet(wb)
  if (!ws) return { ok: false, success: false, error: 'No worksheet found in that file.' }

  // Map normalized (trimmed, uppercased) header -> column index.
  // Only the 4 known headers are picked up — extra columns in the client's
  // own file are ignored, and column order does not matter.
  const colByHeader = new Map<string, number>()
  const foundHeaders: string[] = []
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
    const raw = cellToValue(cell.value)
    const key = raw === null ? '' : String(raw).trim().toUpperCase()
    if (key) {
      foundHeaders.push(String(raw).trim())
      if (CATALOG_EXCEL_HEADERS.includes(key) && !colByHeader.has(key)) {
        colByHeader.set(key, col)
      }
    }
  })

  if (!colByHeader.has('ACCOUNT CODE'))
    return {
      ok: false,
      success: false,
      error: `No "ACCOUNT CODE" column found — the import reads only columns matching ${CATALOG_EXCEL_HEADERS.join(', ')}. Columns seen: ${foundHeaders.join(', ') || '(none)'}.`,
    }

  const matched = CATALOG_EXCEL_HEADERS.filter((h) => colByHeader.has(h))

  const at = (row: ExcelJS.Row, header: string): unknown => {
    const col = colByHeader.get(header)
    if (!col) return null
    return cellToValue(row.getCell(col).value)
  }

  let created = 0
  let skipped = 0
  const messages: string[] = []
  const seenInFile = new Set<string>()

  // Load existing codes once so every row can be duplicate-checked.
  let existingCodes = new Set<string>()
  try {
    const rows = await prisma.accountCatalog.findMany({ select: { account_code: true } })
    existingCodes = new Set(rows.map((r) => r.account_code))
  } catch (e) {
    console.error('[importCatalogFromExcel] preload codes', e)
    return { ok: false, success: false, error: 'Could not read the current catalog. Try again.' }
  }

  const last = ws.lastRow?.number ?? ws.rowCount
  for (let i = 2; i <= last; i++) {
    const row = ws.getRow(i)
    const account_code = strVal(at(row, 'ACCOUNT CODE'))
    if (!account_code) {
      let hasAny = false
      row.eachCell({ includeEmpty: false }, () => {
        hasAny = true
      })
      if (hasAny) skipped++
      continue
    }

    // Duplicate inside this file → message + skip (first occurrence wins).
    if (seenInFile.has(account_code)) {
      skipped++
      messages.push(`Row ${i} (${account_code}): duplicate code in this file — skipped.`)
      continue
    }
    seenInFile.add(account_code)

    // Already in the catalog → message + skip (imports never overwrite).
    if (existingCodes.has(account_code)) {
      skipped++
      messages.push(`Row ${i} (${account_code}): already exists — skipped.`)
      continue
    }

    const asset_type = strVal(at(row, 'ASSET TYPE')) || 'General'
    const account_title = (strVal(at(row, 'ACCOUNT TITLE')) || 'GENERAL').toUpperCase()
    const account_name = strVal(at(row, 'ACCOUNT NAME'))

    try {
      await prisma.accountCatalog.create({
        data: {
          account_code,
          account_title,
          account_name,
          asset_type,
          status: 'active',
          created_by: actorId,
        },
      })
      existingCodes.add(account_code)
      created++
    } catch (e) {
      console.error(`[importCatalogFromExcel] row ${i}`, e)
      skipped++
      messages.push(
        `Row ${i} (${account_code}): could not save (${e instanceof Error ? e.message.slice(0, 120) : 'unknown error'}).`
      )
    }
  }

  if (created === 0)
    return {
      ok: false,
      success: false,
      error: 'No new rows added — every ACCOUNT CODE was already in the catalog or duplicated in the file.',
      skipped,
      ...capMessages(messages),
      matched,
    }

  try {
    await writeAuditLog({
      userId: actorId,
      action: 'master-data:import_catalog',
      module: 'master-data',
      details: {
        purpose: 'Bulk import account catalog',
        summary: `Catalog import: ${created} added · ${skipped} skipped (duplicates)`,
      },
    })
  } catch {
    // Audit failure must not fail the import.
  }

  revalidate()
  return { ok: true, success: true, created, skipped, ...capMessages(messages), matched }
}
