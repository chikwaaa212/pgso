import { redirect } from "next/navigation";
import { EmployeeChrome } from "@/components/employee/EmployeeChrome";
import {
  CompleteProfileOverlay,
  type ProfileOverlayInitial,
} from "@/components/employee/CompleteProfileOverlay";
import { needsProfileCompletion } from "@/lib/profile-completion";
import { getActiveDepartments } from "@/lib/master-data";
import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

interface ShellUser {
  name: string;
  detail: string;
  email: string | null;
  needsCompletion: boolean;
  initial: ProfileOverlayInitial;
  departments: { id: string; name: string }[];
}

async function getSidebarUser(): Promise<ShellUser> {
  const fallback = {
    name: "Employee",
    detail: "Staff",
    email: null as string | null,
    needsCompletion: false,
    initial: {
      prefix: "",
      firstName: "",
      middleName: "",
      lastName: "",
      suffix: "",
      employeeNo: "",
      department: "",
      position: "",
      office: "",
    } satisfies ProfileOverlayInitial,
    departments: [] as { id: string; name: string }[],
  };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Defense-in-depth behind middleware: never render the shell to anyone
  // who is not an active employee.
  if (!user) redirect("/login");

  // New profile-completion columns require migration 25. If the DB hasn't
  // been updated yet (P2022), fall back to the legacy columns so the shell
  // still renders instead of crashing every employee page.
  let profile: {
    full_name: string | null;
    role: string;
    status: string;
    position: string | null;
    office: string | null;
    prefix?: string | null;
    first_name?: string | null;
    middle_name?: string | null;
    last_name?: string | null;
    suffix?: string | null;
    employee_no?: string | null;
    department?: string | null;
    profile_completed?: boolean | null;
  } | null = null;
  try {
    profile = await prisma.profile.findUnique({
      where: { id: user.id },
      select: {
        full_name: true,
        role: true,
        status: true,
        position: true,
        office: true,
        prefix: true,
        first_name: true,
        middle_name: true,
        last_name: true,
        suffix: true,
        employee_no: true,
        department: true,
        profile_completed: true,
      },
    });
  } catch (e) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((e as any)?.code !== "P2022") throw e;
    console.error("[employee-layout:migration-25-missing] run migration 25 in Supabase", e);
    profile = await prisma.profile
      .findUnique({
        where: { id: user.id },
        select: { full_name: true, role: true, status: true, position: true, office: true },
      })
      .catch(() => null);
  }
  if (!profile || profile.role !== "employee" || profile.status !== "active") {
    redirect("/login");
  }
  const name =
    profile?.full_name?.trim() || user.email?.trim() || fallback.name;
  const position = profile?.position?.trim();
  const office = profile?.office?.trim();
  const detail = [position, office].filter(Boolean).join(" · ") || "Employee";

  const needsCompletion = needsProfileCompletion({
    profile_completed: profile.profile_completed ?? false,
    first_name: profile.first_name ?? null,
    last_name: profile.last_name ?? null,
    employee_no: profile.employee_no ?? null,
    department: profile.department ?? null,
    position: profile.position ?? null,
    office: profile.office ?? null,
  });

  let departments: { id: string; name: string }[] = [];
  if (needsCompletion) {
    try {
      departments = await getActiveDepartments();
    } catch {
      departments = [];
    }
  }

  return {
    name,
    detail,
    email: user.email ?? null,
    needsCompletion,
    initial: {
      prefix: profile.prefix?.trim() ?? "",
      firstName: profile.first_name?.trim() ?? "",
      middleName: profile.middle_name?.trim() ?? "",
      lastName: profile.last_name?.trim() ?? "",
      suffix: profile.suffix?.trim() ?? "",
      employeeNo: profile.employee_no?.trim() ?? "",
      department: profile.department?.trim() ?? "",
      position: profile.position?.trim() ?? "",
      office: profile.office?.trim() ?? "",
    },
    departments,
  };
}

export default async function EmployeeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sidebarUser = await getSidebarUser();
  return (
    <>
      <EmployeeChrome userName={sidebarUser.name} userDetail={sidebarUser.detail}>
        {children}
      </EmployeeChrome>
      {sidebarUser.needsCompletion && (
        <CompleteProfileOverlay
          initial={sidebarUser.initial}
          departments={sidebarUser.departments}
          email={sidebarUser.email}
        />
      )}
    </>
  );
}
