import { getDashboardStats } from "@/app/personnel/inspections/actions";
import prisma from "@/lib/prisma";
import { SuperAdminNavbar } from "@/components/super-admin/SuperAdminNavbar";

async function getPendingAccounts(): Promise<number> {
  try {
    return await prisma.profile.count({
      where: { role: "employee", status: "pending" },
    });
  } catch {
    return 0;
  }
}

/**
 * Streams in parallel with the page — the layout no longer awaits badge
 * counts, so navigation paints page content without waiting for stats.
 * Auth stays in the layout (blocking) so unauthorized users never see
 * page content before the redirect.
 */
export async function SuperAdminNavbarLoader({
  userName = "Super Admin",
  userDetail = "Administrator",
}: {
  userName?: string;
  userDetail?: string;
}) {
  const [stats, pendingAccounts] = await Promise.all([
    getDashboardStats(),
    getPendingAccounts(),
  ]);
  return (
    <SuperAdminNavbar
      pendingAccounts={pendingAccounts}
      pendingInspections={stats.pendingInspections}
      pendingRequests={stats.pendingRequests}
      pendingRepairs={stats.pendingRepairs}
      totalDocuments={stats.totalDocuments}
      userName={userName}
      userDetail={userDetail}
    />
  );
}
