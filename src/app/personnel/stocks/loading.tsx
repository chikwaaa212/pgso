import { Card } from '@/components/ui/card'
import { STOCKS_PAGE_SIZE } from './constants'
import styles from './page.module.css'

/**
 * Stocks skeleton — mirrors the loaded ledger exactly: same header copy,
 * summary tiles, toolbar controls, 8 columns, 10 rows, and footer.
 */

const HEADERS: Array<{ label: string; numeric?: boolean }> = [
  { label: 'Item' },
  { label: 'Account code' },
  { label: 'Category' },
  { label: 'On hand', numeric: true },
  { label: 'Reorder point', numeric: true },
  { label: 'Unit cost', numeric: true },
  { label: 'Location' },
  { label: 'Status' },
]

const SUMMARY = [
  { label: 'Items in the ledger', meta: 'Distinct items with stock records' },
  { label: 'Units on hand', meta: 'Total quantity across all items' },
  { label: 'Needs replenishment', meta: 'Reorder point summary' },
] as const

function Bar({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`${styles.skeletonBlock} animate-pulse ${className}`}
    />
  )
}

function Pill({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`${styles.skeletonPill} animate-pulse ${className}`}
    />
  )
}

export default function InventoryLoading() {
  return (
    <section
      className={styles.section}
      aria-busy="true"
      aria-label="Loading stock ledger"
    >
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Stocks</h1>
          <p className={styles.subtitle}>
            Inventory is filled automatically by passed inspections.
          </p>
        </div>
      </header>

      <div className={styles.summary} aria-hidden="true">
        {SUMMARY.map((tile) => (
          <div key={tile.label} className={styles.summaryCard}>
            <span className={`${styles.skeletonIcon} animate-pulse`} />
            <div className={styles.summaryBody}>
              <p className={styles.summaryLabel}>{tile.label}</p>
              <Bar className="mt-1 h-6 w-16" />
              <p className={styles.summaryMeta}>{tile.meta}</p>
            </div>
          </div>
        ))}
      </div>

      <Card className={styles.panel}>
        <div className={styles.toolbar} aria-hidden="true">
          <Bar className="h-3 w-36" />
          <div className={styles.filters}>
            <span className={`${styles.skeletonControl} ${styles.search} animate-pulse`} />
            <span className={`${styles.skeletonControl} ${styles.accountSelect} animate-pulse`} />
            <span className={`${styles.skeletonControl} ${styles.levelSelect} animate-pulse`} />
          </div>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table} aria-hidden="true">
            <thead>
              <tr>
                {HEADERS.map((h) => (
                  <th key={h.label} className={h.numeric ? styles.num : undefined}>
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: STOCKS_PAGE_SIZE }).map((_, r) => (
                <tr key={r} style={{ opacity: Math.max(0.4, 1 - r * 0.04) }}>
                  <td>
                    <Bar className="h-3.5 w-36" />
                  </td>
                  <td>
                    <Bar className="h-3 w-20" />
                  </td>
                  <td>
                    <Bar className="h-3.5 w-16" />
                  </td>
                  <td className={styles.num}>
                    <span className="inline-flex items-baseline gap-1">
                      <Bar className="h-3.5 w-10" />
                      <Bar className="h-3 w-6" />
                    </span>
                  </td>
                  <td className={styles.num}>
                    <Bar className="h-3.5 w-8" />
                  </td>
                  <td className={styles.num}>
                    <Bar className="h-3.5 w-16" />
                  </td>
                  <td>
                    <Bar className="h-3.5 w-20" />
                  </td>
                  <td>
                    <Pill className="h-[22px] w-20" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={styles.footer} aria-hidden="true">
          <Bar className="h-3 w-36" />
          <span className="ml-auto flex items-center gap-1.5">
            <Pill className="h-8 w-8" />
            <Pill className="h-8 w-8" />
            <Pill className="h-8 w-8" />
          </span>
        </div>
      </Card>
    </section>
  )
}
