import styles from "./page.module.css";

/**
 * Dashboard skeleton: same hero, KPI strip and panel grid as the real page so
 * the overview swaps in without layout shift. Only live values pulse.
 */
function Bar({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`animate-pulse rounded bg-navy-100 ${className}`}
    />
  );
}

export default function EmployeeDashboardLoading() {
  return (
    <section className={styles.page} aria-busy="true" aria-label="Loading dashboard">
      <nav className={styles.crumb} aria-hidden="true">
        <span>Employee</span>
        <span>/</span>
        <span data-current="true">Dashboard</span>
      </nav>

      <div className={styles.hero} aria-hidden="true">
        <div className={styles.heroMain}>
          <div className={styles.heroMeta}>
            <span className={styles.heroBadge}>Employee workspace</span>
            <span className={styles.heroStatus}>Loading</span>
          </div>
          <div className="h-7 w-64 max-w-full animate-pulse rounded bg-white/20" />
          <div className="mt-2 h-3.5 w-80 max-w-full animate-pulse rounded bg-white/15" />
          <div className={styles.heroChips}>
            <span className="h-6 w-40 animate-pulse rounded bg-white/10" />
            <span className="h-6 w-52 animate-pulse rounded bg-white/10" />
          </div>
        </div>
        <div className={styles.heroActions}>
          <span className="h-8 w-32 animate-pulse rounded-lg bg-white/15" />
          <span className="h-8 w-28 animate-pulse rounded-lg bg-white/10" />
        </div>
      </div>

      <div className={styles.kpis} aria-hidden="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={styles.kpi} style={{ opacity: 1 - i * 0.06 }}>
            <div className={styles.kpiTop}>
              <span className="h-7 w-7 animate-pulse rounded bg-navy-100" />
              <span className="h-3.5 w-3.5 animate-pulse rounded bg-navy-100" />
            </div>
            <Bar className="h-6 w-12" />
            <Bar className="mt-2 h-3 w-24" />
            <Bar className="mt-1.5 h-2.5 w-32" />
          </div>
        ))}
      </div>

      <div className={styles.columns} aria-hidden="true">
        <div className={styles.mainCol}>
          <div className={styles.panel}>
            <div className={styles.panelHead}>
              <div className="flex flex-col gap-1.5">
                <Bar className="h-3.5 w-24" />
                <Bar className="h-2.5 w-48" />
              </div>
            </div>
            <div className={styles.list}>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className={styles.row} style={{ opacity: 1 - i * 0.08 }}>
                  <span className="h-7 w-7 animate-pulse rounded bg-navy-100" />
                  <span className="flex flex-1 flex-col gap-1.5">
                    <Bar className="h-3 w-2/5" />
                    <Bar className="h-2.5 w-1/3" />
                  </span>
                  <span className="h-4 w-16 animate-pulse rounded bg-navy-100" />
                </div>
              ))}
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHead}>
              <div className="flex flex-col gap-1.5">
                <Bar className="h-3.5 w-24" />
                <Bar className="h-2.5 w-44" />
              </div>
            </div>
            <div className={styles.list}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className={styles.row} style={{ opacity: 1 - i * 0.08 }}>
                  <span className="h-7 w-7 animate-pulse rounded bg-navy-100" />
                  <span className="flex flex-1 flex-col gap-1.5">
                    <Bar className="h-3 w-1/3" />
                    <Bar className="h-2.5 w-2/5" />
                  </span>
                  <span className="h-4 w-16 animate-pulse rounded-full bg-navy-100" />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.sideCol}>
          <div className={styles.panel}>
            <div className={styles.panelHead}>
              <div className="flex flex-col gap-1.5">
                <Bar className="h-3.5 w-28" />
                <Bar className="h-2.5 w-36" />
              </div>
            </div>
            <div className={styles.identity}>
              <span className="h-9 w-9 animate-pulse rounded-full bg-navy-100" />
              <span className="flex flex-1 flex-col gap-1.5">
                <Bar className="h-3 w-32" />
                <Bar className="h-2.5 w-24" />
              </span>
            </div>
            <div className={styles.accountList}>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className={styles.accountRow}>
                  <Bar className="h-2.5 w-20" />
                  <Bar className="h-2.5 w-24" />
                </div>
              ))}
            </div>
            <div className={styles.completion}>
              <Bar className="h-2.5 w-full" />
              <span className="mt-2 block h-1.5 w-full animate-pulse rounded-full bg-navy-100" />
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHead}>
              <div className="flex flex-col gap-1.5">
                <Bar className="h-3.5 w-28" />
                <Bar className="h-2.5 w-40" />
              </div>
            </div>
            <div className={styles.docList}>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className={styles.docRow}>
                  <span className="h-5 w-10 animate-pulse rounded bg-navy-100" />
                  <span className="flex flex-1 flex-col gap-1.5">
                    <Bar className="h-3 w-24" />
                    <Bar className="h-2.5 w-32" />
                  </span>
                  <span className="h-6 w-6 animate-pulse rounded bg-navy-100" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
