import styles from "./layout.module.css";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className={styles.root}>
      <div className={styles.glow1} />
      <div className={styles.glow2} />
      <div className={styles.ring1} />
      <div className={styles.ring2} />
      <div className={styles.content}>
        {children}
      </div>
    </div>
  )
}
