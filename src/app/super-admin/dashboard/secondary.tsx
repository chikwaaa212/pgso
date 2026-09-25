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
  const totalMonthlyDeliveries = monthly.reduce((n, m) => n + m.deliveries, 0)
  const totalMonthlyInspections = monthly.reduce((n, m) => n + m.inspections, 0)
  const deliveryGap = totalMonthlyDeliveries - totalMonthlyInspections
  const busiest = [...monthly].sort((a, b) => b.deliveries - a.deliveries)[0]
  const deliveryTrendInsight =
    totalMonthlyDeliveries === 0
      ? 'No deliveries in the last 6 months — the trend will build here once receiving starts.'
      : `${totalMonthlyDeliveries} deliveries vs ${totalMonthlyInspections} inspections in the last 6 months${
          busiest && busiest.deliveries > 0 ? `, busiest in ${busiest.month} (${busiest.deliveries})` : ''
        }. ${
          deliveryGap > 0
            ? `${deliveryGap} deliver${deliveryGap === 1 ? 'y still needs' : 'ies still need'} inspection — the gap between the bars and the line is your inspection backlog.`
            : 'Inspections are keeping pace with receipts — no backlog building up.'
        }`
  return <DeliveryInspectionChart data={monthly} insight={deliveryTrendInsight} />
}

export async function DashboardAnalytics({ gridClass }: { gridClass: string }) {
  const analytics = await getAnalytics()
  if (!analytics) return null
  return <AnalyticsGrid data={analytics} gridClass={gridClass} />
}
