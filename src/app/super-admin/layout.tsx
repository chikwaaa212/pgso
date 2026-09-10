import { redirect } from "next/navigation";
import { SuperAdminChrome } from "@/components/super-admin/SuperAdminChrome";
import { getDashboardStats } from "@/app/personnel/inspections/actions";
import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function getPendingAccounts(): Promise<number> {
  try {
    return await prisma.profile.count({
      where: { role: "employee", status: "pending" },
    });
  } catch {
    return 0;
  }
}

async function getSidebarUser(): Promise<{ name: string; detail: string }> {
  const fallback = { name: "Super Admin", detail: "Administrator" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Defense-in-depth behind middleware: never render the shell to anyone
  // who is not an active super_admin.
  if (!user) redirect("/login");
  const profile = await prisma.profile
    .findUnique({
      where: { id: user.id },
      select: { full_name: true, role: true, position: true, office: true, status: true },
    })
    .catch(() => null);
  if (!profile || profile.role !== "super_admin" || profile.status !== "active") {
    redirect("/login");
  }
  const name =
    profile?.full_name?.trim() || user.email?.trim() || fallback.name;
  const position = profile?.position?.trim();
  const office = profile?.office?.trim();
  const detail =
    [position, office].filter(Boolean).join(" · ") || "Super Admin";
  return { name, detail };
}

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [stats, pendingAccounts, sidebarUser] = await Promise.all([
    getDashboardStats(),
    getPendingAccounts(),
    getSidebarUser(),
  ]);
  return (
    <SuperAdminChrome
      pendingAccounts={pendingAccounts}
      pendingInspections={stats.pendingInspections}
      pendingRequests={stats.pendingRequests}
      pendingRepairs={stats.pendingRepairs}
      totalDocuments={stats.totalDocuments}
      userName={sidebarUser.name}
      userDetail={sidebarUser.detail}
    >
      {children}
    </SuperAdminChrome>
  );
}
