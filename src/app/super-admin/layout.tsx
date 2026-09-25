import { Suspense } from "react";
import { redirect } from "next/navigation";
import { SuperAdminChrome } from "@/components/super-admin/SuperAdminChrome";
import { SuperAdminNavbar } from "@/components/super-admin/SuperAdminNavbar";
import { getSuperAdminSession } from "@/lib/auth-guard";
import { SuperAdminNavbarLoader } from "./navbar-loader";

export const dynamic = "force-dynamic";

async function getNavbarUser(): Promise<{ name: string; detail: string }> {
  const fallback = { name: "Super Admin", detail: "Administrator" };
  // Defense-in-depth behind middleware: never render the shell to anyone
  // who is not an active super_admin. Uses the per-request memoized guard
  // so layout + page share one Auth + profile lookup.
  const session = await getSuperAdminSession();
  if (!session) redirect("/login");
  const { profile, email } = session;
  const name = profile?.full_name?.trim() || email?.trim() || fallback.name;
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
  // Auth guard stays blocking (fast single profile query) so unauthorized
  // users never see page content. Badge counts stream in via Suspense so
  // navigation paints without waiting for stats — same pattern as
  // personnel layout.
  const navbarUser = await getNavbarUser();
  return (
    <SuperAdminChrome
      navbar={
        <Suspense
          fallback={
            <SuperAdminNavbar
              userName={navbarUser.name}
              userDetail={navbarUser.detail}
            />
          }
        >
          <SuperAdminNavbarLoader
            userName={navbarUser.name}
            userDetail={navbarUser.detail}
          />
        </Suspense>
      }
    >
      {children}
    </SuperAdminChrome>
  );
}
