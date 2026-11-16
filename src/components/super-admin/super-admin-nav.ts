import type { ComponentType, SVGProps } from "react";
import {
  Archive,
  ArrowLeftRight,
  BarChart3,
  Boxes,
  ClipboardCheck,
  ClipboardList,
  Database,
  Download,
  FileSpreadsheet,
  FileText,
  LayoutDashboard,
  Lightbulb,
  Package,
  ReceiptText,
  ScanLine,
  ScrollText,
  TriangleAlert,
  Truck,
  Users,
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
  links: NavLink[];
}

export interface SuperAdminNavModel {
  dashboard: NavLink;
  /** Every group, shared by the sidebar and the mobile sheet. */
  groups: NavGroup[];
}

interface NavBadges {
  pendingAccounts?: number;
  pendingInspections?: number;
  pendingRequests?: number;
  pendingRepairs?: number;
  totalDocuments?: number;
}

/** Single source of truth for the super-admin navigation. */
export function buildSuperAdminNav({
  pendingAccounts = 0,
  pendingInspections = 0,
  pendingRequests = 0,
  pendingRepairs = 0,
  totalDocuments = 0,
}: NavBadges = {}): SuperAdminNavModel {
  const dashboard: NavLink = {
    label: "Dashboard",
    href: "/super-admin/dashboard",
    description: "Operations at a glance",
    icon: LayoutDashboard,
  };

  // Same modules as the personnel sidebar (oversight sits where personnel
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
      title: "Stocks",
      links: [
        {
          label: "Stock",
          href: "/super-admin/stocks",
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
          label: "PPMP Files",
          href: "/super-admin/ppmp",
          description: "All uploaded PPMP workbooks",
          icon: FileSpreadsheet,
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
          label: "Reports",
          href: "/super-admin/reports",
          description: "Aging, issuance and availability",
          icon: BarChart3,
        },
        {
          label: "Recommendations",
          href: "/super-admin/recommendations",
          description: "Replenishment, disposal and idle advice",
          icon: Lightbulb,
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

  return {
    dashboard,
    groups,
  };
}

/** Badges cap at 99+ so large queues can't stretch the navigation. */
export function formatBadge(count: number): string {
  return count > 99 ? "99+" : String(count);
}
