import type { ComponentType, SVGProps } from "react";
import {
  ArrowLeftRight,
  BarChart3,
  Boxes,
  CalendarCheck,
  ClipboardCheck,
  ClipboardList,
  Download,
  FileText,
  LayoutDashboard,
  Lightbulb,
  Package,
  ScanLine,
  ScrollText,
  TriangleAlert,
  Truck,
  Wrench,
} from "lucide-react";

export interface NavLink {
  label: string;
  href: string;
  description: string;
  icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>;
  badge?: number;
}

export interface NavGroup {
  title: string;
  /** Short helper line shown under the group heading in the sidebar. */
  hint?: string;
  /** Group glyph, rendered beside the heading. */
  icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>;
  links: NavLink[];
}

export interface PersonnelNavModel {
  dashboard: NavLink;
  /** Every group, shared by the sidebar and the mobile sheet. */
  groups: NavGroup[];
}

interface NavBadges {
  pendingInspections?: number;
  pendingRequests?: number;
  pendingRepairs?: number;
  totalDocuments?: number;
}

/** Single source of truth for the personnel navigation. */
export function buildPersonnelNav({
  pendingInspections = 0,
  pendingRequests = 0,
  pendingRepairs = 0,
  totalDocuments = 0,
}: NavBadges = {}): PersonnelNavModel {
  const dashboard: NavLink = {
    label: "Dashboard",
    href: "/personnel/dashboard",
    description: "Operations at a glance",
    icon: LayoutDashboard,
  };

  const groups: NavGroup[] = [
    {
      title: "Operations",
      hint: "Receiving and verification",
      icon: Truck,
      links: [
        {
          label: "Deliveries",
          href: "/personnel/deliveries",
          description: "Log and track deliveries",
          icon: Truck,
        },
        {
          label: "Inspections",
          href: "/personnel/inspections",
          description: "Review and confirm inspections",
          icon: ClipboardCheck,
          badge: pendingInspections,
        },
      ],
    },
    {
      title: "Inventory & Assets",
      hint: "Stock levels and asset registry",
      icon: Boxes,
      links: [
        {
          label: "Stock",
          href: "/personnel/stocks",
          description: "Monitor stock levels",
          icon: Boxes,
        },
        {
          label: "Assets",
          href: "/personnel/assets",
          description: "Encode and track assets",
          icon: Package,
        },
        {
          label: "QR Scanner",
          href: "/personnel/scan",
          description: "Scan asset QR codes",
          icon: ScanLine,
        },
      ],
    },
    {
      title: "Issuance & Documents",
      hint: "Accountability paperwork",
      icon: FileText,
      links: [
        {
          label: "PAR / ICS",
          href: "/personnel/issuances",
          description: "Accountability documents",
          icon: ArrowLeftRight,
        },
        {
          label: "Documents",
          href: "/personnel/documents",
          description: "RIS, PAR, ICS, AIR files",
          icon: FileText,
          badge: totalDocuments,
        },
        {
          label: "Templates",
          href: "/personnel/templates",
          description: "Download Excel templates",
          icon: Download,
        },
      ],
    },
    {
      title: "Service Desk",
      hint: "Requests, repairs and issues",
      icon: Wrench,
      links: [
        {
          label: "Requests",
          href: "/personnel/requests",
          description: "Review supply requests",
          icon: ClipboardList,
          badge: pendingRequests,
        },
        {
          label: "Repairs",
          href: "/personnel/repairs",
          description: "Track repair tickets",
          icon: Wrench,
          badge: pendingRepairs,
        },
        {
          label: "Issues",
          href: "/personnel/issues",
          description: "Report and track issues",
          icon: TriangleAlert,
        },
      ],
    },
    {
      title: "Planning & Insights",
      hint: "Forecasts and analysis",
      icon: BarChart3,
      links: [
        {
          label: "PPMP",
          href: "/personnel/ppmp",
          description: "Procurement planning",
          icon: CalendarCheck,
        },
        {
          label: "Reports",
          href: "/personnel/reports",
          description: "Aging, issuance and availability",
          icon: BarChart3,
        },
        {
          label: "Recommendations",
          href: "/personnel/recommendations",
          description: "Replenishment, disposal and idle advice",
          icon: Lightbulb,
        },
      ],
    },
    {
      title: "Audit",
      hint: "Traceability and history",
      icon: ScrollText,
      links: [
        {
          label: "Logs",
          href: "/personnel/logs",
          description: "Activity audit trail",
          icon: ScrollText,
        },
      ],
    },
  ];

  return {
    dashboard,
    groups,
  };
}

/** Badges cap at 99+ so large queues can't stretch the navigation. */
export function formatBadge(count: number): string {
  return count > 99 ? "99+" : String(count);
}
