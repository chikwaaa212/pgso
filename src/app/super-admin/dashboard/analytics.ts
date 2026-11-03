'use server'

import prisma from '@/lib/prisma'
import { requireSuperAdmin } from '@/lib/auth-guard'
import {
  getAgingReport,
  getAssetConditionReport,
  getQuarterlyIssuanceReport,
} from '@/lib/reporting-queries'

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
  agingByModule: Slice[]
  quarterlyIssuance: Slice[]
  assetConditions: Slice[]
  insights: Record<string, string>
}

type GroupModel = 'request' | 'repair' | 'asset' | 'document'

const EMPTY_GROUPS: Record<GroupModel, Slice[]> = {
  request: [],
  repair: [],
  asset: [],
  document: [],
}

/**
 * All four status/type breakdowns in one round-trip (they used to be four
 * separate queries). Table/column names are fixed internal literals — never
 * user input — so a plain raw query is appropriate; identifiers cannot be
 * bound parameters.
 */
async function groupCounts(): Promise<Record<GroupModel, Slice[]>> {
  try {
    const rows = await prisma.$queryRawUnsafe<
      Array<{ kind: GroupModel; name: string | null; value: bigint }>
    >(`
      SELECT 'request' AS kind, "status" AS name, COUNT(*)::bigint AS value FROM "requests" GROUP BY "status"
      UNION ALL
      SELECT 'repair' AS kind, "status" AS name, COUNT(*)::bigint AS value FROM "repairs" GROUP BY "status"
      UNION ALL
      SELECT 'asset' AS kind, "status" AS name, COUNT(*)::bigint AS value FROM "assets" GROUP BY "status"
      UNION ALL
      SELECT 'document' AS kind, "document_type" AS name, COUNT(*)::bigint AS value FROM "documents" GROUP BY "document_type"
    `)
    const out: Record<GroupModel, Slice[]> = {
      request: [],
      repair: [],
      asset: [],
      document: [],
    }
    for (const r of rows) {
      out[r.kind]?.push({ name: r.name ?? 'Unspecified', value: Number(r.value) })
    }
    for (const k of Object.keys(out) as GroupModel[]) {
      out[k].sort((a, b) => b.value - a.value)
    }
    return out
  } catch (e) {
    console.error('[analytics:groupCounts]', e)
    return EMPTY_GROUPS
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

  // Same caching as the personnel dashboard aggregates (60s scoped —
  // per-user key so entries can't leak across accounts). Auth stays
  // outside the cache so failure fallbacks are never stored.
  const { withScopedCache } = await import('@/lib/personnel-cache')
  return withScopedCache('super-admin:analytics', 60, async () => {

  const now = new Date()
  const monthStarts: Date[] = []
  for (let i = 5; i >= 0; i--) {
    monthStarts.push(new Date(now.getFullYear(), now.getMonth() - i, 1))
  }
  const monthLabel = (d: Date) => d.toLocaleString('en-PH', { month: 'short' })
  const windowStart = monthStarts[0]

  try {
    const [
      deliveryInspection,
      grouped,
      stockCounts,
      issuanceRows,
      monthlyBuckets,
      agingReport,
      quarterlyReport,
      conditionReport,
    ] = await Promise.all([
      prisma.delivery.groupBy({ by: ['inspection_status'], _count: true }).catch(() => [] as { inspection_status: string | null; _count: number }[]),
      groupCounts(),
      // Stock health counted in SQL — downloading every inventory row was the
      // largest payload on the dashboard (and a slow remote round-trip).
      prisma.$queryRaw<Array<{ ok: bigint; low: bigint; critical: bigint; out: bigint }>>`
        SELECT
          COUNT(*) FILTER (WHERE quantity > 0 AND (reorder_threshold IS NULL OR quantity > reorder_threshold))::bigint AS ok,
          COUNT(*) FILTER (WHERE quantity > 0 AND reorder_threshold IS NOT NULL AND quantity > floor(reorder_threshold / 2) AND quantity <= reorder_threshold)::bigint AS low,
          COUNT(*) FILTER (WHERE quantity > 0 AND reorder_threshold IS NOT NULL AND quantity <= floor(reorder_threshold / 2))::bigint AS critical,
          COUNT(*) FILTER (WHERE quantity <= 0)::bigint AS out
        FROM inventory`.catch(
        () => [] as Array<{ ok: bigint; low: bigint; critical: bigint; out: bigint }>
      ),
      prisma.$queryRaw<Array<{ doc_type: string; count: bigint }>>`
        SELECT doc_type, COUNT(*)::bigint AS count FROM issuance_records GROUP BY doc_type ORDER BY count DESC`.catch(
        () => [] as Array<{ doc_type: string; count: bigint }>
      ),
      // Single grouped query (was 6 sequential per-month counts).
      prisma.$queryRaw<Array<{ month: Date; count: bigint }>>`
        SELECT date_trunc('month', created_at) AS month, COUNT(*)::bigint AS count
        FROM issuance_records WHERE created_at >= ${windowStart} GROUP BY 1`.catch(
        () => [] as Array<{ month: Date; count: bigint }>
      ),
      getAgingReport({ portal: 'super-admin' }),
      getQuarterlyIssuanceReport(),
      getAssetConditionReport(),
    ])
    const { request: requestStatus, repair: repairStatus, asset: assetStatus, document: documentsByType } = grouped

    // Map UTC month buckets onto the local month labels.
    const bucketMap = new Map(
      monthlyBuckets.map((r) => {
        const d = new Date(r.month)
        return [`${d.getUTCFullYear()}-${d.getUTCMonth()}`, Number(r.count)]
      })
    )
    const monthlyCounts = monthStarts.map((start) => ({
      month: monthLabel(start),
      issuances:
        bucketMap.get(`${start.getFullYear()}-${start.getMonth()}`) ?? 0,
    }))

    // Largest-first so the hero yellow slice always marks the biggest share.
    const inspectionOutcome: Slice[] = deliveryInspection
      .map((r) => ({
        name: r.inspection_status ?? 'Unspecified',
        value: r._count,
      }))
      .sort((a, b) => b.value - a.value)

    const sc = stockCounts[0]
    const ok = Number(sc?.ok ?? 0)
    const low = Number(sc?.low ?? 0)
    const critical = Number(sc?.critical ?? 0)
    const out = Number(sc?.out ?? 0)
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

    // Objective 4: delayed/aging, quarterly issuance, asset conditions.
    const agingByModule: Slice[] = agingReport.summaries.map((s) => ({
      name: s.label,
      value: s.delayed,
    }))
    const agingOpen = agingReport.summaries.reduce((n, s) => n + s.total, 0)
    const agingDelayed = agingReport.summaries.reduce((n, s) => n + s.delayed, 0)
    const agingOldest = agingReport.summaries.reduce(
      (n, s) => Math.max(n, s.oldestDays),
      0
    )
    const quarterlyIssuance: Slice[] = quarterlyReport.trend.map((q) => ({
      name: q.label,
      value: q.documents,
    }))
    const assetConditions: Slice[] = conditionReport.rows.map((r) => ({
      name: r.label,
      value: r.count,
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
      aging:
        agingDelayed === 0
          ? `${agingOpen} open record${agingOpen === 1 ? '' : 's'} across inspections, requests and repairs — none is older than ${agingReport.thresholdDays} days. ${agingOpen === 0 ? 'Queues are clear.' : 'Keep the turnaround inside the threshold.'}`
          : `${agingDelayed} of ${agingOpen} open records are older than ${agingReport.thresholdDays} days — the oldest has been open ${agingOldest} days. Clear the 15+ day bucket first; those records block receiving, assignments and repairs.`,
      quarterly: (() => {
        const total = quarterlyReport.trend.reduce((n, q) => n + q.documents, 0)
        const peak = [...quarterlyReport.trend].sort(
          (a, b) => b.documents - a.documents
        )[0]
        if (total === 0)
          return 'No PAR/ICS documents issued in the last 8 quarters — quarterly issuance will populate once items move to end users.'
        return `${total} document${total === 1 ? '' : 's'} issued in the last 8 quarters, peaking in ${peak?.label} (${peak?.documents}). This year ${quarterlyReport.totals.documents} documents moved ${quarterlyReport.totals.quantity} unit${quarterlyReport.totals.quantity === 1 ? '' : 's'} worth ${quarterlyReport.totals.amount.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })}.`
      })(),
      conditions: (() => {
        if (conditionReport.total === 0)
          return 'No assets registered yet — the condition breakdown will appear once the registry is populated.'
        const attention = conditionReport.unserviceable + conditionReport.unspecified
        if (attention === 0)
          return `All ${conditionReport.total} assets carry a serviceable condition — the fleet is fully accounted for.`
        return `${conditionReport.serviceablePct}% of ${conditionReport.total} assets are serviceable; ${conditionReport.unserviceable} unserviceable and ${conditionReport.unspecified} with no recognized condition. Repair or dispose the unserviceable units, then clean up the unspecified records so the registry stays auditable.`
      })(),
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
      agingByModule,
      quarterlyIssuance,
      assetConditions,
      insights,
    }
  } catch (e) {
    console.error('[getAnalytics]', e)
    return null
  }
  })
}
