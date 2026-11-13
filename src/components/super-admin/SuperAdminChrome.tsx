"use client";

import { usePathname } from "next/navigation";
import { SuperAdminNavbar } from "./SuperAdminNavbar";
import { SuperAdminSidebar } from "./SuperAdminSidebar";
import layoutStyles from "../../app/super-admin/layout.module.css";

export function SuperAdminChrome({
  children,
  navbar,
  sidebar,
  pendingAccounts = 0,
  pendingInspections = 0,
  pendingRequests = 0,
  pendingRepairs = 0,
  totalDocuments = 0,
  userName,
  userDetail,
}: {
  children: React.ReactNode;
  /** Streamed navbar slot — when provided it renders immediately via Suspense. */
  navbar?: React.ReactNode;
  /** Streamed left-rail slot (desktop only). */
  sidebar?: React.ReactNode;
  pendingAccounts?: number;
  pendingInspections?: number;
  pendingRequests?: number;
  pendingRepairs?: number;
  totalDocuments?: number;
  userName?: string;
  userDetail?: string;
}) {
  const pathname = usePathname();
  // Receipts and IAR sheets are print-first: same bare shell as personnel.
  const isBare =
    pathname.startsWith("/super-admin/inspections/") &&
    /\/receipts?$|\/iar$/.test(pathname);

  if (isBare) {
    return <>{children}</>;
  }

  return (
    <div className={layoutStyles.shell}>
      {navbar ?? (
        <SuperAdminNavbar
          pendingAccounts={pendingAccounts}
          pendingInspections={pendingInspections}
          pendingRequests={pendingRequests}
          pendingRepairs={pendingRepairs}
          totalDocuments={totalDocuments}
          userName={userName}
          userDetail={userDetail}
        />
      )}
      <div className={layoutStyles.body}>
        {sidebar ?? (
          <SuperAdminSidebar
            pendingAccounts={pendingAccounts}
            pendingInspections={pendingInspections}
            pendingRequests={pendingRequests}
            pendingRepairs={pendingRepairs}
            totalDocuments={totalDocuments}
          />
        )}
        <div className={layoutStyles.main}>{children}</div>
      </div>
    </div>
  );
}
