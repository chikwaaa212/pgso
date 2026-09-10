import { PersonnelChrome } from "@/components/personnel/PersonnelChrome";
import { getDashboardStats } from "@/app/personnel/inspections/actions";
import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

const ROLE_LABELS: Record<string, string> = {
  pgso_personnel: "PGSO Personnel",
  super_admin: "Super Admin",
  employee: "Employee",
};

async function getSidebarUser(): Promise<{ name: string; detail: string }> {
  const fallback = { name: "PGSO Personnel", detail: "Staff" };
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return fallback;
    const profile = await prisma.profile
      .findUnique({
        where: { id: user.id },
        select: { full_name: true, role: true, position: true, office: true },
      })
      .catch(() => null);
    const name =
      profile?.full_name?.trim() || user.email?.trim() || fallback.name;
    const position = profile?.position?.trim();
    const office = profile?.office?.trim();
    const detail =
      [position, office].filter(Boolean).join(" · ") ||
      (profile?.role ? (ROLE_LABELS[profile.role] ?? profile.role) : fallback.detail);
    return { name, detail };
  } catch {
    return fallback;
  }
}

export default async function PersonnelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [stats, sidebarUser] = await Promise.all([
    getDashboardStats(),
    getSidebarUser(),
  ]);
  return (
    <PersonnelChrome
      pendingInspections={stats.pendingInspections}
      pendingRequests={stats.pendingRequests}
      pendingRepairs={stats.pendingRepairs}
      totalDocuments={stats.totalDocuments}
      userName={sidebarUser.name}
      userDetail={sidebarUser.detail}
    >
      {children}
    </PersonnelChrome>
  );
}