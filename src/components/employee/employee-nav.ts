import type { ComponentType, SVGProps } from "react";
import {
  ClipboardList,
  LayoutDashboard,
  Package,
  Wrench,
} from "lucide-react";

export interface EmployeeNavLink {
  label: string;
  href: string;
  description: string;
  icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>;
}

export interface EmployeeNavGroup {
  title: string;
  /** Short helper line shown on the group header tooltip. */
  hint?: string;
  /** Group glyph, rendered beside the heading. */
  icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>;
  links: EmployeeNavLink[];
}

export interface EmployeeNavModel {
  dashboard: EmployeeNavLink;
  /** Every group, shared by the desktop rail and the mobile sheet. */
  groups: EmployeeNavGroup[];
}

/**
 * Single source of truth for the employee navigation. Mirrors the personnel /
 * super-admin structure (dashboard first, then workflow groups) so the left
 * rail behaves and reads the same across all three portals.
 */
export function buildEmployeeNav(): EmployeeNavModel {
  const dashboard: EmployeeNavLink = {
    label: "Dashboard",
    href: "/employee/dashboard",
    description: "Overview at a glance",
    icon: LayoutDashboard,
  };

  const groups: EmployeeNavGroup[] = [
    {
      title: "Inventory & Assets",
      hint: "Assets and accountability documents assigned to you",
      icon: Package,
      links: [
        {
          label: "My Assets",
          href: "/employee/assets",
          description: "Assigned assets and PAR / ICS documents",
          icon: Package,
        },
      ],
    },
    {
      title: "Service Desk",
      hint: "Submit and track your supply requests",
      icon: Wrench,
      links: [
        {
          label: "My Requests",
          href: "/employee/requests",
          description: "Submit and track requests",
          icon: ClipboardList,
        },
      ],
    },
  ];

  return {
    dashboard,
    groups,
  };
}
