import styles from '@/components/recommendations/recommendations.module.css'

export default function RecommendationsLoading() {
  return (
    <section className={styles.page} aria-busy="true" aria-label="Loading recommendations">
      <div className={styles.content}>
        <div className={styles.skeletonHeader} />
        <div className={styles.skeletonMsg}>
          <div className={styles.skeletonAvatar} />
          <div className={styles.skeletonLines}>
            <div className={styles.skeletonLine} />
            <div className={styles.skeletonLine} />
          </div>
        </div>
        <div className={styles.skeletonCards}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className={styles.skeletonCard} />
          ))}
        </div>
      </div>
    </section>
  )
}
