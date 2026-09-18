"use client";

import { useEffect, useRef, useState } from "react";
import type { ComponentType, SVGProps } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Check,
  ClipboardList,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Package,
  Sun,
  User,
  X,
} from "lucide-react";
import { logout } from "@/app/(auth)/auth";
import { SubmitButton } from "@/components/ui/submit-button";
import { ChangePasswordDialog } from "@/components/account/ChangePasswordDialog";
import { useThemePreference, type ThemePreference } from "@/hooks/use-theme-preference";
import { cn } from "@/lib/utils";
import styles from "./EmployeeNavbar.module.css";

interface NavLink {
  label: string;
  href: string;
  description: string;
  icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>;
}

/** Appearance choices in the account menu (icon always left of the label). */
const THEME_OPTIONS: {
  value: ThemePreference;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>;
}[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

/**
 * Top navbar for the employee portal — same header, brand, account menu,
 * and mobile sheet pattern as the personnel / super-admin navbars.
 * The employee portal only has three pages, so the links render directly
 * instead of grouped dropdowns.
 */
export function EmployeeNavbar({
  userName = "Employee",
  userDetail = "Staff",
}: {
  /** Signed-in user's display name (profiles.full_name). */
  userName?: string;
  /** Role / position line (position · office, else role label). */
  userDetail?: string;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [changePwOpen, setChangePwOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  // Appearance choice (Light / Dark / System) — remembered across visits.
  // Menu-rows only for now: page colors stay as-is until theming lands.
  const { theme, setTheme } = useThemePreference();

  const links: NavLink[] = [
    {
      label: "Dashboard",
      href: "/employee/dashboard",
      description: "Overview at a glance",
      icon: LayoutDashboard,
    },
    {
      label: "My Assets",
      href: "/employee/assets",
      description: "Assigned assets and PAR / ICS documents",
      icon: Package,
    },
    {
      label: "My Requests",
      href: "/employee/requests",
      description: "Submit and track requests",
      icon: ClipboardList,
    },
  ];

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  // Close menus on navigation; lock body scroll while the mobile sheet is open.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional menu reset on route change
    setMobileOpen(false);
    setUserMenuOpen(false);
    setChangePwOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  // Close the account menu on outside click or Escape.
  useEffect(() => {
    if (!userMenuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setUserMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [userMenuOpen]);

  return (
    <header className={styles.header}>
      <div className={styles.bar}>
        <Link href="/employee/dashboard" className={styles.brand}>
          <Image
            src="/favicon.png"
            alt="PGSO-PSMS logo"
            width={36}
            height={36}
            className={styles.brandMark}
            priority
          />
          <span className={styles.brandText}>
            <span className={styles.brandName}>PGSO-PSMS</span>
            <span className={styles.brandSub}>Employee</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className={styles.nav} aria-label="Employee navigation">
          {links.map((link) => {
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={styles.topLink}
                data-active={active}
                aria-current={active ? "page" : undefined}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className={styles.right}>
          <div className={styles.userMenu} ref={userMenuRef}>
            <button
              type="button"
              className={styles.avatarBtn}
              data-open={userMenuOpen}
              onClick={() => setUserMenuOpen((v) => !v)}
              aria-label="Account menu"
              aria-expanded={userMenuOpen}
              aria-haspopup="menu"
            >
              <User size={18} aria-hidden="true" />
            </button>
            {userMenuOpen && (
              <div
                className={cn(styles.panel, styles.userPanel)}
                role="menu"
                aria-label="Account"
              >
                <div className={styles.userMenuHeader}>
                  <div className={styles.avatar} aria-hidden="true">
                    {(userName.trim().charAt(0) || "E").toUpperCase()}
                  </div>
                  <div className={styles.userInfo}>
                    <span className={styles.userName}>{userName}</span>
                    <span className={styles.userRole}>{userDetail}</span>
                  </div>
                </div>
                <div className={styles.userMenuDivider} aria-hidden="true" />
                <p className={styles.menuSectionLabel}>Settings</p>
                <div role="group" aria-label="Appearance">
                  {THEME_OPTIONS.map((opt) => {
                    const OptionIcon = opt.icon;
                    const active = theme === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="menuitemradio"
                        aria-checked={active}
                        data-active={active}
                        className={styles.themeRow}
                        onClick={() => setTheme(opt.value)}
                      >
                        <OptionIcon
                          size={16}
                          aria-hidden="true"
                          className={styles.themeRowIcon}
                        />
                        <span className={styles.themeRowLabel}>{opt.label}</span>
                        {active && (
                          <Check
                            size={16}
                            aria-hidden="true"
                            className={styles.themeRowCheck}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
                <div className={styles.userMenuDivider} aria-hidden="true" />
                <p className={styles.menuSectionLabel}>Account</p>
                <button
                  type="button"
                  role="menuitem"
                  className={styles.themeRow}
                  onClick={() => {
                    setUserMenuOpen(false);
                    setChangePwOpen(true);
                  }}
                >
                  <KeyRound
                    size={16}
                    aria-hidden="true"
                    className={styles.themeRowIcon}
                  />
                  <span className={styles.themeRowLabel}>Change password</span>
                </button>
                <div className={styles.userMenuDivider} aria-hidden="true" />
                <form action={logout} className={styles.userMenuForm}>
                  <SubmitButton
                    variant="ghost"
                    size="sm"
                    pendingLabel="Logging out…"
                    spinnerClassName="size-3.5"
                    className={styles.userMenuItem}
                  >
                    <LogOut size={16} aria-hidden="true" />
                    Log out
                  </SubmitButton>
                </form>
              </div>
            )}
          </div>
          <button
            type="button"
            className={styles.burger}
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile sheet */}
      {mobileOpen && (
        <div className={styles.sheet} role="dialog" aria-label="Employee menu">
          <nav className={styles.sheetNav} aria-label="Employee navigation">
            {links.map((link) => {
              const Icon = link.icon;
              const linkActive = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={styles.sheetLink}
                  data-active={linkActive}
                  aria-current={linkActive ? "page" : undefined}
                >
                  <Icon size={18} aria-hidden="true" />
                  {link.label}
                </Link>
              );
            })}
          </nav>
          <div className={styles.sheetNav} style={{ paddingTop: 0 }}>
            <button
              type="button"
              className={styles.sheetLink}
              onClick={() => {
                setMobileOpen(false);
                setChangePwOpen(true);
              }}
            >
              <KeyRound size={18} aria-hidden="true" />
              Change password
            </button>
          </div>
          <div className={styles.sheetFooter}>
            <div className={styles.user}>
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
                variant="primary"
                size="sm"
                pendingLabel="Logging out…"
                spinnerClassName="size-3.5"
                className={cn(styles.signOut, "rounded-[4px] h-8 px-3.5 text-xs font-semibold")}
              >
                <LogOut size={14} aria-hidden="true" />
                Log out
              </SubmitButton>
            </form>
          </div>
        </div>
      )}
      <ChangePasswordDialog open={changePwOpen} onOpenChange={setChangePwOpen} />
    </header>
  );
}
