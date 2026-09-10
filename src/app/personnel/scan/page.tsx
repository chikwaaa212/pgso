import { QrScanner } from "@/components/QrScanner";
import styles from "../dashboard/page.module.css";

export const dynamic = "force-dynamic";

export default function PersonnelScanPage() {
  return (
    <QrScanner
      crumb="Personnel / QR Scanner"
      title="QR Scanner"
      subtitle="Scan a completed-request or issue QR code — camera, image upload, or pasted data. Details show below."
      styles={styles}
    />
  );
}
