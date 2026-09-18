"use client";

import { EmployeeNavbar } from "./EmployeeNavbar";
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
      <EmployeeNavbar userName={userName} userDetail={userDetail} />
      <div className={layoutStyles.main}>{children}</div>
    </div>
  );
}
