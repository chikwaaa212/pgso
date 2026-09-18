"use client";

import { Spinner } from "@/components/ui/spinner";
import styles from "@/app/personnel/dashboard/page.module.css";

/**
 * Spinner shown inside receipt overlays while the receipt loads —
 * shared by the personnel and admin document modals so both roles see
 * the same loading state.
 */
export function ReceiptLoading({ label = "Loading receipt…" }: { label?: string }) {
  return (
    <div className={styles.emptyState}>
      <p
        className="flex items-center gap-3 text-sm font-semibold text-navy-800"
        role="status"
        aria-label={label}
      >
        <Spinner className="size-6" />
        {label}
      </p>
    </div>
  );
}
