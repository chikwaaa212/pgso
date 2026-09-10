import Link from 'next/link'
import { label } from '@/lib/labels'
import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/card'
import { AddPersonnelForm } from './add-personnel-form'
import { getSuperAdminOverview } from './stats'
import { getAnalytics } from './analytics'
import { AnalyticsGrid } from './analytics-charts'
import { getMonthlyOverview } from '@/app/personnel/inspections/actions'
import { OverviewChart } from '@/app/personnel/dashboard/overview-chart'
import styles from './page.module.css'

function fmtDateTime(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Manila',
  })
}

export default async function SuperAdminDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const [overview, monthly, analytics] = await Promise.all([
    getSuperAdminOverview(),
    getMonthlyOverview(),
    getAnalytics(),
  ])
  const { ops } = overview
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
            ? `${deliveryGap} deliver${deliveryGap === 1 ? 'y still needs' : 'ies still need'} inspection — the gap between the bars is your inspection backlog.`
            : 'Inspections are keeping pace with receipts — no backlog building up.'
        }`
  const activeRepairs = ops.pendingRepairs + ops.inProgressRepairs
  const lowTotal = ops.lowStockCount + ops.outOfStockCount

  const stats = [
    { label: 'Pending approvals', value: overview.pendingAccounts, delta: 'employees waiting', href: '/super-admin/users' },
    { label: 'Personnel', value: overview.totalPersonnel, delta: 'active + inactive', href: '/super-admin/users' },
    { label: 'Employees', value: overview.totalEmployees, delta: 'registered', href: '/super-admin/users' },
    { label: 'Deliveries', value: ops.totalDeliveries, delta: `${ops.pendingInspections} pending inspection`, href: '/super-admin/transactions' },
    { label: 'Pending requests', value: ops.pendingRequests, delta: 'awaiting decision', href: '/super-admin/transactions' },
    { label: 'Active repairs', value: activeRepairs, delta: `${ops.pendingRepairs} pending · ${ops.inProgressRepairs} in progress`, href: '/super-admin/transactions' },
    { label: 'Assets tracked', value: ops.totalAssets, delta: `${ops.totalStockSkus} stock SKUs`, href: '/super-admin/records' },
    { label: 'Low / out of stock', value: lowTotal, delta: lowTotal === 0 ? 'levels healthy' : `${ops.outOfStockCount} out · ${ops.lowStockCount} low`, href: '/super-admin/records' },
    { label: 'PAR / ICS issued', value: ops.totalIssuances, delta: 'accountability docs', href: '/super-admin/transactions' },
    { label: 'Open documents', value: ops.totalDocuments, delta: 'unviewed', href: '/super-admin/records' },
    { label: 'Catalog entries', value: overview.activeCatalog, delta: overview.inactiveCatalog > 0 ? `${overview.inactiveCatalog} inactive` : 'code+title+type', href: '/super-admin/master-data' },
    { label: 'Units', value: overview.activeUnits, delta: 'active units', href: '/super-admin/master-data' },
  ]

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Super Admin / Dashboard</p>
      <h1 className={styles.title}>Welcome, Super Admin</h1>
      <p className={styles.subtitle}>
        Signed in as {user?.email} · system-wide oversight at a glance.
      </p>

      <div className={styles.stats}>
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className={styles.cardLink}>
            <Card className={styles.statCard}>
              <span className={styles.statLabel}>{s.label}</span>
              <span className={styles.statValue}>{s.value.toLocaleString()}</span>
              <span className={styles.statDelta}>{s.delta}</span>
            </Card>
          </Link>
        ))}
      </div>

      <div className={styles.chartWrap}>
        <OverviewChart data={monthly} />
        <p className={styles.chartCaption}>
          <strong>What this means: </strong>
          {deliveryTrendInsight}
        </p>
      </div>

      {analytics ? (
        <AnalyticsGrid data={analytics} gridClass={styles.analyticsGrid} />
      ) : null}

      <div className={styles.twoCol}>
        <Card className={styles.panel}>
          <h2 className={styles.panelTitle}>Recent activity</h2>
          <p className={styles.panelSub}>
            Latest audit entries across all users and modules.
          </p>
          {overview.recentAudit.length === 0 ? (
            <p className={styles.panelSub}>No activity recorded yet.</p>
          ) : (
            <ul className={styles.auditList}>
              {overview.recentAudit.map((a) => (
                <li key={a.id} className={styles.auditItem}>
                  <div>
                    <strong>{a.user_name}</strong> · {label(a.action)}{' '}
                    <span className={styles.auditMeta}>({label(a.module)})</span>
                  </div>
                  {a.summary ? <div>{a.summary}</div> : null}
                  <div className={styles.auditMeta}>{fmtDateTime(a.created_at)}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className={styles.addSection}>
          <h2 className={styles.addTitle}>Add Personnel Employee</h2>
          <p className={styles.addSubtitle}>
            Create login credentials for a PGSO personnel member. Employee accounts
            are self-registered — approve them under{' '}
            <Link href="/super-admin/users" style={{ textDecoration: 'underline' }}>
              Users
            </Link>
            .
          </p>
          <AddPersonnelForm />
        </div>
      </div>
    </section>
  )
}
