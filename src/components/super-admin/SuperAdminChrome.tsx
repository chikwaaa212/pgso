"use client";

import { SuperAdminNavbar } from "./SuperAdminNavbar";
import layoutStyles from "../../app/super-admin/layout.module.css";

export function SuperAdminChrome({
  children,
  navbar,
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
  pendingAccounts?: number;
  pendingInspections?: number;
  pendingRequests?: number;
  pendingRepairs?: number;
  totalDocuments?: number;
  userName?: string;
  userDetail?: string;
}) {
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
      <div className={layoutStyles.main}>{children}</div>
    </div>
  );
}
