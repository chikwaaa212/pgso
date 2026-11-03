import { Card } from "@/components/ui/card";
import styles from "../dashboard/page.module.css";

/**
 * Scan-specific skeleton — mirrors PersonnelScanPage (centered QrScanner
 * idle state) 1:1: crumb, centered header, and the camera panel with its
 * start button so content swaps in without layout shift.
 *
 * Static chrome renders as real text with real classes; only live
 * controls are pulse placeholders sized to the real elements. The
 * video preview and scanned-info card only appear after interaction,
 * so the idle skeleton omits them just like the real page.
 */

const panelClass = `${styles.panel} mx-auto w-full max-w-2xl`;
const titleClass = `${styles.panelTitle} text-center`;
const subClass = `${styles.panelSub} text-center`;

export default function ScanLoading() {
  return (
    <section
      className={styles.section}
      aria-busy="true"
      aria-label="Loading QR scanner"
    >
      <p className={styles.crumb}>Personnel / QR Scanner</p>

      {/* Header — same centered copy as the real page */}
      <div className="text-center">
        <h1 className={styles.title}>QR Scanner</h1>
        <p className={styles.subtitle}>
          Point the camera at a completed-request or issue QR code. Details
          show below.
        </p>
      </div>

      {/* Camera — same panel, centered title + start button */}
      <Card className={panelClass}>
        <h2 className={titleClass}>Camera</h2>
        <p className={subClass}>Point the camera at the QR code.</p>
        <div
          className="flex flex-wrap items-center justify-center gap-2"
          aria-hidden="true"
        >
          <div className="h-9 w-28 animate-pulse rounded-md bg-navy-100" />
        </div>
      </Card>
    </section>
  );
}
