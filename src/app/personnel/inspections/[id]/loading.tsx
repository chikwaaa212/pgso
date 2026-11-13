import { Card } from "@/components/ui/card";
import styles from "./page.module.css";
import receipt from "../../deliveries/delivery-receipt.module.css";

/**
 * Mirrors the inspection form page shell exactly — header, progress, the
 * Delivery Record / Supplier Verification row, the Documentary Photos /
 * Inspector & Verdict row, and the submit row — so loading this route shows
 * the same layout that is about to replace it.
 */

function Pulse({ className }: { className: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded bg-navy-100 ${className}`}
    />
  );
}

function SectionHeadingSkeleton() {
  return (
    <div className={styles.sectionHead}>
      <span className={styles.sectionIcon}>
        <Pulse className="h-5 w-5" />
      </span>
      <div className="flex-1">
        <Pulse className="h-4 w-48" />
        <Pulse className="mt-2 h-3 w-64" />
      </div>
    </div>
  );
}

function DeliveryReceiptSkeleton() {
  return (
    <article className={receipt.sheet} aria-hidden="true">
      <header className={receipt.top}>
        <div className={receipt.brand}>
          <Pulse className="h-6 w-24" />
          <Pulse className="mt-2 h-2.5 w-40" />
        </div>
        <div className={receipt.doc}>
          <Pulse className="ml-auto h-3 w-28" />
          <Pulse className="mt-2 ml-auto h-3.5 w-20" />
          <Pulse className="mt-2 ml-auto h-2.5 w-24" />
        </div>
      </header>

      <section className={receipt.section}>
        <Pulse className="h-2.5 w-28" />
        <dl className={`${receipt.grid} mt-3`}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className={receipt.field}>
              <Pulse className="h-2.5 w-16" />
              <Pulse className="mt-1.5 h-3.5 w-28" />
            </div>
          ))}
        </dl>
      </section>

      <section className={receipt.section}>
        <Pulse className="h-2.5 w-36" />
        <div className={`${receipt.tableWrap} mt-3`}>
          <div className="flex gap-3 border-b-2 border-navy-200 pb-2">
            {["w-6", "w-40", "w-12", "w-10", "w-16", "w-16"].map((w, i) => (
              <Pulse key={i} className={`h-2.5 ${w}`} />
            ))}
          </div>
          {Array.from({ length: 4 }).map((_, row) => (
            <div
              key={row}
              className="flex items-center gap-3 border-b border-navy-100 py-3 last:border-0"
            >
              <Pulse className="h-3 w-6" />
              <Pulse className="h-3 w-40" />
              <Pulse className="h-3 w-12" />
              <Pulse className="h-3 w-10" />
              <Pulse className="h-3 w-16" />
              <Pulse className="h-3 w-16" />
            </div>
          ))}
        </div>
      </section>

      <footer className={receipt.footer}>
        <Pulse className="h-2.5 w-32" />
        <div className={receipt.footerMeta}>
          <span className="block h-8 w-40 rounded-sm bg-navy-100 animate-pulse" />
          <Pulse className="h-2.5 w-24" />
        </div>
      </footer>
    </article>
  );
}

export default function InspectionFormLoading() {
  return (
    <section
      className={styles.section}
      aria-busy="true"
      aria-label="Loading inspection form"
    >
      <div className={styles.headerRow}>
        <div>
          <span className={styles.backLink} aria-hidden="true">
            Back
          </span>
          <div className={styles.title}>
            Delivery Inspection
            <Pulse className="ml-2 inline-block h-5 w-28 align-middle" />
          </div>
          <div className={styles.subtitle} aria-hidden="true">
            <Pulse className="mt-1 h-4 w-80" />
          </div>
        </div>
      </div>

      <div className={styles.progressWrap} aria-hidden="true">
        <div className={styles.progressBar}>
          <div className={styles.progressFill} style={{ width: "8%" }} />
        </div>
        <Pulse className="h-3 w-20" />
      </div>

      <div className={styles.form} aria-hidden="true">
        {/* Row 1 — Delivery Record + Supplier & Document Verification */}
        <div className={styles.reviewGrid}>
          <DeliveryReceiptSkeleton />

          <Card className={`${styles.card} ${styles.verificationCard}`}>
            <SectionHeadingSkeleton />
            <div className={styles.checkList}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className={styles.checkRow}>
                  <span className={styles.checkIndex}>
                    <Pulse className="h-3 w-3" />
                  </span>
                  <div className="flex-1">
                    <Pulse className="h-3.5 w-3/4" />
                  </div>
                  <Pulse className="h-9 w-28 rounded-md" />
                </div>
              ))}
            </div>
            <div className={styles.crossVerifyBanner}>
              <span className={styles.crossVerifyIcon}>
                <Pulse className="h-5 w-5" />
              </span>
              <span className={styles.crossVerifyText}>
                <Pulse className="h-3.5 w-48" />
                <Pulse className="mt-1.5 h-3 w-64" />
              </span>
              <Pulse className="h-5 w-16 rounded-full" />
            </div>
          </Card>
        </div>

        {/* Row 2 — Documentary Photos + Inspector Information & Verdict */}
        <div className={styles.reviewGrid}>
          <Card className={styles.card}>
            <SectionHeadingSkeleton />
            <div className={styles.photoBody}>
              <div className={styles.photoGrid}>
                <div className={styles.addPhotoTile}>
                  <Pulse className="h-7 w-7" />
                  <Pulse className="h-3 w-16" />
                </div>
              </div>
              <div className={`${styles.hint} ${styles.photoHint}`}>
                <Pulse className="h-3 w-72" />
              </div>
            </div>
          </Card>

          <Card className={styles.card}>
            <SectionHeadingSkeleton />
            <div className={styles.lockNotice}>
              <span className={styles.lockIcon}>
                <Pulse className="h-5 w-5" />
              </span>
              <div className={styles.lockText}>
                <Pulse className="h-3.5 w-44" />
                <Pulse className="mt-1.5 h-3 w-64" />
              </div>
              <Pulse className="h-6 w-20 rounded-[4px]" />
            </div>
            <div className={styles.verdictGrid}>
              <div className={styles.field}>
                <Pulse className="h-3 w-28" />
                <Pulse className="h-9 w-full rounded-md" />
              </div>
              <div className={styles.field}>
                <Pulse className="h-3 w-28" />
                <Pulse className="h-9 w-full rounded-md" />
              </div>
              <div className={styles.fieldFull}>
                <Pulse className="h-3 w-24" />
                <Pulse className="h-20 w-full rounded-md" />
              </div>
              <div className={styles.fieldFull}>
                <Pulse className="h-3 w-32" />
                <div className={styles.verdictOptions}>
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="flex min-h-[7.5rem] flex-col gap-2 rounded-md border border-navy-100 p-3"
                    >
                      <Pulse className="h-4 w-24" />
                      <Pulse className="h-3 w-full" />
                      <Pulse className="h-3 w-4/5" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </div>

        <div className={styles.submitRow}>
          <div className={styles.submitActions}>
            <span className="inline-flex h-6 w-36 animate-pulse items-center justify-center rounded-[4px] bg-navy-100 px-3" />
          </div>
        </div>
      </div>
    </section>
  );
}
