"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navPrefetchProps } from "@/lib/nav-prefetch";
import { buildPersonnelNav, formatBadge } from "./personnel-nav";
import styles from "./PersonnelSidebar.module.css";

/**
 * Desktop left rail carrying every section: Dashboard, Operations,
 * Inventory and Records. The top navbar keeps only branding and the account.
 */
export function PersonnelSidebar({
  pendingInspections = 0,
  pendingRequests = 0,
  pendingRepairs = 0,
  totalDocuments = 0,
}: {
  pendingInspections?: number;
  pendingRequests?: number;
  pendingRepairs?: number;
  totalDocuments?: number;
}) {
  const pathname = usePathname();
  const { dashboard, groups } = buildPersonnelNav({
    pendingInspections,
    pendingRequests,
    pendingRepairs,
    totalDocuments,
  });

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  const DashboardIcon = dashboard.icon;

  return (
    <aside className={styles.sidebar} aria-label="Personnel sidebar">
      <nav className={styles.nav} aria-label="Personnel sections">
        <Link
          href={dashboard.href}
          className={styles.link}
          data-active={isActive(dashboard.href)}
          aria-current={isActive(dashboard.href) ? "page" : undefined}
          {...navPrefetchProps(dashboard.href)}
        >
          <DashboardIcon size={18} aria-hidden="true" className={styles.icon} />
          <span className={styles.label}>{dashboard.label}</span>
        </Link>

        {groups.map((group) => (
          <div key={group.title} className={styles.group}>
            <p className={styles.groupTitle}>{group.title}</p>
            {group.links.map((link) => {
              const Icon = link.icon;
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={styles.link}
                  data-active={active}
                  aria-current={active ? "page" : undefined}
                  title={link.description}
                  {...navPrefetchProps(link.href)}
                >
                  <Icon size={18} aria-hidden="true" className={styles.icon} />
                  <span className={styles.label}>{link.label}</span>
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
        ))}
      </nav>
    </aside>
  );
}
