'use server'

import prisma from '@/lib/prisma'
import { requireSuperAdmin } from '@/lib/auth-guard'

export interface RecordCounts {
  assets: number
  stockSkus: number
  documents: number
  iarRecords: number
  issuances: number
  deliveries: number
  inspections: number
}

export interface RecentAssetRow {
  id: string
  article: string | null
  account_code: string | null
  category: string | null
  status: string | null
  condition: string | null
  location: string | null
}

export async function getRecordCounts(): Promise<RecordCounts> {
  const zeros: RecordCounts = {
    assets: 0,
    stockSkus: 0,
    documents: 0,
    iarRecords: 0,
    issuances: 0,
    deliveries: 0,
    inspections: 0,
  }
  try {
    await requireSuperAdmin()
  } catch {
    return zeros
  }
  try {
    const [assets, stockSkus, documents, iarRecords, deliveries, inspections, issuanceRows] =
      await Promise.all([
        prisma.asset.count().catch(() => 0),
        prisma.inventoryItem.count().catch(() => 0),
        prisma.document.count().catch(() => 0),
        prisma.iarRecord.count().catch(() => 0),
        prisma.delivery.count().catch(() => 0),
        prisma.inspection.count().catch(() => 0),
        prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM issuance_records`
          .then((r) => Number(r[0]?.count ?? 0))
          .catch(() => 0),
      ])
    return { assets, stockSkus, documents, iarRecords, issuances: issuanceRows, deliveries, inspections }
  } catch (e) {
    console.error('[getRecordCounts]', e)
    return zeros
  }
}

export async function getRecentAssets(limit = 10): Promise<RecentAssetRow[]> {
  try {
    await requireSuperAdmin()
  } catch {
    return []
  }
  try {
    const rows = await prisma.asset.findMany({
      orderBy: { created_at: 'desc' },
      take: limit,
      select: {
        id: true,
        article: true,
        account_code: true,
        category: true,
        status: true,
        condition: true,
        location: true,
      },
    })
    return rows
  } catch (e) {
    console.error('[getRecentAssets]', e)
    return []
  }
}
