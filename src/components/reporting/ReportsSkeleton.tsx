import styles from './reports.module.css'

type SkeletonTab =
  | 'aging'
  | 'quarterly'
  | 'availability'
  | 'disposal'
  | 'assigned'
  | 'condition'

function Bar({
  w = '100%',
  h = 10,
  radius,
}: {
  w?: string
  h?: number
  radius?: number
}) {
  return (
    <span
      aria-hidden="true"
      className={styles.skeleton}
      style={{ width: w, height: h, borderRadius: radius }}
    />
  )
}

function KpiSkeleton() {
  return (
    <div className={styles.kpi}>
      <span
        aria-hidden="true"
        className={`${styles.kpiIcon} ${styles.skeleton}`}
      />
      <div className={styles.kpiBody}>
        <Bar w="58%" h={8} />
        <Bar w="42%" h={20} />
        <Bar w="74%" h={8} />
      </div>
    </div>
  )
}

function PanelHeadSkeleton({ chip = true }: { chip?: boolean }) {
  return (
    <div className={styles.panelHead}>
      <div className={styles.skeletonHeadText}>
        <Bar w="13rem" h={14} />
        <Bar w="21rem" h={9} />
      </div>
      {chip ? <Bar w="4.5rem" h={18} radius={999} /> : null}
    </div>
  )
}

