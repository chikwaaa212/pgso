"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import styles from "@/app/personnel/ppmp/workspace.module.css";

/**
 * Back link for the PPMP analytics and planning workspaces.
 *
 * The Super Admin portal re-exports the personnel screens, so the destination
 * is resolved from the current pathname instead of hardcoding one portal.
 */
export function PpmpBackLink() {
  const pathname = usePathname() ?? "";
  const isSuperAdmin = pathname.startsWith("/super-admin");
  const href = isSuperAdmin ? "/super-admin/ppmp" : "/personnel/ppmp";

  return (
    <div className={styles.backRow}>
      <Link href={href} className={styles.backLink}>
        <ArrowLeft size={13} aria-hidden="true" />
        Back to PPMP workspace
      </Link>
      <span className={styles.backCrumb} aria-hidden="true">
        /
      </span>
    </div>
  );
}
