import 'server-only'

import {
  getAgingReport,
  getAssetConditionReport,
  getQuarterlyIssuanceReport,
  type ReportPortal,
} from '@/lib/reporting-queries'
import {
  buildAgingWorkbook,
  buildConditionWorkbook,
  buildQuarterlyWorkbook,
} from '@/lib/report-excel'
import { parseReportYear } from '@/lib/reporting'

export const REPORT_XLSX_IDS = [
  'aging',
  'quarterly-issuance',
  'asset-conditions',
] as const

export type ReportXlsxId = (typeof REPORT_XLSX_IDS)[number]

export function isReportXlsxId(value: string): value is ReportXlsxId {
  return (REPORT_XLSX_IDS as readonly string[]).includes(value)
}

function stamp(): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Manila',
  }).format(new Date())
}

function fileName(portal: ReportPortal, report: ReportXlsxId, year?: number): string {
  const scope = portal === 'super-admin' ? 'SuperAdmin' : 'Personnel'
  if (report === 'quarterly-issuance') {
    return `PGSO-${scope}-Quarterly-Issuance-${year ?? new Date().getFullYear()}.xlsx`
  }
  if (report === 'asset-conditions') {
    return `PGSO-${scope}-Asset-Conditions-${stamp()}.xlsx`
  }
  return `PGSO-${scope}-Aging-Report-${stamp()}.xlsx`
}

/**
 * Builds the official XLSX response for a report id. Callers must complete
 * authentication/authorization first; the underlying queries re-apply the
 * same personnel scope as the on-screen report.
 */
export async function buildReportXlsxResponse(
  portal: ReportPortal,
  report: string,
  params: URLSearchParams
): Promise<Response> {
  if (!isReportXlsxId(report)) {
    return new Response('Report not found.', { status: 404 })
  }

  let workbook
  let name: string
  if (report === 'aging') {
    const moduleFilter = params.get('module') ?? 'all'
    const bucket = params.get('bucket') ?? 'all'
    // Export every matching row, not just the first on-screen page. Pages are
    // still fetched at PAGE_SIZE so a large queue never becomes one huge
    // query; the cap prevents a runaway workbook.
    const EXPORT_PAGE_SIZE = 100
    const MAX_EXPORT_PAGES = 50
    let page = 1
    let data = await getAgingReport({
      portal,
      module: moduleFilter,
      bucket,
      page,
      pageSize: EXPORT_PAGE_SIZE,
    })
    const rows = [...data.rows.rows]
    while (page < data.rows.totalPages && page < MAX_EXPORT_PAGES) {
      page += 1
      data = await getAgingReport({
        portal,
        module: moduleFilter,
        bucket,
        page,
        pageSize: EXPORT_PAGE_SIZE,
      })
      rows.push(...data.rows.rows)
    }
    workbook = buildAgingWorkbook(
      {
        ...data,
        rows: {
          ...data.rows,
          rows,
          data: rows,
          page: 1,
          pageSize: rows.length || EXPORT_PAGE_SIZE,
          totalPages: 1,
        },
      },
      portal
    )
    name = fileName(portal, report)
  } else if (report === 'quarterly-issuance') {
    const year = parseReportYear(params.get('year'))
    const data = await getQuarterlyIssuanceReport({ year })
    workbook = buildQuarterlyWorkbook(data, portal)
    name = fileName(portal, report, year)
  } else {
    const data = await getAssetConditionReport()
    workbook = buildConditionWorkbook(data, portal)
    name = fileName(portal, report)
  }

  const raw = await workbook.xlsx.writeBuffer()
  const body = new Uint8Array(raw as ArrayBuffer)

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'no-store',
    },
  })
}
