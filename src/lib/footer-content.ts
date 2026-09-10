export interface FooterDestination {
  label: string;
  /** App menu path this refers to (rendered as plain text, never linked). */
  href: string;
  hint: string;
}

export interface FooterStep {
  title: string;
  text: string;
}

export type FooterIconName =
  | "LayoutTemplate"
  | "Package"
  | "BarChart3"
  | "BookOpen"
  | "FileCode2"
  | "LifeBuoy"
  | "Newspaper"
  | "Map"
  | "Info"
  | "Briefcase"
  | "ShieldCheck"
  | "ScrollText"
  | "Mail";

export interface FooterInfoContent {
  slug: string;
  kicker: string;
  title: string;
  description: string;
  iconName: FooterIconName;
  steps: FooterStep[];
  destinations: FooterDestination[];
  tip: string;
}

export interface FooterColumn {
  title: string;
  links: { label: string; slug: string; badge?: boolean }[];
}

export const FOOTER_COLUMNS: FooterColumn[] = [
  {
    title: "Products",
    links: [
      { label: "Property Tracking", slug: "property-tracking" },
      { label: "Supply Management", slug: "supply-management" },
      { label: "Analytics & Reports", slug: "analytics-reports" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Documentation", slug: "documentation" },
      { label: "API Reference", slug: "api-reference" },
      { label: "Support", slug: "support" },
      { label: "Blog", slug: "blog" },
      { label: "Roadmap", slug: "roadmap" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", slug: "about" },
      { label: "Careers", slug: "careers", badge: true },
      { label: "Privacy Policy", slug: "privacy-policy" },
      { label: "Terms of Service", slug: "terms-of-service" },
      { label: "Contact Us", slug: "contact-us" },
    ],
  },
];

export const FOOTER_INFO: Record<string, FooterInfoContent> = {
  "property-tracking": {
    slug: "property-tracking",
    kicker: "Products",
    title: "Property Tracking",
    description:
      "Register every accountable asset once, tag it with a QR code, then follow it from assignment to transfer, repair, or disposal — all inside PGSO.",
    iconName: "LayoutTemplate",
    steps: [
      {
        title: "1. Register the asset",
        text: "Sign in as Personnel, go to Assets → New Asset, then encode name, category, serial, office, custodian, and acquisition details.",
      },
      {
        title: "2. Tag it with QR",
        text: "Open the asset detail page to view and print its QR. Stick it on the physical item so anyone can scan it in the field.",
      },
      {
        title: "3. Scan to verify",
        text: "Use Scan (Personnel) to scan the QR and instantly pull up status, custodian, location, and history — no manual searching.",
      },
      {
        title: "4. Move it with paper trail",
        text: "Transfers, new assignments, and repairs go through Requests → Issuances so every movement is logged with PAR / ICS documents.",
      },
      {
        title: "5. Monitor accountability",
        text: "Employees check My Assets for items under their name. Personnel watch the Dashboard for assignments, repairs, and audit logs.",
      },
    ],
    destinations: [
      { label: "Personnel → Assets", href: "/personnel/assets", hint: "Register & manage assets" },
      { label: "Personnel → Scan", href: "/personnel/scan", hint: "Scan QR in the field" },
      { label: "Employee → My Assets", href: "/employee/assets", hint: "View your assigned items" },
      { label: "Personnel → Dashboard", href: "/personnel/dashboard", hint: "Operational overview" },
    ],
    tip: "Tip: scan an asset before approving any transfer or repair request so you verify the exact item, custodian, and condition first.",
  },
  "supply-management": {
    slug: "supply-management",
    kicker: "Products",
    title: "Supply Management",
    description:
      "From delivery to inspection to issuance — PGSO automates procurement, stock monitoring, and distribution so supplies never go missing.",
    iconName: "Package",
    steps: [
      {
        title: "1. Log the delivery",
        text: "Personnel opens Deliveries → Log Delivery and encodes supplier, PO number, items, quantities, and delivery date.",
      },
      {
        title: "2. Inspect and accept",
        text: "Go to Inspections, open the delivery, then record inspection results. Accepted items generate an IAR (Inspection & Acceptance Report).",
      },
      {
        title: "3. Stock goes to Inventory",
        text: "Accepted quantities automatically reflect in Inventory. Watch low-stock and out-of-stock badges to trigger replenishment.",
      },
      {
        title: "4. Issue to requesters",
        text: "Approve employee requests in Requests, then create an Issuance (RIS / PAR / ICS). Stock deducts automatically with full audit trail.",
      },
      {
        title: "5. Reconcile and audit",
        text: "Use Logs and Documents to trace every delivery → inspection → issuance chain for COA-style accountability.",
      },
    ],
    destinations: [
      { label: "Personnel → Deliveries", href: "/personnel/deliveries", hint: "Log incoming supplies" },
      { label: "Personnel → Inspections", href: "/personnel/inspections", hint: "Inspect & generate IAR" },
      { label: "Personnel → Inventory", href: "/personnel/inventory", hint: "Monitor stock levels" },
      { label: "Personnel → Issuances", href: "/personnel/issuances", hint: "Issue supplies" },
    ],
    tip: "Tip: never issue supplies without an approved request and a completed inspection — that keeps inventory balances and IARs consistent.",
  },
  "analytics-reports": {
    slug: "analytics-reports",
    kicker: "Products",
    title: "Analytics & Reports",
    description:
      "Turn raw transactions into decisions. Dashboards surface what needs attention; Documents produce print-ready, audit-ready reports.",
    iconName: "BarChart3",
    steps: [
      {
        title: "1. Start at the Dashboard",
        text: "Personnel and Super Admin dashboards show monthly overview, recent deliveries, issuances, repairs, requests, and low-stock alerts.",
      },
      {
        title: "2. Drill into the numbers",
        text: "Click any card or chart segment to jump to its source list — e.g. low-stock → Inventory, pending requests → Requests.",
      },
      {
        title: "3. Generate documents",
        text: "Open Documents to generate IARs, receipts, PARs, ICS, stock cards, and delivery records. Export or print directly for filing.",
      },
      {
        title: "4. Audit with Logs",
        text: "Every create, approve, issue, and edit is recorded in Logs with user, timestamp, and before/after context for accountability.",
      },
      {
        title: "5. Report on schedule",
        text: "Use Templates to standardize imports and forms, then pull monthly or quarterly summaries for management review.",
      },
    ],
    destinations: [
      { label: "Personnel → Dashboard", href: "/personnel/dashboard", hint: "Charts & KPIs" },
      { label: "Personnel → Documents", href: "/personnel/documents", hint: "IAR, PAR, ICS, receipts" },
      { label: "Personnel → Logs", href: "/personnel/logs", hint: "Full audit trail" },
      { label: "Super Admin → Dashboard", href: "/super-admin/dashboard", hint: "Org-wide monitoring" },
    ],
    tip: "Tip: before month-end reporting, reconcile Inventory against pending Inspections and Issuances so your reports match physical counts.",
  },
  documentation: {
    slug: "documentation",
    kicker: "Resources",
    title: "Documentation",
    description:
      "The practical manual for PGSO — what each role can do, the exact clicks for every workflow, and how the modules connect.",
    iconName: "BookOpen",
    steps: [
      {
        title: "1. Know your role",
        text: "Employee: file requests and view assigned assets. Personnel: manage the full supply chain. Super Admin: manage users, master data, and org-wide records.",
      },
      {
        title: "2. Follow the golden path",
        text: "Request (Employee) → Review & Approve (Personnel) → Issue (Issuances) → Inspect deliveries (Inspections/IAR) → Document & File (Documents).",
      },
      {
        title: "3. Use QR everywhere",
        text: "Every asset and many requests carry a QR. Scan from Personnel → Scan or Super Admin → Scan instead of typing IDs.",
      },
      {
        title: "4. Import correctly",
        text: "Use Personnel → Templates to download the official CSV format for assets and catalogs before bulk import — it prevents validation errors.",
      },
      {
        title: "5. Recover fast",
        text: "Forgot your flow? Check the landing FAQ, open Logs to see what changed, or file an entry in Issues for your admin to triage.",
      },
    ],
    destinations: [
      { label: "Sign up / Login", href: "/login", hint: "Create account & get approved" },
      { label: "Personnel → Templates", href: "/personnel/templates", hint: "Official import formats" },
      { label: "Personnel → Requests", href: "/personnel/requests", hint: "Review workflow queue" },
      { label: "Employee → Dashboard", href: "/employee/dashboard", hint: "Employee starting point" },
    ],
    tip: "Tip: new users should start at Templates → download samples, then practice with one delivery → inspection → issuance cycle.",
  },
  "api-reference": {
    slug: "api-reference",
    kicker: "Resources",
    title: "API Reference",
    description:
      "PGSO is primarily a web app, but its modules behave like clean APIs: predictable routes, role guards, and auditable actions. Use this as your route map.",
    iconName: "FileCode2",
    steps: [
      {
        title: "1. Auth & roles",
        text: "/login and /signup handle email + Google sign-in. Accounts need admin approval before access. Middleware routes you to /employee, /personnel, or /super-admin.",
      },
      {
        title: "2. Core resources",
        text: "/personnel/assets, /personnel/inventory, /personnel/deliveries, /personnel/inspections, /personnel/issuances, /personnel/requests, /personnel/repairs map 1:1 to data entities.",
      },
      {
        title: "3. Detail & scan routes",
        text: "Append /[id] for detail (e.g. /personnel/assets/[id]). Use /personnel/scan and /super-admin/scan for QR-driven lookups.",
      },
      {
        title: "4. Admin & audit",
        text: "Super Admin adds /super-admin/users, /super-admin/master-data, /super-admin/transactions, /super-admin/logs, /super-admin/records for governance.",
      },
      {
        title: "5. Conventions",
        text: "Server actions validate input, enforce role checks, and write to Logs. List pages support search + filters; detail pages expose print/export.",
      },
    ],
    destinations: [
      { label: "Personnel → Assets", href: "/personnel/assets", hint: "Canonical asset resource" },
      { label: "Personnel → Inventory", href: "/personnel/inventory", hint: "Stock resource" },
      { label: "Super Admin → Master Data", href: "/super-admin/master-data", hint: "Reference tables" },
      { label: "Super Admin → Logs", href: "/super-admin/logs", hint: "Audit stream" },
    ],
    tip: "Tip: developers — inspect the server actions under app/(personnel|super-admin) for input shapes before building integrations or imports.",
  },
  support: {
    slug: "support",
    kicker: "Resources",
    title: "Support",
    description:
      "Stuck? Follow this triage order — most PGSO issues are role, approval, or data-entry problems you can resolve in under 5 minutes.",
    iconName: "LifeBuoy",
    steps: [
      {
        title: "1. Check access first",
        text: "Can't sign in? If you see 'pending approval' or 'inactive', contact your admin — new signups require approval before login works.",
      },
      {
        title: "2. Reproduce with steps",
        text: "Note the page, the button you clicked, and the exact error. Open Logs to see if your action actually saved.",
      },
      {
        title: "3. File it in Issues",
        text: "Personnel → Issues (or Super Admin → Issues) is the official support queue. Include screenshots, asset ID / request ID, and expected vs actual behavior.",
      },
      {
        title: "4. Unblock common cases",
        text: "QR won't scan? Improve lighting and use Scan page directly. Import fails? Re-download the Template — columns must match exactly. Stock mismatch? Check pending Inspections.",
      },
      {
        title: "5. Escalate with context",
        text: "If unresolved in 24h, use Contact Us with your department, role, and issue link so admins can prioritize operational blockers.",
      },
    ],
    destinations: [
      { label: "Personnel → Issues", href: "/personnel/issues", hint: "File & track tickets" },
      { label: "Personnel → Logs", href: "/personnel/logs", hint: "See what changed" },
      { label: "Login help", href: "/login", hint: "Reset & retry access" },
      { label: "Super Admin → Issues", href: "/super-admin/issues", hint: "Admin triage queue" },
    ],
    tip: "Tip: always include the asset tag, request number, or delivery PO when asking for help — support can find your record instantly.",
  },
  blog: {
    slug: "blog",
    kicker: "Resources",
    title: "Blog",
    description:
      "Short, practical posts from the PGSO team — release notes, workflow guides, and accountability best practices for government offices.",
    iconName: "Newspaper",
    steps: [
      {
        title: "1. What we publish",
        text: "New feature walkthroughs (e.g. QR scanning, IAR printing), monthly ops recaps, and how-tos like 'cut month-end reporting from days to hours'.",
      },
      {
        title: "2. How to use it",
        text: "Each post ends with 'Where to click in PGSO' — exact menu paths so you can apply what you read immediately without hunting.",
      },
      {
        title: "3. Start with these",
        text: "Read: 1) Property Tracking in 3 steps, 2) Delivery → Inspection → Issuance without errors, 3) Audit-ready documents every time.",
      },
      {
        title: "4. Stay current",
        text: "Major changes are also summarized in-app on Dashboards (new cards, badges) and in Templates when import formats change.",
      },
      {
        title: "5. Suggest a topic",
        text: "Want a guide for your office's edge case? Send it via Contact Us — the most-requested topics become the next posts.",
      },
    ],
    destinations: [
      { label: "How It Works (landing)", href: "/", hint: "3-step workflow refresher" },
      { label: "Personnel → Dashboard", href: "/personnel/dashboard", hint: "See features in action" },
      { label: "Personnel → Documents", href: "/personnel/documents", hint: "Reports we blog about" },
    ],
    tip: "Tip: pair each blog guide with a real transaction — e.g. follow the IAR post while inspecting an actual delivery.",
  },
  roadmap: {
    slug: "roadmap",
    kicker: "Resources",
    title: "Roadmap",
    description:
      "Where PGSO is headed — shipped foundations, what's in progress, and what's next. Priorities are driven by actual personnel feedback.",
    iconName: "Map",
    steps: [
      {
        title: "1. Shipped foundations",
        text: "Role-based dashboards, asset registry with QR, deliveries → inspections → IAR, issuances (PAR/ICS), inventory with low-stock, repairs, requests, logs, and documents.",
      },
      {
        title: "2. Now hardening",
        text: "Faster QR scanning on low-end devices, cleaner print layouts for IAR/receipts, bulk import validation, and more consistent audit logs.",
      },
      {
        title: "3. Next up",
        text: "Mobile-first field mode, notifications for approvals and low stock, advanced analytics (turnover, aging, custodian accountability), and offline-tolerant scanning.",
      },
      {
        title: "4. How we prioritize",
        text: "Operational blockers first (can't issue, can't inspect), then audit/compliance gaps, then quality-of-life. Issues with many offices affected win.",
      },
      {
        title: "5. Influence it",
        text: "File well-described Issues with impact ('blocks 20 issuances/week') or send them via Contact Us. Include your role and frequency.",
      },
    ],
    destinations: [
      { label: "Personnel → Issues", href: "/personnel/issues", hint: "Vote via real tickets" },
      { label: "Personnel → Dashboard", href: "/personnel/dashboard", hint: "See current capabilities" },
      { label: "Employee → Requests", href: "/employee/requests", hint: "Most-evolving flow" },
    ],
    tip: "Tip: if a missing feature blocks month-end closing, mark it urgent in Issues — those get triaged first.",
  },
  about: {
    slug: "about",
    kicker: "Company",
    title: "About PGSO",
    description:
      "PGSO — Provincial General Services Office system — is an integrated web platform for property tracking, supply management, and business analytics.",
    iconName: "Info",
    steps: [
      {
        title: "1. What it solves",
        text: "Replaces spreadsheets and paper logs with one accountable trail: every asset, delivery, inspection, issuance, repair, and request is linked and auditable.",
      },
      {
        title: "2. Who uses it",
        text: "Employees request and receive. Personnel run day-to-day operations. Super Admins govern users, master data, transactions, and org-wide records.",
      },
      {
        title: "3. How it works",
        text: "Track Assets → Manage Supply → Monitor & Report. QR codes tie physical items to digital records; IAR/PAR/ICS keep documents compliant.",
      },
      {
        title: "4. How to start",
        text: "Sign up, wait for admin approval, then sign in. You'll land on your role's dashboard with only the actions you're allowed to do.",
      },
      {
        title: "5. Why teams stay",
        text: "Real-time visibility across departments, fewer lost items, faster audits, and reports that match physical inventory.",
      },
    ],
    destinations: [
      { label: "Get started — Login", href: "/login", hint: "Sign in to your role" },
      { label: "Create account", href: "/signup", hint: "Request access" },
      { label: "Personnel → Dashboard", href: "/personnel/dashboard", hint: "See it live" },
    ],
    tip: "Tip: new to PGSO? Open Documentation first, then do one full loop: request → approve → issue → document.",
  },
  careers: {
    slug: "careers",
    kicker: "Company",
    title: "Careers",
    description:
      "We're hiring operators and builders who care about public-service accountability. Help run — and improve — the system offices depend on daily.",
    iconName: "Briefcase",
    steps: [
      {
        title: "1. Open roles",
        text: "PGSO Personnel (operations), Super Admin / Records Officer (governance), and Support & Training (onboarding offices). Technical contributors welcome.",
      },
      {
        title: "2. What you'll do",
        text: "Run real transactions (deliveries, inspections, issuances), keep master data clean, triage Issues, and turn field pain into better workflows.",
      },
      {
        title: "3. Who thrives here",
        text: "Detail-obsessed, process-minded, comfortable with QR/scanners/printers, and calm during month-end closing and audits.",
      },
      {
        title: "4. How to apply",
        text: "Use Contact Us with subject 'Application — [Role]', including your background, office experience, and availability. Attach or link your CV.",
      },
      {
        title: "5. What happens next",
        text: "We review within 1–2 weeks, invite shortlisted candidates to a practical walkthrough (register → inspect → issue), then discuss onboarding.",
      },
    ],
    destinations: [
      { label: "Apply via Contact", href: "/login", hint: "Sign in, then reach out" },
      { label: "See the work — Personnel", href: "/personnel/dashboard", hint: "Day-to-day surface" },
      { label: "See governance — Admin", href: "/super-admin/dashboard", hint: "Oversight surface" },
    ],
    tip: "Tip: the fastest way to stand out is to complete the Documentation walkthrough and mention one improvement you'd make.",
  },
  "privacy-policy": {
    slug: "privacy-policy",
    kicker: "Company",
    title: "Privacy Policy",
    description:
      "PGSO handles government operational data. This summary explains what we collect, who can see it, and how it's protected.",
    iconName: "ShieldCheck",
    steps: [
      {
        title: "1. Data we collect",
        text: "Account identity (name, email, role, department), operational records (assets, requests, deliveries, inspections, issuances), and audit metadata (who did what, when).",
      },
      {
        title: "2. How it's used",
        text: "Strictly for property accountability, supply operations, reporting, and audit. No advertising, no sale of data, no unrelated profiling.",
      },
      {
        title: "3. Who can access",
        text: "Role-based access: employees see only their requests and assigned assets; personnel see operational modules; super admins see org-wide records. Every access that mutates data is logged.",
      },
      {
        title: "4. How it's protected",
        text: "Encrypted in transit and at rest, approval-gated accounts, session controls, and regular reviews of users and master data. Report suspected misuse via Issues immediately.",
      },
      {
        title: "5. Retention & rights",
        text: "Operational and audit records are retained per government policy. Request correction of inaccurate personal data or deactivation via your administrator.",
      },
    ],
    destinations: [
      { label: "Super Admin → Users", href: "/super-admin/users", hint: "Access governance" },
      { label: "Personnel → Logs", href: "/personnel/logs", hint: "Transparency trail" },
      { label: "Super Admin → Master Data", href: "/super-admin/master-data", hint: "Canonical references" },
    ],
    tip: "Tip: admins should review Users and Logs quarterly — deactivate leavers promptly and verify no orphan custodianships remain.",
  },
  "terms-of-service": {
    slug: "terms-of-service",
    kicker: "Company",
    title: "Terms of Service",
    description:
      "The rules for using PGSO fairly and accountably — accounts, acceptable use, data accuracy, and operational responsibilities.",
    iconName: "ScrollText",
    steps: [
      {
        title: "1. Accounts & approval",
        text: "You must provide accurate identity info. Access requires admin approval and may be suspended for misuse, sharing credentials, or inactivity.",
      },
      {
        title: "2. Acceptable use",
        text: "Use PGSO only for legitimate office duties. Don't falsify records, bypass approvals, tamper with QR tags, or access modules outside your role.",
      },
      {
        title: "3. Asset accountability",
        text: "Custodians are responsible for items under their name (PAR/ICS). Report loss, damage, or transfer needs via Requests and Repairs promptly.",
      },
      {
        title: "4. Data accuracy",
        text: "Encode truthfully: correct quantities, serials, conditions, and dates. Corrections must go through proper edits — not duplicate records — so Logs stay clean.",
      },
      {
        title: "5. Availability & changes",
        text: "We aim for continuous availability but maintenance windows may occur. Features evolve per the Roadmap; material changes are announced via Blog/Dashboard.",
      },
    ],
    destinations: [
      { label: "Create account", href: "/signup", hint: "Agree on signup" },
      { label: "Employee → Requests", href: "/employee/requests", hint: "Proper request channel" },
      { label: "Personnel → Repairs", href: "/personnel/repairs", hint: "Proper damage channel" },
    ],
    tip: "Tip: when in doubt, file a Request or Issue instead of working around the system — workarounds break the audit chain.",
  },
  "contact-us": {
    slug: "contact-us",
    kicker: "Company",
    title: "Contact Us",
    description:
      "Reach the PGSO team for access help, operational blockers, corrections, or partnership. Include context so we can resolve in one pass.",
    iconName: "Mail",
    steps: [
      {
        title: "1. Pick the right channel",
        text: "Access problems → your admin first. Transaction blockers → file in Issues with IDs. General questions, applications, feedback → message us directly.",
      },
      {
        title: "2. Include the essentials",
        text: "Full name, department, role (Employee / Personnel / Super Admin), page URL, and asset / request / PO number if relevant.",
      },
      {
        title: "3. Describe expected vs actual",
        text: "Example: 'Expected to approve request REQ-1042 in Personnel → Requests, but Approve stays disabled with error X. Screenshot attached.'",
      },
      {
        title: "4. Response times",
        text: "Operational blockers: same business day. General inquiries and applications: 1–2 business days. Month-end/audit periods may be slower.",
      },
      {
        title: "5. Prefer self-serve?",
        text: "Many answers are already in Documentation, Support triage, and the landing FAQ — check those first for instant resolution.",
      },
    ],
    destinations: [
      { label: "Login to reach your admin", href: "/login", hint: "Fastest for access" },
      { label: "Personnel → Issues", href: "/personnel/issues", hint: "File a trackable ticket" },
      { label: "Employee → Requests", href: "/employee/requests", hint: "Check your submissions" },
    ],
    tip: "Tip: support@pgso.dev is monitored on business days — for urgent audit blockers, also flag via Issues so it enters the queue.",
  },
};

export const FOOTER_SLUGS = Object.keys(FOOTER_INFO);

export function getFooterInfo(slug: string): FooterInfoContent | null {
  return FOOTER_INFO[slug] ?? null;
}
