import { PersonnelChrome } from "@/components/personnel/PersonnelChrome";

export const dynamic = "force-dynamic";

export default function PersonnelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PersonnelChrome>{children}</PersonnelChrome>;
}