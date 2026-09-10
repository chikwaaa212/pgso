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
  const isBare = isLanding || isReceiptPath(pathname);
  const hideHeader = isBare || isPersonnel;

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
