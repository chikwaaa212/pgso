import { Suspense } from "react";
import { PersonnelChrome } from "@/components/personnel/PersonnelChrome";
import { PersonnelNavbar } from "@/components/personnel/PersonnelNavbar";
import { PersonnelNavbarLoader } from "./sidebar-loader";

export const dynamic = "force-dynamic";

export default function PersonnelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The navbar is static chrome — it never fetches on its own. Render the
  // real nav instantly as the Suspense fallback so there is never a skeleton
  // pulse in the navbar; badge counts / profile stream in and upgrade it
  // in place without flashing a placeholder.
  return (
    <PersonnelChrome
      navbar={
        <Suspense fallback={<PersonnelNavbar />}>
          <PersonnelNavbarLoader />
        </Suspense>
      }
    >
      {children}
    </PersonnelChrome>
  );
}
