import Image from "next/image";
import styles from "./brand-logo.module.css";

/**
 * System brand lockup — the PGSO EYE salute mascot plus wordmark.
 * Used by the header, navbar, footer, and docs masthead.
 */
export function BrandLogo({ size = 32 }: { size?: number }) {
  return (
    <span className={styles.brand}>
      <Image
        src="/salute.png"
        alt="PGSO EYE mascot"
        width={size}
        height={size}
        className={styles.mark}
      />
      <span className={styles.word}>
        PGSO&nbsp;<span className={styles.eye}>EYE</span>
      </span>
    </span>
  );
}
