/**
 * Downloadable template catalog — single source of truth for the
 * "Download Templates" gallery pages (personnel + super admin).
 *
 * - `href` points at either a generated API download or a static file
 *   under `public/` (Next serves those at the same path).
 * - `roles` controls which gallery shows the card. The account-catalog
 *   template is super-admin only because its import lives in Master Data.
 */

export type TemplateRole = "personnel" | "super_admin";

export type TemplateKind = "import" | "form" | "reference";

export interface TemplateEntry {
  id: string;
  title: string;
  description: string;
  href: string;
  fileName: string;
  format: "XLSX" | "XLS";
  kind: TemplateKind;
  roles: TemplateRole[];
  /** Short usage hint shown on the card (e.g. where the file is uploaded). */
  usage: string;
}

export const KIND_LABELS: Record<TemplateKind, string> = {
  import: "Import template",
  form: "Blank form",
  reference: "Reference",
};

export const TEMPLATES: TemplateEntry[] = [
  {
    id: "asset-import",
    title: "Asset Import Template",
    description:
      "34 exact headers (PPE CONSOLIDATED sheet) for bulk-loading assets. Keep headers unchanged — rows with unknown ACCOUNT CODEs are skipped.",
    href: "/api/personnel/assets/template-xlsx",
    fileName: "ASSET-TEMPLATE.xlsx",
    format: "XLSX",
    kind: "import",
    roles: ["personnel", "super_admin"],
    usage: "Upload via Assets → Import Excel",
  },
  {
    id: "catalog-import",
    title: "Account Catalog Import Template",
    description:
      "4 exact headers (ACCOUNT CODE, ASSET TYPE, ACCOUNT TITLE, ACCOUNT NAME) matching Sheet1 of the client's Sample Header file. Existing codes are updated.",
    href: "/api/super-admin/master-data/catalog-template-xlsx",
    fileName: "ACCOUNT-CATALOG-TEMPLATE.xlsx",
    format: "XLSX",
    kind: "import",
    roles: ["super_admin"],
    usage: "Upload via Master Data → Import Excel",
  },
  {
    id: "air-blank",
    title: "Blank AIR Form (Appendix 62)",
    description:
      "Empty Acceptance and Inspection Report worksheet — print or fill in manually for deliveries inspected outside the system.",
    href: "/templates/AIR-TEMPLATE.xlsx",
    fileName: "AIR-TEMPLATE.xlsx",
    format: "XLSX",
    kind: "form",
    roles: ["personnel", "super_admin"],
    usage: "Manual inspections",
  },
  {
    id: "par-form",
    title: "PAR Form (Appendix 71)",
    description:
      "Official Property Acknowledgment Receipt layout the system mirrors when generating PAR documents.",
    href: "/PAR FORM.xls",
    fileName: "PAR FORM.xls",
    format: "XLS",
    kind: "form",
    roles: ["personnel", "super_admin"],
    usage: "Reference for PAR issuance",
  },
  {
    id: "ics-form",
    title: "ICS Form (Appendix 59)",
    description:
      "Official Inventory Custodian Slip layout the system mirrors when generating ICS documents.",
    href: "/ICS FORM.xls",
    fileName: "ICS FORM.xls",
    format: "XLS",
    kind: "form",
    roles: ["personnel", "super_admin"],
    usage: "Reference for ICS issuance",
  },
  {
    id: "sample-header",
    title: "Sample Header + Sample Data",
    description:
      "The client's original consolidated workbook — Sheet1 holds the account catalog, PPE CONSOLIDATED holds sample asset rows.",
    href: "/templates/Sample Header and sample Data - updated.xlsx",
    fileName: "Sample Header and sample Data - updated.xlsx",
    format: "XLSX",
    kind: "reference",
    roles: ["personnel", "super_admin"],
    usage: "Header + data reference",
  },
];

export function templatesFor(role: TemplateRole): TemplateEntry[] {
  return TEMPLATES.filter((t) => t.roles.includes(role));
}
