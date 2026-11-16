import { QrScannerSkeleton } from "@/components/QrScannerSkeleton";
import styles from "../issues/page.module.css";

/**
 * Scan-specific skeleton — matches the shared scanner layout (header, camera
 * card, result area, side guide) so the live page swaps in without shifting.
 */
export default function ScanLoading() {
  return (
    <section
      className={styles.section}
      aria-busy="true"
      aria-label="Loading QR scanner"
    >
      <QrScannerSkeleton />
    </section>
  );
}
