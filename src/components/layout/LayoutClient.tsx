"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import "@/lib/gsap-register";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { ToastProvider } from "@/components/ui/toaster";
import styles from "./LayoutClient.module.css";

const LANDING_PATHS = ["/"];

export function LayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLanding = LANDING_PATHS.includes(pathname);

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
        {isLanding ? null : <Header />}
        <main className={styles.main}>{children}</main>
        <Footer />
      </div>
    </ToastProvider>
  );
}
