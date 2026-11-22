"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { navPrefetchProps } from "@/lib/nav-prefetch";
import { buildEmployeeNav } from "./employee-nav";
import styles from "@/components/nav/PortalSidebar.module.css";

/**
 * Desktop left rail for the employee portal. Same geometry, grouped sections
 * and yellow active state as the personnel / super-admin sidebars, so the
 * portal reads as one product. Hidden below 1024px — the mobile sheet in the
 * navbar carries the same links.
 */
export function EmployeeSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const { dashboard, groups } = buildEmployeeNav();

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  const DashboardIcon = dashboard.icon;

  return (
    <aside className={styles.sidebar} aria-label="Employee sidebar">
      <nav className={styles.nav} aria-label="Employee sections">
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

        {groups.map((group) => {
          const GroupIcon = group.icon;
          const groupActive = group.links.some((link) => isActive(link.href));
          const isCollapsed = collapsed[group.title] ?? false;
          const panelId = `employee-nav-${group.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")}`;

          return (
            <div
              key={group.title}
              className={styles.group}
              data-active={groupActive}
            >
              <button
                type="button"
                className={styles.groupHeader}
                aria-expanded={!isCollapsed}
                aria-controls={panelId}
                title={group.hint}
                onClick={() =>
                  setCollapsed((prev) => ({
                    ...prev,
                    [group.title]: !isCollapsed,
                  }))
                }
              >
                <GroupIcon
                  size={14}
                  aria-hidden="true"
                  className={styles.groupIcon}
                />
                <span className={styles.groupTitle}>{group.title}</span>
                <ChevronDown
                  size={14}
                  aria-hidden="true"
                  className={styles.groupChevron}
                  data-open={!isCollapsed}
                />
              </button>

              {!isCollapsed && (
                <div id={panelId} className={styles.groupLinks}>
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
                        <Icon
                          size={18}
                          aria-hidden="true"
                          className={styles.icon}
                        />
                        <span className={styles.label}>{link.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
