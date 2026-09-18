"use client";

import { useEffect, useRef, useState } from "react";
import type { ComponentType, SVGProps } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Archive,
  ArrowLeftRight,
  Boxes,
  Check,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  Database,
  Download,
  FileText,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Package,
  ReceiptText,
  ScanLine,
  ScrollText,
  Sun,
  TriangleAlert,
  Truck,
  User,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { logout } from "@/app/(auth)/auth";
import { SubmitButton } from "@/components/ui/submit-button";
import { ChangePasswordDialog } from "@/components/account/ChangePasswordDialog";
import { useThemePreference, type ThemePreference } from "@/hooks/use-theme-preference";
import { cn } from "@/lib/utils";
import styles from "./SuperAdminNavbar.module.css";

interface NavLink {
  label: string;
  href: string;
  description: string;
  icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>;
  badge?: number;
}

interface NavGroup {
  title: string;
  links: NavLink[];
}

/** Badges cap at 99+ so large queues can't stretch the navbar. */
function formatBadge(count: number): string {
  return count > 99 ? "99+" : String(count);
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

export function SuperAdminNavbar({
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
  /** Signed-in user's display name (profiles.full_name). */
  userName?: string;
  /** Role / position line (position · office, else role label). */
  userDetail?: string;
}) {
  const pathname = usePathname();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileSection, setMobileSection] = useState<string | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [changePwOpen, setChangePwOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  // Appearance choice (Light / Dark / System) — remembered across visits.
  // Menu-rows only for now: page colors stay as-is until theming lands.
  const { theme, setTheme } = useThemePreference();

  const dashboard: NavLink = {
    label: "Dashboard",
    href: "/super-admin/dashboard",
    description: "Operations at a glance",
    icon: LayoutDashboard,
  };

  // Same modules as the personnel navbar (oversight sits where personnel
  // work), plus an Administration group for super-admin-only pages.
  const groups: NavGroup[] = [
    {
      title: "Operations",
      links: [
        {
          label: "Deliveries",
          href: "/super-admin/deliveries",
          description: "Log and track deliveries",
          icon: Truck,
        },
        {
          label: "Inspections",
          href: "/super-admin/inspections",
          description: "Review and confirm inspections",
          icon: ClipboardCheck,
          badge: pendingInspections,
        },
      ],
    },
    {
      title: "Inventory",
      links: [
        {
          label: "Stock",
          href: "/super-admin/inventory",
          description: "Monitor stock levels",
          icon: Boxes,
        },
        {
          label: "Assets",
          href: "/super-admin/assets",
          description: "Encode and track assets",
          icon: Package,
        },
      ],
    },
    {
      title: "Records",
      links: [
        {
          label: "Documents",
          href: "/super-admin/documents",
          description: "RIS, PAR, ICS, AIR files",
          icon: FileText,
          badge: totalDocuments,
        },
        {
          label: "PAR / ICS",
          href: "/super-admin/issuances",
          description: "Accountability documents",
          icon: ArrowLeftRight,
        },
        {
          label: "Issues",
          href: "/super-admin/issues",
          description: "Report and track issues",
          icon: TriangleAlert,
        },
        {
          label: "QR Scanner",
          href: "/super-admin/scan",
          description: "Scan asset QR codes",
          icon: ScanLine,
        },
        {
          label: "Requests",
          href: "/super-admin/requests",
          description: "Review supply requests",
          icon: ClipboardList,
          badge: pendingRequests,
        },
        {
          label: "Repairs",
          href: "/super-admin/repairs",
          description: "Track repair tickets",
          icon: Wrench,
          badge: pendingRepairs,
        },
        {
          label: "Logs",
          href: "/super-admin/logs",
          description: "Activity audit trail",
          icon: ScrollText,
        },
        {
          label: "Templates",
          href: "/super-admin/templates",
          description: "Download Excel templates",
          icon: Download,
        },
      ],
    },
    {
      title: "Administration",
      links: [
        {
          label: "Users",
          href: "/super-admin/users",
          description: "Approve and manage accounts",
          icon: Users,
          badge: pendingAccounts,
        },
        {
          label: "Master Data",
          href: "/super-admin/master-data",
          description: "Catalogs, units, departments",
          icon: Database,
        },
        {
          label: "Transactions",
          href: "/super-admin/transactions",
          description: "System-wide transactions",
          icon: ReceiptText,
        },
        {
          label: "All Records",
          href: "/super-admin/records",
          description: "Every record in one place",
          icon: Archive,
        },
      ],
    },
  ];

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  const groupActive = (group: NavGroup) =>
    group.links.some((l) => isActive(l.href));

  const groupBadge = (group: NavGroup) =>
    group.links.reduce((sum, l) => sum + (l.badge ?? 0), 0);

  // Close menus on navigation; lock body scroll while the mobile sheet is open.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional menu reset on route change
    setOpenMenu(null);
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
            src="/favicon.png"
            alt="PGSO-PSMS logo"
            width={36}
            height={36}
            className={styles.brandMark}
            priority
          />
          <span className={styles.brandText}>
            <span className={styles.brandName}>PGSO-PSMS</span>
            <span className={styles.brandSub}>Super Admin</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className={styles.nav} aria-label="Super admin navigation">
          <Link
            href={dashboard.href}
            className={styles.topLink}
            data-active={isActive(dashboard.href)}
            aria-current={isActive(dashboard.href) ? "page" : undefined}
          >
            {dashboard.label}
          </Link>
          {groups.map((group) => {
            const active = groupActive(group);
            const badge = groupBadge(group);
            const open = openMenu === group.title;
            return (
              <div
                key={group.title}
                className={styles.menu}
                onMouseEnter={() => {
                  setOpenMenu(group.title);
                  setUserMenuOpen(false);
                }}
                onMouseLeave={() => setOpenMenu((cur) => (cur === group.title ? null : cur))}
              >
                <button
                  type="button"
                  className={styles.topLink}
                  data-active={active}
                  aria-expanded={open}
                  aria-haspopup="true"
                  onClick={() => {
                    setOpenMenu(open ? null : group.title);
                    setUserMenuOpen(false);
                  }}
                >
                  {group.title}
                  {badge > 0 && (
                    <span className={styles.triggerDot} aria-label={`${badge} pending`} />
                  )}
                  <ChevronDown
                    size={14}
                    className={styles.chevron}
                    data-open={open}
                    aria-hidden="true"
                  />
                </button>
                {open && (
                  <div
                    className={styles.panel}
                    data-wide={group.links.length > 4}
                    role="menu"
                    aria-label={`${group.title} submenu`}
                  >
                    {group.links.map((link) => {
                      const Icon = link.icon;
                      const linkActive = isActive(link.href);
                      return (
                        <Link
                          key={link.href}
                          href={link.href}
                          className={styles.item}
                          data-active={linkActive}
                          aria-current={linkActive ? "page" : undefined}
                          onClick={() => setOpenMenu(null)}
                        >
                          <span className={styles.itemIcon} aria-hidden="true">
                            <Icon size={18} />
                          </span>
                          <span className={styles.itemText}>
                            <span className={styles.itemLabel}>
                              {link.label}
                              {(link.badge ?? 0) > 0 && (
                                <span
                                  className={styles.badge}
                                  aria-label={`${link.badge} pending`}
                                >
                                  {formatBadge(link.badge ?? 0)}
                                </span>
                              )}
                            </span>
                            <span className={styles.itemDesc}>
                              {link.description}
                            </span>
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className={styles.right}>
          <div className={styles.userMenu} ref={userMenuRef}>
            <button
              type="button"
              className={styles.avatarBtn}
              data-open={userMenuOpen}
              onClick={() => {
                setUserMenuOpen((v) => !v);
                setOpenMenu(null);
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
        <div className={styles.sheet} role="dialog" aria-label="Super admin menu">
          <nav className={styles.sheetNav} aria-label="Super admin navigation">
            <Link
              href={dashboard.href}
              className={styles.sheetLink}
              data-active={isActive(dashboard.href)}
              aria-current={isActive(dashboard.href) ? "page" : undefined}
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
