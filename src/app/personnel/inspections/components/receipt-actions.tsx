"use client";

import Link from "next/link";
import { Printer, ChevronLeft, List, FileSpreadsheet, FileSearch } from "lucide-react";
import { cn } from "@/lib/utils";
import styles from "./receipt.module.css";

export function ReceiptActions({
  deliveryId,
  excelHref,
  viewIarHref,
  children,
}: {
  deliveryId: string;
  /** When set, shows a "Download Excel" button (filled AIR .xlsx). */
  excelHref?: string;
  /** When set, shows a "View IAR" button (saved AIR). */
  viewIarHref?: string;
  /** Extra toolbar buttons (e.g. Generate IAR dialog). */
  children?: React.ReactNode;
}) {
  return (
    <div className={styles.toolbar}>
      <Link
        href={`/personnel/inspections/${deliveryId}`}
        className={cn(styles.toolbarBtn, styles.toolbarGhost)}
      >
        <ChevronLeft className="h-4 w-4" />
        Back to inspection
      </Link>
      <Link
        href="/personnel/inspections"
        className={cn(styles.toolbarBtn, styles.toolbarGhost)}
      >
        <List className="h-4 w-4" />
        Inspections list
      </Link>
      <button
        type="button"
        className={cn(styles.toolbarBtn, styles.toolbarPrint)}
        onClick={() => window.print()}
      >
        <Printer className="h-4 w-4" />
        Print / Save PDF
      </button>
      {excelHref ? (
        <a
          href={excelHref}
          className={cn(styles.toolbarBtn, styles.toolbarGhost)}
        >
          <FileSpreadsheet className="h-4 w-4" />
          Download Excel
        </a>
      ) : null}
      {viewIarHref ? (
        <Link
          href={viewIarHref}
          className={cn(styles.toolbarBtn, styles.toolbarGhost)}
        >
          <FileSearch className="h-4 w-4" />
          View IAR
        </Link>
      ) : null}
      {children}
    </div>
  );
}