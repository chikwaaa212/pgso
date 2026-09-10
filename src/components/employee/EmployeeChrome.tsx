"use client";

import { EmployeeSidebar } from "./EmployeeSidebar";
import layoutStyles from "../../app/employee/layout.module.css";

export function EmployeeChrome({
  children,
  userName,
  userDetail,
}: {
  children: React.ReactNode;
  userName?: string;
  userDetail?: string;
}) {
  return (
    <div className={layoutStyles.shell}>
      <EmployeeSidebar userName={userName} userDetail={userDetail} />
      <div className={layoutStyles.main}>{children}</div>
    </div>
  );
}
