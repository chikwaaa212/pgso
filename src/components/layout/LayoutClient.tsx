"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import "@/lib/gsap-register";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { ToastProvider } from "@/components/ui/toaster";
import styles from "./LayoutClient.module.css";

const LANDING_PATHS = ["/"];

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
      <div className={styles.root}>
        {hideHeader ? null : <Header />}
        <main className={styles.main}>{children}</main>
        {isReceiptPath(pathname) ? null : <Footer />}
      </div>
    </ToastProvider>
  );
}
