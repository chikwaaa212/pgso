'use server'

import prisma from '@/lib/prisma'
import { requireSuperAdmin } from '@/lib/auth-guard'

export interface Slice {
  name: string
  value: number
}

export interface MonthlyIssuancePoint {
  month: string
  issuances: number
}

export interface Analytics {
  inspectionOutcome: Slice[]
  requestStatus: Slice[]
  repairStatus: Slice[]
  assetStatus: Slice[]
  stockHealth: Slice[]
  stockHealthyPct: number
  issuanceByType: Slice[]
  monthlyIssuances: MonthlyIssuancePoint[]
  documentsByType: Slice[]
  insights: Record<string, string>
}

type GroupModel = 'request' | 'repair' | 'asset' | 'document'

const GROUP_TABLE: Record<GroupModel, string> = {
  request: '"requests"',
  repair: '"repairs"',
  asset: '"assets"',
  document: '"documents"',
}

const GROUP_FIELD: Record<GroupModel, string> = {
  request: '"status"',
  repair: '"status"',
  asset: '"status"',
  document: '"document_type"',
}

async function groupCount(model: GroupModel): Promise<Slice[]> {
  try {
    // Table/column come from fixed internal maps above — never user input —
    // so a plain (unsafe) raw query is appropriate here; Prisma bound
    // parameters cannot stand in for identifiers.
    const rows = await prisma.$queryRawUnsafe<Array<{ name: string | null; value: bigint }>>(
      `SELECT ${GROUP_FIELD[model]} AS name, COUNT(*)::bigint AS value FROM ${GROUP_TABLE[model]} GROUP BY ${GROUP_FIELD[model]} ORDER BY value DESC`
    )
    return rows.map((r) => ({ name: r.name ?? 'Unspecified', value: Number(r.value) }))
  } catch (e) {
    console.error(`[analytics:${model}]`, e)
    return []
  }
}

function pct(part: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((part / total) * 100)
}

function topInsight(
  slices: Slice[],
  emptyMsg: string,
  build: (top: Slice, share: number, total: number) => string
): string {
  const total = slices.reduce((n, s) => n + s.value, 0)
  if (total === 0) return emptyMsg
  const top = [...slices].sort((a, b) => b.value - a.value)[0]
  return build(top, pct(top.value, total), total)
}

