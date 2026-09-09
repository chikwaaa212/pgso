"use client";

import { usePathname } from "next/navigation";
import { PersonnelSidebar } from "./PersonnelSidebar";
import layoutStyles from "../../app/personnel/layout.module.css";

export function PersonnelChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isBare =
    pathname.startsWith("/personnel/inspections/") &&
    /\/receipts?$|\/iar$/.test(pathname);

  if (isBare) {
    return <>{children}</>;
  }

  return (
    <div className={layoutStyles.shell}>
      <PersonnelSidebar />
      <div className={layoutStyles.main}>{children}</div>
    </div>
  );
}