import { getDashboardStats } from "@/app/personnel/inspections/actions";
import { SuperAdminSidebar } from "@/components/super-admin/SuperAdminSidebar";
import { getPendingAccounts } from "./navbar-loader";

/**
 * Streams the desktop left rail. Shares the request-memoized dashboard stats
 * with the navbar loader, so badge counts cost no extra queries.
 */
export async function SuperAdminSidebarLoader() {
  const [stats, pendingAccounts] = await Promise.all([
    getDashboardStats(),
    getPendingAccounts(),
  ]);
  return (
    <SuperAdminSidebar
      pendingAccounts={pendingAccounts}
      pendingInspections={stats.pendingInspections}
      pendingRequests={stats.pendingRequests}
      pendingRepairs={stats.pendingRepairs}
      totalDocuments={stats.totalDocuments}
    />
  );
}
