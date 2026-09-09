"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { logout } from "@/app/(auth)/auth";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/utils";
import styles from "./PersonnelSidebar.module.css";

interface SidebarLink {
  label: string;
  href: string;
  badge?: number;
}

export function PersonnelSidebar({ pendingInspections = 0 }: { pendingInspections?: number }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const groups: { title: string; links: SidebarLink[] }[] = [
    {
      title: "Overview",
      links: [{ label: "Dashboard", href: "/personnel/dashboard" }],
    },
    {
      title: "Operations",
      links: [
        { label: "Deliveries", href: "/personnel/deliveries" },
        { label: "Inspections", href: "/personnel/inspections", badge: pendingInspections },
      ],
    },
    {
      title: "Inventory",
      links: [
        { label: "Stock", href: "/personnel/inventory" },
        { label: "Assets", href: "/personnel/assets" },
      ],
    },
    {
      title: "Records",
      links: [
        { label: "Documents", href: "/personnel/documents" },
        { label: "Requests", href: "/personnel/requests" },
        { label: "Repairs", href: "/personnel/repairs" },
      ],
    },
  ];

  return (
    <>
      <button
        type="button"
        className={styles.toggle}
        onClick={() => setOpen(!open)}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
      >
        {open ? <X size={20} /> : <Menu size={20} />}
        Menu
      </button>

      <aside
        className={styles.sidebar}
        data-open={open}
        aria-label="Personnel navigation"
      >
        <nav className={styles.nav}>
          {groups.map((group) => (
            <div key={group.title} className={styles.group}>
              <p className={styles.groupTitle}>{group.title}</p>
              {group.links.map((link) => {
                const isActive =
                  pathname === link.href || pathname.startsWith(link.href + "/");
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={styles.link}
                    aria-current={isActive ? "page" : undefined}
                    data-active={isActive}
                    onClick={() => setOpen(false)}
                  >
                    {link.label}
                    {(link.badge ?? 0) > 0 && (
                      <span className={styles.badge} aria-label={`${link.badge} pending`}>
                        {link.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className={styles.user}>
          <div className={styles.avatar} aria-hidden="true">
            P
          </div>
          <div className={styles.userInfo}>
            <span className={styles.userName}>PGSO Personnel</span>
            <span className={styles.userRole}>Staff (mock)</span>
          </div>
          <form action={logout}>
            <SubmitButton
              variant="ghost"
              size="sm"
              pendingLabel="Logging out…"
              spinnerClassName="size-3.5"
              className={cn(styles.signOut, "rounded-md h-auto")}
            >
              Log out
            </SubmitButton>
          </form>
        </div>
      </aside>
    </>
  );
}
