"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/(auth)/auth";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/utils";
import styles from "./SuperAdminSidebar.module.css";

interface SidebarLink {
  label: string;
  href: string;
  badge?: number;
}

export function SuperAdminSidebar({
  pendingAccounts = 0,
  pendingInspections = 0,
  pendingRequests = 0,
  pendingRepairs = 0,
  totalDocuments = 0,
  userName = "Super Admin",
  userDetail = "Administrator",
}: {
  pendingAccounts?: number;
  pendingInspections?: number;
  pendingRequests?: number;
  pendingRepairs?: number;
  totalDocuments?: number;
  userName?: string;
  userDetail?: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Mirrors the personnel sidebar so oversight sits where personnel work:
  // same modules, but every page is read-only (records + receipts only).
  const groups: { title: string; links: SidebarLink[] }[] = [
    {
      title: "Overview",
      links: [{ label: "Dashboard", href: "/super-admin/dashboard" }],
    },
    {
      title: "Operations",
      links: [
        { label: "Deliveries", href: "/super-admin/deliveries" },
        { label: "Inspections", href: "/super-admin/inspections", badge: pendingInspections },
      ],
    },
    {
      title: "Inventory",
      links: [
        { label: "Stock", href: "/super-admin/inventory" },
        { label: "Assets", href: "/super-admin/assets" },
      ],
    },
    {
      title: "Records",
      links: [
        { label: "Documents", href: "/super-admin/documents", badge: totalDocuments },
        { label: "PAR / ICS", href: "/super-admin/issuances" },
        { label: "Issues", href: "/super-admin/issues" },
        { label: "QR Scanner", href: "/super-admin/scan" },
        { label: "Requests", href: "/super-admin/requests", badge: pendingRequests },
        { label: "Repairs", href: "/super-admin/repairs", badge: pendingRepairs },
        { label: "Logs", href: "/super-admin/logs" },
        { label: "Download Templates", href: "/super-admin/templates" },
      ],
    },
    {
      title: "Administration",
      links: [
        { label: "Users", href: "/super-admin/users", badge: pendingAccounts },
        { label: "Master Data", href: "/super-admin/master-data" },
        { label: "Transactions", href: "/super-admin/transactions" },
        { label: "All Records", href: "/super-admin/records" },
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
        {open ? "Close" : "Menu"}
      </button>

      <aside
        className={styles.sidebar}
        data-open={open}
        aria-label="Super admin navigation"
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
          <div className={styles.userRow}>
            <div className={styles.avatar} aria-hidden="true">
              {(userName.trim().charAt(0) || "S").toUpperCase()}
            </div>
            <div className={styles.userInfo}>
              <span className={styles.userName}>{userName}</span>
              <span className={styles.userRole}>{userDetail}</span>
            </div>
          </div>
          <form action={logout} className={styles.signOutForm}>
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
