import { QrScanner } from "@/components/QrScanner";
import { Navbar } from "@/components/navbar/Navbar";
import styles from "./scan.module.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Scan QR Code | PGSO",
  description:
    "Point your camera at a PGSO request, issue, or asset QR code to see its details. Asset tags show basic property info without login.",
};

export default function PublicScanPage() {
  return (
    <>
      <Navbar />
      <main>
        <QrScanner
          crumb="PGSO / QR Scanner"
          title="Scan a QR Code"
          subtitle="No login needed — point your camera at a request, issue, or asset tag. Details show below. Asset tags show basic property info; sign in to open full asset details and history."
          styles={styles}
          center
        />
      </main>
    </>
  );
}
