import { redirect } from "next/navigation";
import { EmployeeChrome } from "@/components/employee/EmployeeChrome";
import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function getSidebarUser(): Promise<{ name: string; detail: string }> {
  const fallback = { name: "Employee", detail: "Staff" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Defense-in-depth behind middleware: never render the shell to anyone
  // who is not an active employee.
  if (!user) redirect("/login");
  const profile = await prisma.profile
    .findUnique({
      where: { id: user.id },
      select: { full_name: true, role: true, position: true, office: true, status: true },
    })
    .catch(() => null);
  if (!profile || profile.role !== "employee" || profile.status !== "active") {
    redirect("/login");
  }
  const name =
    profile?.full_name?.trim() || user.email?.trim() || fallback.name;
  const position = profile?.position?.trim();
  const office = profile?.office?.trim();
  const detail = [position, office].filter(Boolean).join(" · ") || "Employee";
  return { name, detail };
}

export default async function EmployeeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sidebarUser = await getSidebarUser();
  return (
    <EmployeeChrome userName={sidebarUser.name} userDetail={sidebarUser.detail}>
      {children}
    </EmployeeChrome>
  );
}
