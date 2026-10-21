import { QrScanner } from "@/components/QrScanner";
import styles from "../issues/page.module.css";

export const dynamic = "force-dynamic";

export default function SuperAdminScanPage() {
  return (
    <QrScanner
      crumb="QR Scanner"
      title="QR Scanner"
      subtitle="Scan a completed-request, issue, or asset QR code — camera, image upload, or pasted data. Details show below."
      styles={styles}
      center
    />
  );
}
