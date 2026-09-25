'use server'

import { randomUUID } from 'crypto'
import prisma from '@/lib/prisma'
import { getPersonnelScope } from '@/lib/personnel-scope'

/**
 * User-defined asset columns ("custom fields").
 *
 * Definitions live in asset_custom_fields; per-record values live in the
 * custom_fields JSONB bag on assets + inventory (stock rows share the
 * unified table, so both tables carry the bag). All reads here are raw
 * SQL so no Prisma client regeneration is needed to use them.
 */

export type CustomFieldType = 'text' | 'number' | 'date'

export interface CustomFieldDef {
  key: string
  label: string
  type: CustomFieldType
}

export type CustomBag = Record<string, string>

const FIELD_TYPES: CustomFieldType[] = ['text', 'number', 'date']

/** Signed-in personnel or super_admin id, or null (fail closed). */
async function actorId(): Promise<string | null> {
  try {
    const scope = await getPersonnelScope()
    if (scope.isEmpty || !scope.userId) return null
    return scope.userId
  } catch {
    return null
  }
}

function slugify(label: string): string {
  let s = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  if (!s) s = 'field'
  if (/^[0-9]/.test(s)) s = `f_${s}`
  return s.slice(0, 50)
}

function asType(v: unknown): CustomFieldType {
  return v === 'number' || v === 'date' ? v : 'text'
}

/** Normalize a raw JSONB bag into string values (we only ever store strings). */
function normalizeBag(bag: unknown): CustomBag {
  if (!bag || typeof bag !== 'object' || Array.isArray(bag)) return {}
  const out: CustomBag = {}
  for (const [k, v] of Object.entries(bag as Record<string, unknown>)) {
    if (v === null || v === undefined) continue
    out[k] = typeof v === 'string' ? v : String(v)
  }
  return out
}

export async function getCustomFields(): Promise<CustomFieldDef[]> {
  const { withCache, cacheKey } = await import('@/lib/personnel-cache')
  return withCache(cacheKey('personnel:asset-custom-fields'), 300, async () => {
    try {
      const rows = await prisma.$queryRaw<
        Array<{ field_key: string; label: string; field_type: string }>
      >`SELECT field_key, label, field_type FROM asset_custom_fields ORDER BY created_at ASC`
      return rows.map((r) => ({ key: r.field_key, label: r.label, type: asType(r.field_type) }))
    } catch (e) {
      console.error('[getCustomFields]', e)
      return []
    }
  })
}

export async function createCustomField(input: {
  label: string
  field_type: CustomFieldType
}): Promise<{ success?: boolean; error?: string }> {
  const me = await actorId()
  if (!me) return { error: 'You must be signed in.' }
  const label = (input.label ?? '').trim()
  if (!label) return { error: 'Column name is required.' }
  if (label.length > 80) return { error: 'Column name must be 80 characters or fewer.' }
  if (!FIELD_TYPES.includes(input.field_type)) return { error: 'Invalid column type.' }
  try {
    const base = slugify(label)
    let key = base
    for (let i = 2; i < 50; i++) {
      const taken = await prisma.$queryRaw<Array<{ n: number }>>`
        SELECT 1 AS n FROM asset_custom_fields WHERE field_key = ${key} LIMIT 1`
      if (taken.length === 0) break
      key = `${base}_${i}`
    }
    await prisma.$executeRaw`
      INSERT INTO asset_custom_fields (id, field_key, label, field_type, created_by)
      VALUES (${randomUUID()}::uuid, ${key}, ${label}, ${input.field_type}, ${me}::uuid)`
    const { bustPersonnelScopes } = await import('@/lib/personnel-cache')
    await bustPersonnelScopes(['assets'])
    return { success: true }
  } catch (e) {
    console.error('[createCustomField]', e)
    return { error: 'Failed to add the column. Please try again.' }
  }
}

