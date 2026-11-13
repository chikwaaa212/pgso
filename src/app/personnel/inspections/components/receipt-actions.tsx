"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { inspectionHref } from "@/lib/inspection-ref";
import { portalFromPathname } from "@/lib/portal-path";
import styles from "./receipt.module.css";

export function ReceiptActions({
  deliveryId,
  excelHref,
  showViewIar = false,
  children,
}: {
  deliveryId: string;
  /** When set, shows a "Download Excel" button (filled AIR .xlsx). */
  excelHref?: string;
  /** When true, shows a "View IAR" button (saved AIR). */
  showViewIar?: boolean;
  /** Extra toolbar buttons (e.g. Generate IAR dialog). */
  children?: React.ReactNode;
}) {
  const portal = portalFromPathname(usePathname());
  return (
    <div className={styles.toolbar}>
      {portal === "personnel" ? (
        <Link
          href={inspectionHref(deliveryId, "", portal)}
          className={cn(styles.toolbarBtn, styles.toolbarGhost)}
        >
          Back to inspection
        </Link>
      ) : null}
      <Link
        href={`/${portal}/inspections`}
        className={cn(styles.toolbarBtn, styles.toolbarGhost)}
      >
        Inspections list
      </Link>
      <button
        type="button"
        className={cn(styles.toolbarBtn, styles.toolbarPrint)}
        onClick={() => window.print()}
      >
        Print / Save PDF
      </button>
      {excelHref ? (
        <a
          href={excelHref}
          className={cn(styles.toolbarBtn, styles.toolbarGhost)}
        >
          Download Excel
        </a>
      ) : null}
      {showViewIar ? (
        <Link
          href={inspectionHref(deliveryId, "/iar", portal)}
          className={cn(styles.toolbarBtn, styles.toolbarGhost)}
        >
          View IAR
        </Link>
      ) : null}
      {children}
    </div>
  );
}