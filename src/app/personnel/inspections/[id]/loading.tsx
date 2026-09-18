import { Card } from "@/components/ui/card";
import styles from "./page.module.css";

/**
 * Mirrors the inspection form page shell (crumb, header, progress,
 * summary + section cards, submit row) so the fetch shows a form
 * skeleton instead of the inspections list skeleton.
 */

function Pulse({ className }: { className: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded bg-navy-100 ${className}`}
    />
  );
}

function SectionCard({
  title,
  sub,
  children,
}: {
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={styles.card}>
      <div className={styles.sectionHead}>
        <span className={styles.sectionIcon}>
          <span className="block h-5 w-5 animate-pulse rounded bg-navy-100" />
        </span>
        <div>
          <h2 className={styles.sectionTitle}>{title}</h2>
          <p className={styles.sectionSub}>{sub}</p>
        </div>
      </div>
      {children}
    </Card>
  );
}

export default function InspectionFormLoading() {
  return (
    <section
      className={styles.section}
      aria-busy="true"
      aria-label="Loading inspection form"
    >
      <p className={styles.crumb}>Personnel / Inspections / …</p>

      <div className={styles.headerRow}>
        <div>
          <span className={styles.backLink} aria-hidden="true">
            Back
          </span>
          <h1 className={styles.title}>Delivery Inspection</h1>
          <p className={styles.subtitle} aria-hidden="true">
            <span className="mt-1 block h-4 w-64 animate-pulse rounded bg-navy-100" />
          </p>
        </div>
      </div>

      <div className={styles.progressWrap} aria-hidden="true">
        <div className={styles.progressBar}>
          <div className={styles.progressFill} style={{ width: "12%" }} />
        </div>
        <Pulse className="h-3 w-20" />
      </div>

      <div className={styles.form} aria-hidden="true">
        <SectionCard
          title="Delivery summary"
          sub="What was received for this delivery."
        >
          <div className={styles.summaryGrid}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={styles.summaryItem}>
                <Pulse className="h-3 w-20" />
                <Pulse className="mt-1 h-4 w-32" />
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Supplier & document verification"
          sub="Confirm the delivery paperwork."
        >
          <div className={styles.checkList}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={styles.checkRow}>
                <Pulse className="h-3.5 w-3/4" />
                <Pulse className="h-8 w-28 rounded-[4px]" />
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Item cross-verification"
          sub="Verify each delivered item."
        >
          <div className={styles.itemTableWrap}>
            {Array.from({ length: 4 }).map((_, i) => (
              <Pulse
                key={i}
                className="mb-2 h-12 w-full"
                aria-hidden="true"
              />
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Verdict" sub="Inspector, date, and result.">
          <div className={styles.verdictGrid}>
            <Pulse className="h-9 w-full rounded-md" />
            <Pulse className="h-9 w-full rounded-md" />
          </div>
        </SectionCard>

        <div className={styles.submitRow}>
          <div className={styles.submitActions}>
            <span className="inline-flex h-8 w-20 items-center justify-center rounded-[4px] bg-navy-100 px-3.5" />
            <span className="inline-flex h-8 w-36 items-center justify-center rounded-[4px] bg-navy-200 px-3.5" />
          </div>
        </div>
      </div>
    </section>
  );
}
