import { getMonthlyOverview } from '@/app/personnel/inspections/actions'
import { getAnalytics } from './analytics'
import { AnalyticsGrid } from './analytics-charts'
import { DeliveryInspectionChart } from './delivery-inspection-chart'

/**
 * Secondary dashboard sections — deliberately deferred behind Suspense so
 * the critical stat cards + recent activity paint without waiting for the
 * heavier chart/analytics aggregates.
 */
export async function DashboardMonthly() {
  const monthly = await getMonthlyOverview()
  return <DeliveryInspectionChart data={monthly} />
}

export async function DashboardAnalytics() {
  const analytics = await getAnalytics()
  if (!analytics) return null
  return <AnalyticsGrid data={analytics} />
}
