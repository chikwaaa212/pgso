import styles from '@/components/recommendations/recommendations.module.css'

export default function RecommendationsLoading() {
  return (
    <section className={styles.page} aria-busy="true" aria-label="Loading recommendations">
      <div className={styles.skeletonHeader} />
      <div className={styles.kpis}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={styles.skeletonCard} />
        ))}
      </div>
      <div className={styles.skeletonPanel} />
    </section>
  )
}