function TableSkeleton({
  widths,
  rows = 5,
}: {
  widths: number[]
  rows?: number
}) {
  return (
    <div className={styles.skeletonTable} aria-hidden="true">
      <div className={styles.skeletonTableRow} data-head="true">
        {widths.map((w, index) => (
          <span key={index} className={styles.skeletonCell} style={{ flex: w }}>
            <Bar h={7} />
          </span>
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className={styles.skeletonTableRow}>
          {widths.map((w, index) => (
            <span
              key={index}
              className={styles.skeletonCell}
              style={{ flex: w }}
            >
              <Bar h={9} />
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}

function ToolbarSkeleton({ fields = 2 }: { fields?: number }) {
  return (
    <div className={styles.toolbar}>
      <div className={styles.toolbarFields}>
        {Array.from({ length: fields }).map((_, index) => (
          <div key={index} className={styles.field}>
            <Bar w="5.5rem" h={8} />
            <Bar w="12rem" h={32} />
          </div>
        ))}
      </div>
      <Bar w="26rem" h={9} />
    </div>
  )
}

function AgingSkeleton() {
  return (
    <>
      <ToolbarSkeleton fields={2} />
      <div className={styles.kpis}>
        {Array.from({ length: 4 }).map((_, index) => (
          <KpiSkeleton key={index} />
        ))}
      </div>

      <div className={styles.panel}>
        <PanelHeadSkeleton />
        <div className={styles.chartSplit}>
          <div className={styles.skeletonChart}>
            {[72, 56, 40].map((width, index) => (
              <div key={index} className={styles.skeletonChartRow}>
                <Bar w="7rem" h={9} />
                <Bar w={`${width}%`} h={14} />
              </div>
            ))}
          </div>
          <TableSkeleton widths={[26, 8, 12, 9, 9, 9, 9, 9]} rows={3} />
        </div>
      </div>

      <div className={styles.panel}>
        <PanelHeadSkeleton chip={false} />
        <TableSkeleton
          widths={[12, 16, 28, 14, 12, 8, 12, 10]}
          rows={6}
        />
        <div className={styles.panelFooter}>
          <Bar w="8rem" h={9} />
        </div>
      </div>
    </>
  )
}

function DonutSkeleton() {
  return (
    <div className={styles.breakdown}>
      <div className={styles.breakdownChart}>
        <span
          aria-hidden="true"
          className={`${styles.skeleton} ${styles.skeletonDonutMini}`}
        />
      </div>
      <div className={styles.skeletonLegend}>
        {[86, 68, 76, 58].map((width, index) => (
          <Bar key={index} w={`${width}%`} h={8} />
        ))}
      </div>
    </div>
  )
}

function QuarterlySkeleton() {
  return (
    <>
      <ToolbarSkeleton fields={1} />
      <div className={styles.kpis}>
        {Array.from({ length: 5 }).map((_, index) => (
          <KpiSkeleton key={index} />
        ))}
      </div>

      <div className={styles.twoCol}>
        <div className={styles.panel}>
          <PanelHeadSkeleton chip={false} />
          <div className={styles.skeletonPlot}>
            <Bar h={230} />
          </div>
        </div>
        <div className={styles.panel}>
          <PanelHeadSkeleton chip={false} />
          <div className={styles.skeletonPlot}>
            <Bar h={230} />
          </div>
        </div>
      </div>

      <div className={styles.twoCol}>
        <div className={styles.panel}>
          <PanelHeadSkeleton />
          <div className={styles.breakdownSplit}>
            <TableSkeleton widths={[40, 12, 12, 16]} rows={6} />
            <DonutSkeleton />
          </div>
        </div>
        <div className={styles.panel}>
          <PanelHeadSkeleton />
          <div className={styles.breakdownSplit}>
            <TableSkeleton widths={[40, 12, 12, 16]} rows={6} />
            <DonutSkeleton />
          </div>
        </div>
      </div>

      <div className={styles.panel}>
        <PanelHeadSkeleton />
        <TableSkeleton widths={[44, 12, 12, 16]} rows={4} />
      </div>
    </>
  )
}

function AvailabilitySkeleton() {
  return (
    <>
      <div className={styles.kpis}>
        {Array.from({ length: 4 }).map((_, index) => (
          <KpiSkeleton key={index} />
        ))}
      </div>

      <div className={styles.twoCol}>
        <div className={styles.panel}>
          <PanelHeadSkeleton chip={false} />
          <div className={styles.skeletonDonutRow}>
            <span
              aria-hidden="true"
              className={`${styles.skeletonDonut} ${styles.skeleton}`}
            />
            <div className={styles.skeletonLegend}>
              {[88, 72, 80, 64].map((width, index) => (
                <Bar key={index} w={`${width}%`} h={10} />
              ))}
            </div>
          </div>
        </div>
        <div className={styles.panel}>
          <PanelHeadSkeleton chip={false} />
          <TableSkeleton widths={[30, 18, 10, 10, 10]} rows={5} />
        </div>
      </div>
    </>
  )
}

function TableReportSkeleton({ columns }: { columns: number }) {
  return (
    <>
      <div className={styles.kpis}>
        {Array.from({ length: 4 }).map((_, index) => (
          <KpiSkeleton key={index} />
        ))}
      </div>

      <div className={styles.panel}>
        <PanelHeadSkeleton />
        <TableSkeleton
          widths={Array.from({ length: columns }).map((_, index) =>
            index === 0 ? 28 : 12
          )}
          rows={7}
        />
      </div>

      <div className={styles.panel}>
        <PanelHeadSkeleton />
        <TableSkeleton
          widths={Array.from({ length: columns }).map((_, index) =>
            index === 0 ? 28 : 12
          )}
          rows={5}
        />
      </div>
    </>
  )
}

/**
 * Layout-matched skeleton for the report tabs. Mirrors the real toolbar,
 * KPI tiles, panels, charts and tables so the first paint never jumps.
 */
export function ReportsContentSkeleton({ tab = 'aging' as SkeletonTab }: { tab?: SkeletonTab }) {
  return (
    <div className={styles.skeletonStack} role="status" aria-live="polite">
      {tab === 'aging' ? (
        <AgingSkeleton />
      ) : tab === 'quarterly' ? (
        <QuarterlySkeleton />
      ) : tab === 'disposal' ? (
        <TableReportSkeleton columns={8} />
      ) : tab === 'assigned' ? (
        <TableReportSkeleton columns={5} />
      ) : (
        <AvailabilitySkeleton />
      )}
      <span className={styles.srOnly}>Loading report…</span>
    </div>
  )
}

/** Full-page skeleton used by the route-level `loading.tsx` files. */
export function ReportsPageSkeleton() {
  return (
    <section className={styles.page} role="status" aria-label="Loading reports">
      <header className={styles.header}>
        <div className={styles.headerText}>
          <Bar w="6.5rem" h={9} />
          <div className={styles.skeletonTitle}>
            <Bar w="12rem" h={30} />
          </div>
          <div className={styles.skeletonSubtitle}>
            <Bar h={10} />
            <Bar w="68%" h={10} />
          </div>
        </div>
        <div className={styles.headerActions}>
          <Bar w="5.5rem" h={24} />
          <Bar w="4.5rem" h={24} />
          <Bar w="8rem" h={24} />
        </div>
      </header>

      <div className={styles.tabBar}>
        <div className={styles.tabs}>
          <Bar w="7rem" h={24} />
          <Bar w="8.5rem" h={24} />
          <Bar w="7.5rem" h={24} />
          <Bar w="7.5rem" h={24} />
          <Bar w="7.5rem" h={24} />
        </div>
      </div>

      <ReportsContentSkeleton tab="aging" />
    </section>
  )
}
