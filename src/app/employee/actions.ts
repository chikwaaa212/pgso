'use server'

import { revalidatePath } from 'next/cache'
import prisma from '@/lib/prisma'
import { requireEmployee } from '@/lib/auth-guard'
import {
  createRequest,
  getRequestFormOptions,
  getRequests,
  type RequestRow,
} from '@/app/personnel/requests/actions'

export interface MyAssetRow {
  id: string
  property_number: string | null
  qr_code: string | null
  account_code: string | null
  article: string | null
  description: string | null
  status: string | null
  condition: string | null
  location: string | null
}

export interface MyDocRow {
  id: string
  doc_type: string
  doc_no: string | null
  doc_date: string | null
  quantity: number
  asset_label: string | null
  downloadHref: string
}

/** Assets currently assigned to the signed-in employee. */
export async function getMyAssets(): Promise<MyAssetRow[]> {
  let userId = ''
  try {
    ;({ userId } = await requireEmployee())
  } catch {
    return []
  }
  try {
    const rows = await prisma.asset.findMany({
      where: { assigned_to: userId },
      orderBy: { account_code: 'asc' },
      select: {
        id: true,
        property_number: true,
        qr_code: true,
        account_code: true,
        article: true,
        description: true,
        status: true,
        condition: true,
        location: true,
      },
    })
    return rows.map((r) => ({ ...r }))
  } catch (e) {
    console.error('[getMyAssets]', e)
    return []
  }
}

/** PAR / ICS documents issued to the signed-in employee, newest first. */
export async function getMyDocs(): Promise<MyDocRow[]> {
  let userId = ''
  try {
    ;({ userId } = await requireEmployee())
  } catch {
    return []
  }
  try {
    const docs = await prisma.issuanceRecord.findMany({
      where: { employee_id: userId },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        doc_type: true,
        doc_no: true,
        doc_date: true,
        quantity: true,
        asset_id: true,
      },
    })
    const assets = await prisma.asset.findMany({
      where: { id: { in: docs.map((d) => d.asset_id).filter((v): v is string => !!v) } },
      select: { id: true, qr_code: true, account_code: true, article: true, description: true },
    })
    const labels = new Map(
      assets.map((a) =>
        [a.id, [a.qr_code ?? a.account_code, a.article, a.description].filter(Boolean).join(' — ').slice(0, 80) || 'Asset'] as const
      )
    )
    return docs.map((d) => ({
      id: d.id,
      doc_type: d.doc_type,
      doc_no: d.doc_no,
      doc_date: d.doc_date?.toISOString().slice(0, 10) ?? null,
      quantity: d.quantity,
      asset_label: d.asset_id ? (labels.get(d.asset_id) ?? null) : null,
      downloadHref:
        d.doc_type === 'ICS'
          ? `/api/personnel/issuances/${d.id}/ics-xlsx`
          : `/api/personnel/issuances/${d.id}/par-xlsx`,
    }))
  } catch (e) {
    console.error('[getMyDocs]', e)
    return []
  }
}

/** Requests filed by the signed-in employee, newest first. */
export async function getMyRequests(): Promise<RequestRow[]> {
  let userId = ''
  try {
    ;({ userId } = await requireEmployee())
  } catch {
    return []
  }
  try {
    const all = await getRequests()
    return all.filter((r) => r.employee_id === userId)
  } catch (e) {
    console.error('[getMyRequests]', e)
    return []
  }
}

export interface MyAssetRequestRow extends RequestRow {
  /** 'mine' = filed by me · 'incoming' = transfer addressed to my name. */
  direction: 'mine' | 'incoming'
}

/** First line is machine-readable: "Transfer to NAME [— LOCATION]". */
function parseTransferTarget(description: string): string {
  const first = description.split('\n')[0] ?? ''
  const m = first.match(/^Transfer to (.+?)(?: — (.+))?$/)
  return (m?.[1] ?? '').trim()
}

/**
 * Requests to surface on My Assets: everything I filed (new assignments,
 * transfers, repairs, stock) plus transfers filed by others addressed to my
 * name. Newest first.
 */
