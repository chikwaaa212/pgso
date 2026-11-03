import { ReportsWorkspace } from '@/components/reporting/ReportsWorkspace'

export const metadata = {
  title: 'Reports | PGSO-PSMS',
}

/**
 * Super Admin Reports workspace — same component as personnel, but the
 * queries return system-wide rows because the caller's scope helper reports
 * `isSuperAdmin`.
 */
export default function SuperAdminReportsPage() {
  return <ReportsWorkspace portal="super-admin" />
}
