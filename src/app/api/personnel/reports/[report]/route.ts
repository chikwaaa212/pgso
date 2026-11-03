import { PERSONNEL_API_ROLES } from '@/lib/api-guard'
import { buildReportXlsxResponse } from '@/lib/report-xlsx'
import { denyReportAccess } from '../../../reports/access'

export const runtime = 'nodejs'

/**
 * GET /api/personnel/reports/:report
 *
 * Official XLSX reports for personnel (and super admins reusing the portal).
 * Supported ids: `aging`, `quarterly-issuance`, `asset-conditions`.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ report: string }> }
) {
  const denied = await denyReportAccess(PERSONNEL_API_ROLES)
  if (denied) return denied
  const { report } = await params
  return buildReportXlsxResponse('personnel', report, new URL(req.url).searchParams)
}
