import { Suspense } from 'react'
import Link from 'next/link'
import { getSuperAdminSession } from '@/lib/auth-guard'
import { Card } from '@/components/ui/card'
import { getSuperAdminOverview } from './stats'
import { getRecommendationCount } from '@/lib/prescriptive-queries'
import { DashboardAnalytics, DashboardMonthly } from './secondary'
import styles from './page.module.css'

function ChartFallback() {
  return (
    <Card
      className={`${styles.panel} p-4`}
      aria-busy="true"
      aria-label="Loading delivery trend"
    >
      <div className={styles.panelHead}>
        <div>
          <h2 className={styles.panelTitle}>Deliveries vs inspections</h2>
          <p className={styles.panelSub}>Last 6 months — live from records</p>
        </div>
      </div>
      <div
        aria-hidden="true"
        className="flex h-[240px] items-end justify-around gap-3 px-2"
      >
        {[
          [42, 30],
          [68, 52],
          [55, 44],
          [82, 62],
          [60, 48],
          [74, 58],
        ].map((pair, i) => (
          <div key={i} className="flex h-full flex-1 items-end justify-center gap-1">
            <div
              className="w-4 max-w-[32%] animate-pulse rounded bg-navy-100"
              style={{ height: `${pair[0]}%` }}
            />
            <div
              className="w-4 max-w-[32%] animate-pulse rounded bg-navy-100"
              style={{ height: `${pair[1]}%` }}
            />
          </div>
        ))}
      </div>
    </Card>
  )
}

function AnalyticsFallback() {
  return (
    <div aria-busy="true" aria-label="Loading analytics">
      <h2 className={styles.panelTitle}>Analytics</h2>
      <p className={styles.panelSub}>
        Live breakdowns across every transaction type — each with what it means
        for operations.
      </p>
      <div className={styles.analyticsRows}>
        {[3, 2, 1, 3, 2].map((size, rowIndex) => (
          <div
            key={`analytics-skeleton-row-${rowIndex}`}
            className={styles.analyticsRow}
            data-cols={size}
          >
            {Array.from({ length: size }).map((_, i) => (
              <Card
                key={`analytics-skeleton-${rowIndex}-${i}`}
                className={`${styles.panel} p-4`}
              >
                <div
                  aria-hidden="true"
                  className="h-44 w-full animate-pulse rounded bg-navy-100"
                />
              </Card>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export default async function SuperAdminDashboard() {
  // Critical data only — monthly trend + analytics stream via Suspense so
  // stat cards paint without waiting for the heavier aggregates. Session
  // reuses the memoized layout guard (no extra Auth round-trip).
  const session = await getSuperAdminSession()
  const userEmail = session?.email ?? null
  const displayName =
    session?.profile.full_name?.trim() || userEmail || 'Administrator'
  const overview = await getSuperAdminOverview()
  const recommendationCount = await getRecommendationCount('super-admin')
  const { ops } = overview
  const activeRepairs = ops.pendingRepairs + ops.inProgressRepairs
  const lowTotal = ops.lowStockCount + ops.outOfStockCount

  const stats = [
    {
      label: 'Pending approvals',
      value: overview.pendingAccounts,
      delta: 'employees + personnel waiting',
      href: '/super-admin/users',
    },
    {
      label: 'Personnel',
      value: overview.totalPersonnel,
      delta: 'active + inactive',
      href: '/super-admin/users',
    },
    {
      label: 'Employees',
      value: overview.totalEmployees,
      delta: 'registered',
      href: '/super-admin/users',
    },
    {
      label: 'Deliveries',
      value: ops.totalDeliveries,
      delta: `${ops.pendingInspections} pending inspection`,
      href: '/super-admin/transactions',
    },
    {
      label: 'Pending requests',
      value: ops.pendingRequests,
      delta: 'awaiting decision',
      href: '/super-admin/transactions',
    },
    {
      label: 'Active repairs',
      value: activeRepairs,
      delta: `${ops.pendingRepairs} pending · ${ops.inProgressRepairs} in progress`,
      href: '/super-admin/transactions',
    },
    {
      label: 'Assets tracked',
      value: ops.totalAssets,
      delta: `${ops.totalStockSkus} stock SKUs`,
      href: '/super-admin/records',
    },
    {
      label: 'Recommendations',
      value: recommendationCount,
      delta:
        recommendationCount === 0
          ? 'no action flagged'
          : 'replenishment, disposal, idle',
      href: '/super-admin/recommendations',
    },
    {
      label: 'Low / out of stock',
      value: lowTotal,
      delta:
        lowTotal === 0
          ? 'levels healthy'
          : `${ops.outOfStockCount} out · ${ops.lowStockCount} low`,
      href: '/super-admin/records',
    },
    {
      label: 'PAR / ICS issued',
      value: ops.totalIssuances,
      delta: 'accountability docs',
      href: '/super-admin/transactions',
    },
    {
      label: 'Open documents',
      value: ops.totalDocuments,
      delta: 'unviewed',
      href: '/super-admin/records',
    },
    {
      label: 'Catalog entries',
      value: overview.activeCatalog,
      delta:
        overview.inactiveCatalog > 0
          ? `${overview.inactiveCatalog} inactive`
          : 'code+title+type',
      href: '/super-admin/master-data',
    },
    {
      label: 'Units',
      value: overview.activeUnits,
      delta: 'active units',
      href: '/super-admin/master-data',
    },
  ]

  return (
    <section className={styles.section}>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Welcome, {displayName}</h1>
          <p className={styles.subtitle}>
            Property and supply operations at a glance.
          </p>
        </div>
        <div className={styles.actions}>
          <Link href="/super-admin/reports" className={styles.actionSecondary}>
            View reports
          </Link>
          <Link href="/super-admin/users" className={styles.actionPrimary}>
            Manage users
          </Link>
        </div>
      </div>

      {/* Stats — one card per system area */}
      <div className={styles.stats}>
        {stats.map((s) => (
          <Card key={s.label} className={`${styles.statCard} p-4`}>
            <span className={styles.statLabel}>{s.label}</span>
            <span className={styles.statValue}>{s.value.toLocaleString()}</span>
            <div className={styles.statFooter}>
              <span className={styles.statDelta}>{s.delta}</span>
              <Link
                href={s.href}
                className={styles.statButton}
                aria-label={`Open ${s.label}`}
              >
                Open
              </Link>
            </div>
          </Card>
        ))}
      </div>

      <Suspense fallback={<ChartFallback />}>
        <DashboardMonthly />
      </Suspense>

      <Suspense fallback={<AnalyticsFallback />}>
        <DashboardAnalytics />
      </Suspense>
    </section>
  )
}
