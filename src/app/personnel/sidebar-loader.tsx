import { getDashboardStats } from "@/app/personnel/inspections/actions";
import { getDepartmentOptions } from "@/app/personnel/department/actions";
import { createClient } from "@/lib/supabase/server";
import { getPersonnelScope } from "@/lib/personnel-scope";
import { cacheKey, withCache } from "@/lib/personnel-cache";
import prisma from "@/lib/prisma";
import { PersonnelNavbar } from "@/components/personnel/PersonnelNavbar";

const ROLE_LABELS: Record<string, string> = {
  pgso_personnel: "PGSO Personnel",
  super_admin: "Super Admin",
  employee: "Employee",
};

async function getSidebarUser(): Promise<{ name: string; detail: string; office: string | null }> {
  const fallback = { name: "PGSO Personnel", detail: "Staff", office: null as string | null };
  try {
    // Scope is per-request memoized — no extra auth roundtrip here.
    const scope = await getPersonnelScope();
    if (!scope.userId) return fallback;
    // Profile display fields cached in Redis (120s, per-user key) so every
    // personnel navigation / refresh doesn't re-hit the database.
    const cached = await withCache(
      cacheKey("personnel:sidebar-user", { u: scope.userId }),
      120,
      () =>
        prisma.profile
          .findUnique({
            where: { id: scope.userId as string },
            select: { full_name: true, role: true, position: true, office: true },
          })
          .catch(() => null),
    );
    const profile = cached as {
      full_name: string | null;
      role: string | null;
      position: string | null;
      office: string | null;
    } | null;
    let email: string | undefined;
    if (!profile?.full_name?.trim()) {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      email = user?.email?.trim() || undefined;
    }
    const name =
      profile?.full_name?.trim() || email || fallback.name;
    const position = profile?.position?.trim();
    const office = profile?.office?.trim();
    const detail =
      [position, office].filter(Boolean).join(" · ") ||
      (profile?.role ? (ROLE_LABELS[profile.role] ?? profile.role) : fallback.detail);
    return { name, detail, office: office || null };
  } catch {
    return fallback;
  }
}

/**
 * Streams in parallel with the page — the layout no longer awaits this,
 * so back-navigation paints page content without waiting for badge counts.
 */
export async function PersonnelNavbarLoader() {
  const [stats, sidebarUser, departments] = await Promise.all([
    getDashboardStats(),
    getSidebarUser(),
    getDepartmentOptions().catch(() => []),
  ]);
  return (
    <PersonnelNavbar
      pendingInspections={stats.pendingInspections}
      pendingRequests={stats.pendingRequests}
      pendingRepairs={stats.pendingRepairs}
      totalDocuments={stats.totalDocuments}
      userName={sidebarUser.name}
      userDetail={sidebarUser.detail}
      currentDepartment={sidebarUser.office}
      departments={departments}
    />
  );
}

/**
 * @deprecated Renamed to {@link PersonnelNavbarLoader} — the sidebar was
 * replaced by a top navbar. Kept for backwards-compat.
 */
export const PersonnelSidebarLoader = PersonnelNavbarLoader;

/**
 * @deprecated No longer a skeleton — the navbar is static chrome and must
 * never show a pulse placeholder. Kept for backwards-compat; renders the
 * real instant nav with default (zero-badge) props.
 */
export function PersonnelSidebarSkeleton() {
  return <PersonnelNavbar />;
}
