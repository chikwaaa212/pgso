import Image from "next/image";
import styles from "./brand-logo.module.css";

/**
 * System brand lockup — the Province of Davao Oriental official seal plus
 * wordmark. Used by the header, navbar, footer, and docs masthead.
 */
export function BrandLogo({ size = 44 }: { size?: number }) {
  return (
    <span className={styles.brand}>
      <Image
        src="/province-seal.png"
        alt="Province of Davao Oriental official seal"
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
