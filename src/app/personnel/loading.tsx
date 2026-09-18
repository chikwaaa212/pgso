import styles from "./dashboard/page.module.css";
import { Card } from "@/components/ui/card";

/**
 * Instant skeleton shown during forward/back navigation while the
 * force-dynamic page re-renders on the server.
 */
export default function PersonnelLoading() {
  return (
    <section className={styles.section} aria-busy="true" aria-label="Loading page">
      <div className="h-3 w-28 animate-pulse rounded bg-navy-100" />
      <div className="flex flex-col gap-2">
        <div className="h-7 w-48 animate-pulse rounded bg-navy-100" />
        <div className="h-4 w-32 animate-pulse rounded bg-navy-100" />
      </div>
      <Card className={styles.panel}>
        <div className="flex flex-col gap-1">
          <div className="h-5 w-32 animate-pulse rounded bg-navy-100" />
          <div className="h-3.5 w-64 animate-pulse rounded bg-navy-100" />
        </div>
        <div className="flex flex-col gap-2 pt-2" aria-hidden="true">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-11 animate-pulse rounded-lg bg-navy-100"
              style={{ opacity: 1 - i * 0.08 }}
            />
          ))}
        </div>
      </Card>
    </section>
  );
}
