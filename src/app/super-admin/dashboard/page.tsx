import { Suspense } from 'react'
import Link from 'next/link'
import { label } from '@/lib/labels'
import { getSuperAdminSession } from '@/lib/auth-guard'
import { Card } from '@/components/ui/card'
import { AddPersonnelForm } from './add-personnel-form'
import { getSuperAdminOverview } from './stats'
import { DashboardAnalytics, DashboardMonthly } from './secondary'
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

function ChartFallback() {
  return (
    <Card className={styles.panel} aria-busy="true" aria-label="Loading delivery trend">
      <h2 className={styles.panelTitle}>Deliveries vs inspections</h2>
      <p className={styles.panelSub}>Last 6 months — live from records</p>
      <div aria-hidden="true" className="flex h-[220px] items-end justify-around gap-2 px-2">
        {[42, 68, 55, 82, 60, 74].map((h, i) => (
          <div key={i} className="w-full max-w-10 animate-pulse rounded bg-navy-100" style={{ height: `${h}%` }} />
        ))}
      </div>
    </Card>
  )
}

function AnalyticsFallback() {
  return (
    <div className={styles.analyticsGrid} aria-busy="true" aria-label="Loading analytics">
      {Array.from({ length: 8 }).map((_, i) => (
        <Card key={i} style={{ padding: '1.25rem' }}>
          <div aria-hidden="true" className="h-44 w-full animate-pulse rounded bg-navy-100" />
        </Card>
      ))}
    </div>
  )
}

export default async function SuperAdminDashboard() {
  // Critical data only — monthly trend + analytics stream via Suspense so
  // stat cards paint without waiting for the heavier aggregates. Session
  // reuses the memoized layout guard (no extra Auth round-trip).
  const session = await getSuperAdminSession()
  const userEmail = session?.email ?? null
  const overview = await getSuperAdminOverview()
  const { ops } = overview
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
        Signed in as {userEmail} · system-wide oversight at a glance.
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
        <Suspense fallback={<ChartFallback />}>
          <DashboardMonthly />
        </Suspense>
      </div>

      <Suspense fallback={<AnalyticsFallback />}>
        <DashboardAnalytics gridClass={styles.analyticsGrid} />
      </Suspense>

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
            Create login credentials for a PGSO personnel member directly. Employee
            + Personnel accounts can also self-register (Google or Email + OTP) and
            are active immediately — manage them under{' '}
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
