import { QrScanner } from "@/components/QrScanner";
import styles from "../dashboard/page.module.css";

export const dynamic = "force-dynamic";

export default function PersonnelScanPage() {
  return (
    <QrScanner
      crumb="Personnel / QR Scanner"
      title="QR Scanner"
      subtitle="Point the camera at a completed-request, issue, or asset QR code. Details show below."
      styles={styles}
      center
    />
  );
}