export async function getAnalytics(): Promise<Analytics | null> {
  try {
    await requireSuperAdmin()
  } catch {
    return null
  }

  const now = new Date()
  const monthStarts: Date[] = []
  for (let i = 5; i >= 0; i--) {
    monthStarts.push(new Date(now.getFullYear(), now.getMonth() - i, 1))
  }
  const monthLabel = (d: Date) => d.toLocaleString('en-PH', { month: 'short' })

  try {
    const [
      deliveryInspection,
      requestStatus,
      repairStatus,
      assetStatus,
      stocks,
      issuanceRows,
      monthlyCounts,
      documentsByType,
    ] = await Promise.all([
      prisma.delivery.groupBy({ by: ['inspection_status'], _count: true }).catch(() => [] as { inspection_status: string | null; _count: number }[]),
      groupCount('request'),
      groupCount('repair'),
      groupCount('asset'),
      prisma.inventoryItem
        .findMany({ select: { quantity: true, reorder_threshold: true } })
        .catch(() => [] as { quantity: number; reorder_threshold: number | null }[]),
      prisma.$queryRaw<Array<{ doc_type: string; count: bigint }>>`
        SELECT doc_type, COUNT(*)::bigint AS count FROM issuance_records GROUP BY doc_type ORDER BY count DESC`.catch(
        () => [] as Array<{ doc_type: string; count: bigint }>
      ),
      Promise.all(
        monthStarts.map(async (start) => {
          const end = new Date(start.getFullYear(), start.getMonth() + 1, 1)
          try {
            const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
              SELECT COUNT(*)::bigint AS count FROM issuance_records
              WHERE created_at >= ${start} AND created_at < ${end}`
            return { month: monthLabel(start), issuances: Number(rows[0]?.count ?? 0) }
          } catch {
            return { month: monthLabel(start), issuances: 0 }
          }
        })
      ),
      groupCount('document'),
    ])

    // Largest-first so the hero yellow slice always marks the biggest share.
    const inspectionOutcome: Slice[] = deliveryInspection
      .map((r) => ({
        name: r.inspection_status ?? 'Unspecified',
        value: r._count,
      }))
      .sort((a, b) => b.value - a.value)

    let ok = 0
    let low = 0
    let critical = 0
    let out = 0
    for (const s of stocks) {
      if (s.quantity <= 0) out += 1
      else if (s.reorder_threshold != null && s.quantity <= Math.floor(s.reorder_threshold / 2)) critical += 1
      else if (s.reorder_threshold != null && s.quantity <= s.reorder_threshold) low += 1
      else ok += 1
    }
    const stockHealth: Slice[] = [
      { name: 'Healthy', value: ok },
      { name: 'Low stock', value: low },
      { name: 'Critical', value: critical },
      { name: 'Out of stock', value: out },
    ]
    const stockTotal = ok + low + critical + out
    const stockHealthyPct = pct(ok, stockTotal)

    const issuanceByType: Slice[] = issuanceRows.map((r) => ({
      name: r.doc_type,
      value: Number(r.count),
    }))

    const insights: Record<string, string> = {
      inspection: topInsight(
        inspectionOutcome,
        'No deliveries logged yet — inspection outcomes will appear here once receiving starts.',
        (top, share, total) =>
          top.name === 'pending'
            ? `${share}% of ${total} deliver${total === 1 ? 'y is' : 'ies are'} still awaiting inspection — the inspection queue is the current bottleneck; clear it before new receipts pile up.`
            : `${share}% of ${total} deliveries resolved as “${top.name}”. ${
                inspectionOutcome.find((s) => s.name === 'pending')?.value
                  ? `${inspectionOutcome.find((s) => s.name === 'pending')!.value} still pending review — keep the queue moving.`
                  : 'Nothing pending — receiving is fully processed.'
              }`
      ),
      trend: (() => {
        const totalIssued = monthlyCounts.reduce((n, m) => n + m.issuances, 0)
        const peak = [...monthlyCounts].sort((a, b) => b.issuances - a.issuances)[0]
        if (totalIssued === 0) return 'No PAR/ICS documents issued in the last 6 months — issuance activity will trend here once items move to end users.'
        return `${totalIssued} document${totalIssued === 1 ? '' : 's'} issued in the last 6 months, peaking in ${peak?.month} (${peak?.issuances}). A rising line means healthy turnover of stocks to end users; a flat line means items are sitting in inventory.`
      })(),
      requests: topInsight(
        requestStatus,
        'No employee requests filed yet — request mix by status will appear here.',
        (top, share, total) =>
          top.name === 'pending'
            ? `${share}% of ${total} requests are still pending decision — employees are waiting; review the queue in Transactions to unblock them.`
            : `Most requests (${share}%) sit at “${top.name}” out of ${total} total. ${
                requestStatus.find((s) => s.name === 'pending')?.value
                  ? `${requestStatus.find((s) => s.name === 'pending')!.value} still need${requestStatus.find((s) => s.name === 'pending')!.value === 1 ? 's' : ''} a decision.`
                  : 'Queue is clear — every request has a decision.'
              }`
      ),
      repairs: topInsight(
        repairStatus,
        'No repair tickets logged yet — repair mix by status will appear here.',
        (top, share, total) =>
          top.name === 'completed'
            ? `${share}% of ${total} repair tickets are completed — maintenance throughput is healthy. ${
                repairStatus.find((s) => s.name === 'pending')?.value
                  ? `${repairStatus.find((s) => s.name === 'pending')!.value} still waiting for a technician.`
                  : 'No backlog.'
              }`
            : `${share}% of ${total} tickets are “${top.name}” — ${
                top.name === 'pending'
                  ? 'assign technicians from Transactions to start clearing the backlog.'
                  : 'follow up on in-progress jobs so assets return to service.'
              }`
      ),
      assets: topInsight(
        assetStatus,
        'No assets registered yet — the fleet mix by status will appear here.',
        (top, share, total) =>
          top.name === 'available'
            ? `${share}% of ${total} assets are available for assignment — healthy pool. ${
                assetStatus.find((s) => s.name === 'maintenance')?.value
                  ? `${assetStatus.find((s) => s.name === 'maintenance')!.value} in maintenance — track their repair tickets.`
                  : ''
              } ${
                assetStatus.find((s) => s.name === 'in use')?.value
                  ? `${assetStatus.find((s) => s.name === 'in use')!.value} currently in use.`
                  : ''
              }`.trim()
            : `${share}% of ${total} assets are “${top.name}”. ${
                top.name === 'in use'
                  ? 'High utilization — watch for replacement needs.'
                  : top.name === 'retired'
                    ? 'Consider disposal or replacement planning for retired units.'
                    : 'Check whether maintenance capacity is keeping up.'
              }`
      ),
      stock: (() => {
        if (stockTotal === 0) return 'No stock items tracked yet — inventory health will appear here once inspections are stocked in.'
        const attention = low + critical + out
        if (attention === 0) return `All ${stockTotal} stock lines are healthy — nothing at or below reorder threshold. Reorder points are doing their job.`
        return `Only ${stockHealthyPct}% of ${stockTotal} stock lines are healthy — ${out} out of stock, ${critical} critical, ${low} low. Restock the out-of-stock lines first; they block new assignments.`
      })(),
      issuance: topInsight(
        issuanceByType,
        'No PAR/ICS documents issued yet — the mix will appear here once items move to end users.',
        (top, share, total) =>
          `“${top.name}” dominates at ${share}% of ${total} documents — ${
            top.name === 'PAR'
              ? 'high-value items (over ₱50k) make up most assignments; verify each has a signed form on file.'
              : 'most assignments are low-value consumables; PAR items need closer tracking.'
          }`
      ),
      documents: topInsight(
        documentsByType,
        'No generated documents yet — the mix by type (RIS, PAR, ICS, AIR) will appear here.',
        (top, share, total) =>
          `“${top.name}” is the most generated document at ${share}% of ${total} total. A balanced mix across RIS, PAR, ICS and AIR means the full paper trail — request to receipt — is being followed.`
      ),
    }

    return {
      inspectionOutcome,
      requestStatus,
      repairStatus,
      assetStatus,
      stockHealth,
      stockHealthyPct,
      issuanceByType,
      monthlyIssuances: monthlyCounts,
      documentsByType,
      insights,
    }
  } catch (e) {
    console.error('[getAnalytics]', e)
    return null
  }
}