export async function getMyAssetRequests(): Promise<MyAssetRequestRow[]> {
  let userId = ''
  try {
    ;({ userId } = await requireEmployee())
  } catch {
    return []
  }
  try {
    const [profile, all] = await Promise.all([
      prisma.profile.findUnique({
        where: { id: userId },
        select: { full_name: true },
      }),
      getRequests(),
    ])
    const myName = (profile?.full_name ?? '').trim().toLowerCase()
    const rows: MyAssetRequestRow[] = []
    for (const r of all) {
      if (r.employee_id === userId) {
        rows.push({ ...r, direction: 'mine' })
      } else if (r.request_type === 'transfer' && myName) {
        // Exact match only — substring matching leaked transfers to
        // uninvolved employees on name collisions (e.g. "Ann" vs "Annalise").
        const target = parseTransferTarget(r.description).toLowerCase()
        if (target && target === myName) {
          rows.push({ ...r, direction: 'incoming' })
        }
      }
    }
    return rows
  } catch (e) {
    console.error('[getMyAssetRequests]', e)
    return []
  }
}

export interface MyRequestOptions {
  assets: {
    id: string
    label: string
    disabledReason: string | null
    kind: 'asset' | 'stock'
    quantity: number | null
    /** True when this asset is currently assigned to the signed-in employee. */
    heldByMe: boolean
  }[]
  personnel: { id: string; label: string }[]
}

/** Asset + personnel picker options for the employee request form (requester is always self). */
export async function getMyRequestOptions(): Promise<MyRequestOptions> {
  let userId = ''
  try {
    ;({ userId } = await requireEmployee())
  } catch {
    return { assets: [], personnel: [] }
  }
  try {
    const [{ assets }, staff, mine] = await Promise.all([
      getRequestFormOptions(),
      prisma.profile.findMany({
        where: { status: 'active', role: 'pgso_personnel' },
        orderBy: { full_name: 'asc' },
        select: { id: true, full_name: true, position: true, office: true },
      }),
      prisma.asset.findMany({
        where: { assigned_to: userId },
        select: { id: true },
      }),
    ])
    const heldIds = new Set(mine.map((m) => m.id))
    return {
      assets: assets.map((a) => ({
        id: a.id,
        label: `${a.label} · ${a.kind === 'stock' ? 'Stock' : 'Asset'}`,
        disabledReason: a.disabledReason,
        kind: a.kind,
        quantity: a.quantity,
        heldByMe: a.kind === 'asset' && heldIds.has(a.id),
      })),
      personnel: staff.map((p) => ({
        id: p.id,
        label: [p.full_name ?? 'Unnamed', [p.position, p.office].filter(Boolean).join(' · ') || null]
          .filter(Boolean)
          .join(' — '),
      })),
    }
  } catch (e) {
    console.error('[getMyRequestOptions]', e)
    return { assets: [], personnel: [] }
  }
}

export interface CreateMyRequestInput {
  requestType: string
  recipientId: string
  assetId?: string
  quantity?: number
  transferTo?: string
  newLocation?: string
  itemNeeded?: string
  reason: string
}

/** File a request as the signed-in employee (requester cannot be spoofed). */
export async function createMyRequest(
  input: CreateMyRequestInput
): Promise<{ success?: boolean; error?: string }> {
  let userId = ''
  try {
    ;({ userId } = await requireEmployee())
  } catch {
    return { error: 'You must be signed in as an employee to file a request.' }
  }
  if (input.requestType === 'stock_replenishment') {
    return { error: 'Stock replenishment is filed by PGSO personnel.' }
  }
  if (!input.recipientId?.trim()) {
    return { error: 'Select the personnel to send this request to.' }
  }
  // Transfers move custody — the employee may only transfer an asset that is
  // currently assigned to them (in their hand). Stock lots live in PGSO
  // central stock, not in anyone's hand, so they cannot be transferred away.
  if (input.requestType === 'transfer') {
    const pickedId = input.assetId?.trim() || null
    if (!pickedId) {
      return { error: 'Select one of your assigned items to transfer.' }
    }
    try {
      const picked = await prisma.asset.findUnique({
        where: { id: pickedId },
        select: { id: true, assigned_to: true },
      })
      if (!picked || picked.assigned_to !== userId) {
        return { error: 'You can only transfer items currently assigned to you.' }
      }
    } catch (e) {
      console.error('[createMyRequest:transfer-check]', e)
      return { error: 'Could not verify the selected item. Please try again.' }
    }
  }
  const res = await createRequest({
    employeeId: userId,
    requestType: input.requestType,
    recipientId: input.recipientId,
    assetId: input.assetId,
    quantity: input.quantity,
    transferTo: input.transferTo,
    newLocation: input.newLocation,
    itemNeeded: input.itemNeeded,
    reason: input.reason,
  })
  if (res.success) revalidatePath('/employee/requests')
  return res
}

