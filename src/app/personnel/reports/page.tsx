import { ReportsWorkspace } from '@/components/reporting/ReportsWorkspace'

export const metadata = {
  title: 'Reports | PGSO-PSMS',
}

/**
 * Personnel Reports workspace.
 *
 * Middleware enforces the personnel portal; the server actions and XLSX
 * routes re-check the caller's role and personnel scope on every request.
 */
export default function PersonnelReportsPage() {
  return <ReportsWorkspace portal="personnel" />
}