export async function deleteCustomField(
  key: string
): Promise<{ success?: boolean; error?: string }> {
  const me = await actorId()
  if (!me) return { error: 'You must be signed in.' }
  if (!/^[a-z0-9_]{1,60}$/.test(key)) return { error: 'Invalid column.' }
  try {
    await prisma.$executeRaw`DELETE FROM asset_custom_fields WHERE field_key = ${key}`
    // Prune orphaned values so dead keys don't linger in the bags.
    await prisma.$executeRaw`UPDATE assets SET custom_fields = custom_fields - ${key}`
    await prisma.$executeRaw`UPDATE inventory SET custom_fields = custom_fields - ${key}`
    const { bustPersonnelScopes } = await import('@/lib/personnel-cache')
    await bustPersonnelScopes(['assets'])
    return { success: true }
  } catch (e) {
    console.error('[deleteCustomField]', e)
    return { error: 'Failed to delete the column. Please try again.' }
  }
}

function validateValue(type: CustomFieldType, raw: string): string | null {
  const v = raw.trim()
  if (!v) return null // empty clears the value (handled by caller)
  if (type === 'number') {
    if (!Number.isFinite(Number(v))) return null
    return v
  }
  if (type === 'date') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
    const d = new Date(`${v}T00:00:00`)
    if (Number.isNaN(d.getTime())) return null
    return v
  }
  if (v.length > 500) return null
  return v
}

export async function setCustomValue(input: {
  source: 'asset' | 'stock'
  id: string
  key: string
  value: string | null
}): Promise<{ success?: boolean; error?: string }> {
  const me = await actorId()
  if (!me) return { error: 'You must be signed in.' }
  if (input.source !== 'asset' && input.source !== 'stock')
    return { error: 'Invalid record.' }
  if (!input.id) return { error: 'Invalid record.' }
  const defs = await getCustomFields()
  const def = defs.find((d) => d.key === input.key)
  if (!def) return { error: 'Unknown column.' }
  const table = input.source === 'asset' ? 'assets' : 'inventory'
  try {
    const raw = (input.value ?? '').trim()
    if (!raw) {
      if (table === 'assets') {
        await prisma.$executeRaw`UPDATE assets SET custom_fields = custom_fields - ${input.key} WHERE id = ${input.id}::uuid`
      } else {
        await prisma.$executeRaw`UPDATE inventory SET custom_fields = custom_fields - ${input.key} WHERE id = ${input.id}::uuid`
      }
    } else {
      const clean = validateValue(def.type, raw)
      if (clean === null) {
        return {
          error:
            def.type === 'number'
              ? 'Enter a valid number.'
              : def.type === 'date'
                ? 'Enter a valid date.'
                : 'Enter up to 500 characters.',
        }
      }
      if (table === 'assets') {
        await prisma.$executeRaw`UPDATE assets SET custom_fields = jsonb_set(COALESCE(custom_fields, '{}'), ARRAY[${input.key}], to_jsonb(${clean}::text)) WHERE id = ${input.id}::uuid`
      } else {
        await prisma.$executeRaw`UPDATE inventory SET custom_fields = jsonb_set(COALESCE(custom_fields, '{}'), ARRAY[${input.key}], to_jsonb(${clean}::text)) WHERE id = ${input.id}::uuid`
      }
    }
    const { bustPersonnelScopes } = await import('@/lib/personnel-cache')
    await bustPersonnelScopes(['assets'])
    return { success: true }
  } catch (e) {
    console.error('[setCustomValue]', e)
    return { error: 'Failed to save the value. Please try again.' }
  }
}

/**
 * Batch-loads custom bags for list rows (one query per table). Used to
 * merge values into AssetRow / StockRow without touching the generated
 * Prisma selects.
 */
export async function fetchCustomBags(
  assetIds: string[],
  stockIds: string[]
): Promise<Map<string, CustomBag>> {
  const out = new Map<string, CustomBag>()
  try {
    if (assetIds.length > 0) {
      const rows = await prisma.$queryRaw<Array<{ id: string; bag: unknown }>>`
        SELECT id::text AS id, custom_fields AS bag FROM assets WHERE id::text = ANY(${assetIds})`
      for (const r of rows) out.set(`asset:${r.id}`, normalizeBag(r.bag))
    }
    if (stockIds.length > 0) {
      const rows = await prisma.$queryRaw<Array<{ id: string; bag: unknown }>>`
        SELECT id::text AS id, custom_fields AS bag FROM inventory WHERE id::text = ANY(${stockIds})`
      for (const r of rows) out.set(`stock:${r.id}`, normalizeBag(r.bag))
    }
  } catch (e) {
    console.error('[fetchCustomBags]', e)
  }
  return out
}
