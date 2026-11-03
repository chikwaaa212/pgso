import { SUPER_ADMIN_API_ROLES } from '@/lib/api-guard'
import { buildReportXlsxResponse } from '@/lib/report-xlsx'
import { denyReportAccess } from '../../../reports/access'

export const runtime = 'nodejs'

/**
 * GET /api/super-admin/reports/:report
 *
 * System-wide XLSX reports. Only active super admins may download them.
 * Supported ids: `aging`, `quarterly-issuance`, `asset-conditions`.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ report: string }> }
) {
  const denied = await denyReportAccess(SUPER_ADMIN_API_ROLES)
  if (denied) return denied
  const { report } = await params
  return buildReportXlsxResponse('super-admin', report, new URL(req.url).searchParams)
}
