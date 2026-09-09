import Link from 'next/link'
import { getInspectionHistory } from '../actions'
import styles from './page.module.css'
import type { DeliveryForInspection } from '../actions'

export async function InspectionHistory({
  delivery,
}: {
  delivery: DeliveryForInspection
}) {
  const history = await getInspectionHistory(delivery.id)

  const toneMap: Record<string, string> = {
    passed: 'ok',
    failed: 'bad',
    partial: 'warn',
  }

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>
        Personnel /{' '}
        <Link href="/personnel/inspections" className={styles.crumbLink}>
          Inspections
        </Link>{' '}
        / {delivery.id.slice(0, 8).toUpperCase()}
      </p>

      <div className={styles.headerRow}>
        <div>
          <Link href="/personnel/inspections" className={styles.backLink}>
            ← Back
          </Link>
          <h1 className={styles.title}>Inspection History</h1>
          <p className={styles.subtitle}>
            Delivery <strong>{delivery.id.slice(0, 8).toUpperCase()}</strong> —{' '}
            {delivery.supplier ?? 'Unknown supplier'}
          </p>
        </div>
      </div>

      {history.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.panelSub}>No inspection history available.</p>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Inspector</th>
                <th>Result</th>
                <th>Remarks</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {history.map((record) => (
                <tr key={record.id}>
                  <td>{record.inspection_date}</td>
                  <td>{record.inspector_name ?? '—'}</td>
                  <td>
                    <span
                      className={styles.status}
                      data-tone={toneMap[record.result] ?? 'info'}
                    >
                      {record.result.charAt(0).toUpperCase() +
                        record.result.slice(1)}
                    </span>
                  </td>
                  <td>{record.remarks ?? '—'}</td>
                  <td>
                    {record.created_at
                      ? new Date(record.created_at).toLocaleString('en-PH', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          timeZone: 'Asia/Manila',
                        })
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={styles.successActions}>
        <Link
          href={`/personnel/inspections/${delivery.id}`}
          className={styles.backLink}
        >
          ← Back to inspection
        </Link>
      </div>
    </section>
  )
}