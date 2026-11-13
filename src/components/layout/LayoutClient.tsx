"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { Header } from "@/components/layout/header";
import { ClientCacheManager } from "@/components/ClientCacheManager";
import { ToastProvider } from "@/components/ui/toaster";
import { Toaster } from "@/components/ui/sonner";
import styles from "./LayoutClient.module.css";

// Marketing footer is public-only and code-split, so Framer Motion never
// enters the portal first-load bundles.
const Footer = dynamic(() =>
  import("@/components/layout/footer").then((m) => m.Footer)
);

const LANDING_PATHS = ["/", "/scan"];

function isReceiptPath(pathname: string) {
  return (
    pathname.startsWith("/personnel/inspections/") &&
    /\/receipts?$|\/iar$/.test(pathname)
  );
}

export function LayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLanding = LANDING_PATHS.includes(pathname);
  const isPersonnel = pathname.startsWith("/personnel");
  const isSuperAdmin = pathname.startsWith("/super-admin");
  const isEmployee = pathname.startsWith("/employee");
  const isAuth = pathname === "/login" || pathname.startsWith("/login/") || pathname === "/signup" || pathname.startsWith("/signup/");
  // Info docs open in a new tab as standalone reading pages — no navbar.
  const isInfo = pathname === "/info" || pathname.startsWith("/info/");
  const isBare = isLanding || isReceiptPath(pathname);
  // App shells (sidebars), auth screens, and standalone docs render without the global navbar.
  const hideHeader = isBare || isPersonnel || isSuperAdmin || isEmployee || isAuth || isInfo;
  // Marketing footer belongs to the public site only — not the portals or auth screens.
  const showFooter = !isPersonnel && !isSuperAdmin && !isEmployee && !isAuth && !isReceiptPath(pathname);

  useEffect(() => {
    const html = document.documentElement;
    if (isLanding) {
      html.classList.add("landing-page");
    } else {
      html.classList.remove("landing-page");
    }
  }, [isLanding]);

  return (
    <ToastProvider>
      <ClientCacheManager />
      <div className={styles.root}>
        {hideHeader ? null : <Header />}
        <main className={styles.main}>{children}</main>
        {showFooter ? <Footer /> : null}
      </div>
      <Toaster position="top-right" duration={2000} closeButton />
    </ToastProvider>
  );
}
