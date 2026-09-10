import { PersonnelChrome } from "@/components/personnel/PersonnelChrome";
import { getDashboardStats } from "@/app/personnel/inspections/actions";

export const dynamic = "force-dynamic";

export default async function PersonnelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const stats = await getDashboardStats();
  return (
    <PersonnelChrome
      pendingInspections={stats.pendingInspections}
      pendingRequests={stats.pendingRequests}
      pendingRepairs={stats.pendingRepairs}
      totalDocuments={stats.totalDocuments}
    >
      {children}
    </PersonnelChrome>
  );
}