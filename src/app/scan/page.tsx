import { QrScanner } from "@/components/QrScanner";
import { Navbar } from "@/components/navbar/Navbar";
import styles from "./scan.module.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Scan QR Code | PGSO",
  description:
    "Scan a PGSO request or issue QR code with your camera, an image upload, or pasted data. No login needed.",
};

export default function PublicScanPage() {
  return (
    <>
      <Navbar />
      <main>
        <QrScanner
          crumb="PGSO / QR Scanner"
          title="Scan a QR Code"
          subtitle="No login needed — point your camera at a request or issue QR, upload a photo of one, or paste its data. Details show below. Asset tags encode a private link, so they show as text here; sign in to open full asset details."
          styles={styles}
          center
        />
      </main>
    </>
  );
}
