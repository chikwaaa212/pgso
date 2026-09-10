"use client";

import { usePathname } from "next/navigation";
import { PersonnelSidebar } from "./PersonnelSidebar";
import layoutStyles from "../../app/personnel/layout.module.css";

export function PersonnelChrome({
  children,
  pendingInspections = 0,
  pendingRequests = 0,
  pendingRepairs = 0,
  totalDocuments = 0,
  userName,
  userDetail,
}: {
  children: React.ReactNode;
  pendingInspections?: number;
  pendingRequests?: number;
  pendingRepairs?: number;
  totalDocuments?: number;
  userName?: string;
  userDetail?: string;
}) {
  const pathname = usePathname();
  const isBare =
    pathname.startsWith("/personnel/inspections/") &&
    /\/receipts?$|\/iar$/.test(pathname);

  if (isBare) {
    return <>{children}</>;
  }

  return (
    <div className={layoutStyles.shell}>
      <PersonnelSidebar
        pendingInspections={pendingInspections}
        pendingRequests={pendingRequests}
        pendingRepairs={pendingRepairs}
        totalDocuments={totalDocuments}
        userName={userName}
        userDetail={userDetail}
      />
      <div className={layoutStyles.main}>{children}</div>
    </div>
  );
}