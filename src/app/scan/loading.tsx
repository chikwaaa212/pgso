import { QrScannerSkeleton } from "@/components/QrScannerSkeleton";
import styles from "./scan.module.css";

export default function LoadingPublicScan() {
  return (
    <main
      className={styles.section}
      aria-busy="true"
      aria-label="Loading QR scanner"
    >
      <QrScannerSkeleton />
    </main>
  );
}
