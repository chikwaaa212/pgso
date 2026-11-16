"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { navPrefetchProps } from "@/lib/nav-prefetch";
import { buildPersonnelNav, formatBadge } from "./personnel-nav";
import styles from "./PersonnelSidebar.module.css";

/**
 * Desktop left rail grouping every section by workflow: Operations,
 * Inventory & Assets, Issuance & Documents, Service Desk, Planning &
 * Insights and Audit. Groups collapse individually so the rail stays
 * scannable as the module count grows.
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
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
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

        {groups.map((group) => {
          const GroupIcon = group.icon;
          const groupActive = group.links.some((link) => isActive(link.href));
          const groupBadge = group.links.reduce(
            (sum, link) => sum + (link.badge ?? 0),
            0,
          );
          const isCollapsed = collapsed[group.title] ?? false;
          const panelId = `personnel-nav-${group.title
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
                {groupBadge > 0 && (
                  <span
                    className={styles.groupBadge}
                    aria-label={`${groupBadge} pending`}
                  >
                    {formatBadge(groupBadge)}
                  </span>
                )}
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
    </aside>
  );
}
