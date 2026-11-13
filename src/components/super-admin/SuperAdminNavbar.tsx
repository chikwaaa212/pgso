"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronDown,
  KeyRound,
  LogOut,
  Menu,
  Pencil,
  User,
  X,
} from "lucide-react";
import { logout } from "@/app/(auth)/auth";
import { broadcastLogout } from "@/components/ClientCacheManager";
import { navPrefetchProps } from "@/lib/nav-prefetch";
import { SubmitButton } from "@/components/ui/submit-button";
import { useToast } from "@/components/ui/toaster";
// Supabase-backed dialog is only needed once the account menu is opened, so
// keep it out of the first-load bundle.
const ChangePasswordDialog = dynamic(
  () =>
    import("@/components/account/ChangePasswordDialog").then(
      (m) => m.ChangePasswordDialog
    ),
  { ssr: false }
);
import { EditNameDialog } from "@/components/account/EditNameDialog";
import { updateMyDisplayName } from "@/app/super-admin/users/actions";
import { cn } from "@/lib/utils";
import { buildSuperAdminNav, formatBadge, type NavGroup } from "./super-admin-nav";
import styles from "./SuperAdminNavbar.module.css";

export function SuperAdminNavbar({
  pendingAccounts = 0,
  pendingInspections = 0,
  pendingRequests = 0,
  pendingRepairs = 0,
  totalDocuments = 0,
  userName = "Administrator",
  userDetail = "Administrator",
}: {
  pendingAccounts?: number;
  pendingInspections?: number;
  pendingRequests?: number;
  pendingRepairs?: number;
  totalDocuments?: number;
  /** Signed-in user's display name (profiles.full_name). */
  userName?: string;
  /** Role / position line (position · office, else role label). */
  userDetail?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileSection, setMobileSection] = useState<string | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [changePwOpen, setChangePwOpen] = useState(false);
  const [editNameOpen, setEditNameOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const { dashboard, groups } = buildSuperAdminNav({
    pendingAccounts,
    pendingInspections,
    pendingRequests,
    pendingRepairs,
    totalDocuments,
  });

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  const groupActive = (group: NavGroup) =>
    group.links.some((l) => isActive(l.href));

  const groupBadge = (group: NavGroup) =>
    group.links.reduce((sum, l) => sum + (l.badge ?? 0), 0);

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
        <Link href="/super-admin/dashboard" className={styles.brand}>
          <Image
            src="/province-seal.png"
            alt="Province of Davao Oriental official seal"
            width={36}
            height={36}
            className={styles.brandMark}
            priority
          />
          <span className={styles.brandText}>
            <span className={styles.brandName}>PGSO-PSMS</span>
            <span className={styles.brandSub}>Administrator</span>
          </span>
        </Link>

        <div className={styles.right}>
          <div className={styles.userMenu} ref={userMenuRef}>
            <button
              type="button"
              className={styles.avatarBtn}
              data-open={userMenuOpen}
              onClick={() => {
                setUserMenuOpen((v) => !v);
              }}
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
                    {(userName.trim().charAt(0) || "S").toUpperCase()}
                  </div>
                  <div className={styles.userInfo}>
                    <span className={styles.userName}>{userName}</span>
                    <span className={styles.userRole}>{userDetail}</span>
                  </div>
                </div>
                <div className={styles.userMenuDivider} aria-hidden="true" />
                <p className={styles.menuSectionLabel}>Account</p>
                <button
                  type="button"
                  role="menuitem"
                  className={styles.themeRow}
                  onClick={() => {
                    setUserMenuOpen(false);
                    setEditNameOpen(true);
                  }}
                >
                  <Pencil
                    size={16}
                    aria-hidden="true"
                    className={styles.themeRowIcon}
                  />
                  <span className={styles.themeRowLabel}>Edit name</span>
                </button>
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
                <form action={logout} onSubmit={() => broadcastLogout()} className={styles.userMenuForm}>
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
        <div className={styles.sheet} role="dialog" aria-label="Super admin menu">
          <nav className={styles.sheetNav} aria-label="Super admin navigation">
            <Link
              href={dashboard.href}
              className={styles.sheetLink}
              data-active={isActive(dashboard.href)}
              aria-current={isActive(dashboard.href) ? "page" : undefined}
              {...navPrefetchProps(dashboard.href)}
            >
              <dashboard.icon size={18} aria-hidden="true" />
              {dashboard.label}
            </Link>
            {groups.map((group) => {
              const expanded = mobileSection === group.title;
              const badge = groupBadge(group);
              return (
                <div key={group.title} className={styles.sheetGroup}>
                  <button
                    type="button"
                    className={styles.sheetTrigger}
                    data-active={groupActive(group)}
                    aria-expanded={expanded}
                    onClick={() =>
                      setMobileSection(expanded ? null : group.title)
                    }
                  >
                    {group.title}
                    {badge > 0 && (
                      <span className={styles.badge} aria-label={`${badge} pending`}>
                        {formatBadge(badge)}
                      </span>
                    )}
                    <ChevronDown
                      size={16}
                      className={styles.chevron}
                      data-open={expanded}
                      aria-hidden="true"
                    />
                  </button>
                  {expanded && (
                    <div className={styles.sheetLinks}>
                      {group.links.map((link) => {
                        const Icon = link.icon;
                        const linkActive = isActive(link.href);
                        return (
                          <Link
                            key={link.href}
                            href={link.href}
                            className={styles.sheetLink}
                            data-active={linkActive}
                            aria-current={linkActive ? "page" : undefined}
                            {...navPrefetchProps(link.href)}
                          >
                            <Icon size={18} aria-hidden="true" />
                            {link.label}
                            {(link.badge ?? 0) > 0 && (
                              <span
                                className={styles.badge}
                                aria-label={`${link.badge} pending`}
                              >
                                {formatBadge(link.badge ?? 0)}
                              </span>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
          <div className={styles.sheetNav} style={{ paddingTop: 0 }}>
            <button
              type="button"
              className={styles.sheetLink}
              onClick={() => {
                setMobileOpen(false);
                setEditNameOpen(true);
              }}
            >
              <Pencil size={18} aria-hidden="true" />
              Edit name
            </button>
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
                {(userName.trim().charAt(0) || "S").toUpperCase()}
              </div>
              <div className={styles.userInfo}>
                <span className={styles.userName}>{userName}</span>
                <span className={styles.userRole}>{userDetail}</span>
              </div>
            </div>
            <form action={logout} onSubmit={() => broadcastLogout()} className={styles.signOutForm}>
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
      {changePwOpen && (
        <ChangePasswordDialog open={changePwOpen} onOpenChange={setChangePwOpen} />
      )}
      <EditNameDialog
        open={editNameOpen}
        onOpenChange={setEditNameOpen}
        initialName={userName}
        onSave={updateMyDisplayName}
        onSaved={(name) => {
          toast({
            title: "Name updated",
            description: `Now showing as ${name}.`,
            variant: "success",
          });
          router.refresh();
        }}
      />
    </header>
  );
}
