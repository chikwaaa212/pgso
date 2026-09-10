"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/(auth)/auth";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/utils";
import styles from "./EmployeeSidebar.module.css";

const groups: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Overview",
    links: [{ label: "Dashboard", href: "/employee/dashboard" }],
  },
  {
    title: "My Work",
    links: [
      { label: "My Assets", href: "/employee/assets" },
      { label: "My Requests", href: "/employee/requests" },
    ],
  },
];

export function EmployeeSidebar({
  userName = "Employee",
  userDetail = "Staff",
}: {
  userName?: string;
  userDetail?: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

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
        aria-label="Employee navigation"
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
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className={styles.user}>
          <div className={styles.userRow}>
            <div className={styles.avatar} aria-hidden="true">
              {(userName.trim().charAt(0) || "E").toUpperCase()}
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
