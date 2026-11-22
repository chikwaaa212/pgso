import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Boxes,
  Briefcase,
  Building2,
  CalendarClock,
  ClipboardList,
  Download,
  FileText,
  Mail,
  Package,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { getSessionIdentity } from "@/lib/personnel-scope";
import { cacheKey, withCache } from "@/lib/personnel-cache";
import prisma from "@/lib/prisma";
import { requestTypeLabel } from "@/app/personnel/requests/request-types";
import { getMyAssets, getMyDocs, getMyRequests } from "../actions";
import styles from "./page.module.css";

/** Plain ASCII date so the overview never falls back to a broken glyph. */
function fmtDay(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  });
}

function initials(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "E";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function statusClass(status: string | null): string {
  if (status === "approved") return styles.pillApproved;
  if (status === "completed") return styles.pillCompleted;
  if (status === "rejected") return styles.pillRejected;
  return styles.pillPending;
}

function statusLabel(status: string | null): string {
  if (!status) return "Unknown";
  return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");
}

function assetMeta(a: { property_number: string | null; account_code: string | null; doc_type: string | null; doc_no: string | null }): string {
  const ref = a.property_number ?? a.account_code;
  const doc = [a.doc_type, a.doc_no].filter(Boolean).join(" ");
  return [ref, doc].filter(Boolean).join(" - ") || "No reference on record";
}

interface AccountRow {
  label: string;
  value: string;
  icon: typeof UserRound;
}

export default async function EmployeeDashboard() {
  // Memoized identity shared with the layout (one Auth verification per
  // request instead of two) - claims-first, getUser fallback.
  const { userId, email } = await getSessionIdentity();

  let displayName = "Employee";
  let contextLine: string | null = null;
  let account: AccountRow[] = [];
  let profileCompletion = 0;
  let memberSince: string | null = null;
  let status: string | null = null;

  if (userId) {
    try {
      // Per-employee read-through (60s): greeting rows are never shared
      // across users (u:userId in the key). Busted by profile completion
      // edits (see employee/profile-actions.ts).
      const profile = await withCache(
        cacheKey('employee:dashboard', { u: userId }),
        60,
        async () =>
          prisma.profile.findUnique({
            where: { id: userId },
            select: {
              full_name: true,
              prefix: true,
              first_name: true,
              middle_name: true,
              last_name: true,
              suffix: true,
              employee_no: true,
              position: true,
              office: true,
              department: true,
              status: true,
              created_at: true,
            },
          })
      );

      const composed = [
        profile?.prefix,
        profile?.first_name,
        profile?.middle_name,
        profile?.last_name,
        profile?.suffix,
      ]
        .map((part) => part?.trim())
        .filter(Boolean)
        .join(" ");
      const firstName = profile?.first_name?.trim();
      const fullName = profile?.full_name?.trim();
      displayName = composed || firstName || fullName || "Employee";

      const position = profile?.position?.trim() || null;
      const office = profile?.office?.trim() || null;
      const department = profile?.department?.trim() || null;
      const employeeNo = profile?.employee_no?.trim() || null;
      status = profile?.status ?? null;
      memberSince = profile?.created_at ? profile.created_at.toISOString() : null;

      const context = [position, office ?? department].filter(Boolean) as string[];
      contextLine = context.length > 0 ? context.join(" · ") : null;

      account = [
        { label: "Employee ID", value: employeeNo ?? "Not set", icon: BadgeCheck },
        { label: "Department", value: department ?? "Not set", icon: Building2 },
        { label: "Position", value: position ?? "Not set", icon: Briefcase },
        { label: "Office", value: office ?? "Not set", icon: Building2 },
        { label: "Email", value: email ?? "Not set", icon: Mail },
      ];

      const required = [
        profile?.first_name,
        profile?.last_name,
        employeeNo,
        department,
        position,
        office,
      ];
      profileCompletion = Math.round(
        (required.filter((value) => !!value?.trim()).length / required.length) * 100
      );
    } catch {
      // Fall back to the generic greeting if the profile can't be read.
    }
  }

  const [assets, docs, requests] = userId
    ? await Promise.all([getMyAssets(), getMyDocs(), getMyRequests()])
    : [[], [], []];

  const registryAssets = assets.filter((a) => a.kind === "asset");
  const stockLots = assets.filter((a) => a.kind === "stock");
  const stockQuantity = stockLots.reduce((sum, a) => sum + (a.quantity ?? 0), 0);
  const pendingRequests = requests.filter((r) => r.status === "pending");
  const approvedRequests = requests.filter((r) => r.status === "approved");
  const completedRequests = requests.filter((r) => r.status === "completed");
  const rejectedRequests = requests.filter((r) => r.status === "rejected");

  const kpis = [
    {
      label: "Registry assets",
      value: registryAssets.length,
      hint: "Property under your accountability",
      icon: Package,
      href: "/employee/assets",
    },
    {
      label: "Consumables issued",
      value: stockQuantity,
      hint: `${stockLots.length} stock ${stockLots.length === 1 ? "lot" : "lots"} received`,
      icon: Boxes,
      href: "/employee/assets",
    },
    {
      label: "PAR / ICS documents",
      value: docs.length,
      hint: docs[0] ? `Latest: ${fmtDay(docs[0].doc_date)}` : "Nothing issued yet",
      icon: FileText,
      href: "/employee/assets",
    },
    {
      label: "My requests",
      value: requests.length,
      hint: `${pendingRequests.length} awaiting approval`,
      icon: ClipboardList,
      href: "/employee/requests",
    },
  ];

  const statusSummary = [
    { label: "Pending", value: pendingRequests.length, tone: styles.barPending },
    { label: "Approved", value: approvedRequests.length, tone: styles.barApproved },
    { label: "Completed", value: completedRequests.length, tone: styles.barCompleted },
    { label: "Rejected", value: rejectedRequests.length, tone: styles.barRejected },
  ];
  const statusTotal = statusSummary.reduce((sum, item) => sum + item.value, 0);

  return (
    <section className={styles.page}>
      <nav className={styles.crumb} aria-label="Breadcrumb">
        <span>Employee</span>
        <span aria-hidden="true">/</span>
        <span data-current="true">Dashboard</span>
      </nav>

      {/* ---------------- Hero banner ---------------- */}
      <div className={styles.hero}>
        <Image
          src="/province-seal.png"
          alt=""
          width={280}
          height={280}
          aria-hidden="true"
          className={styles.heroSeal}
        />
        <div className={styles.heroGlow} aria-hidden="true" />

        <div className={styles.heroMain}>
          <div className={styles.heroMeta}>
            <span className={styles.heroBadge}>
              <Sparkles size={12} aria-hidden="true" />
              Employee workspace
            </span>
            <span className={styles.heroStatus} data-status={status ?? "unknown"}>
              <span className={styles.heroStatusDot} aria-hidden="true" />
              {(status ?? "unknown").toUpperCase()}
            </span>
          </div>
          <h1 className={styles.heroTitle}>Welcome back, {displayName}</h1>
          <p className={styles.heroSub}>
            Signed in as {email}
            {contextLine ? ` · ${contextLine}` : ""}
          </p>
          <div className={styles.heroChips}>
            {account
              .filter((row) => row.label === "Employee ID" || row.label === "Department")
              .map((row) => (
                <span key={row.label} className={styles.heroChip}>
                  <row.icon size={13} aria-hidden="true" />
                  <span className={styles.heroChipLabel}>{row.label}</span>
                  <span className={styles.heroChipValue}>{row.value}</span>
                </span>
              ))}
          </div>
        </div>

        <div className={styles.heroActions}>
          <Link href="/employee/assets" className={styles.heroPrimary}>
            <Package size={15} aria-hidden="true" />
            Open my assets
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
          <Link href="/employee/requests" className={styles.heroSecondary}>
            <ClipboardList size={15} aria-hidden="true" />
            File a request
          </Link>
        </div>
      </div>

      {/* ---------------- KPI strip ---------------- */}
      <div className={styles.kpis}>
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Link key={kpi.label} href={kpi.href} className={styles.kpi}>
              <span className={styles.kpiTop}>
                <span className={styles.kpiIcon}>
                  <Icon size={16} aria-hidden="true" />
                </span>
                <ArrowUpRight size={14} aria-hidden="true" className={styles.kpiArrow} />
              </span>
              <span className={styles.kpiValue}>{kpi.value}</span>
              <span className={styles.kpiLabel}>{kpi.label}</span>
              <span className={styles.kpiHint}>{kpi.hint}</span>
            </Link>
          );
        })}
      </div>

      <div className={styles.columns}>
        <div className={styles.mainCol}>
          {/* -------- Assets -------- */}
          <article className={styles.panel}>
            <header className={styles.panelHead}>
              <div>
                <h2 className={styles.panelTitle}>My assets</h2>
                <p className={styles.panelSub}>
                  Property and consumables currently under your name
                </p>
              </div>
              <Link href="/employee/assets" className={styles.panelLink}>
                View all
                <ArrowRight size={13} aria-hidden="true" />
              </Link>
            </header>

            {assets.length === 0 ? (
              <div className={styles.empty}>
                <Package size={20} aria-hidden="true" />
                <p>No assets assigned yet.</p>
                <span>Issued property appears here once personnel records it.</span>
              </div>
            ) : (
              <ul className={styles.list}>
                {assets.slice(0, 5).map((asset) => (
                  <li key={asset.id} className={styles.row}>
                    <span className={styles.rowIcon} data-kind={asset.kind}>
                      {asset.kind === "asset" ? (
                        <Package size={15} aria-hidden="true" />
                      ) : (
                        <Boxes size={15} aria-hidden="true" />
                      )}
                    </span>
                    <span className={styles.rowBody}>
                      <span className={styles.rowTitle}>
                        {asset.article ?? asset.description ?? "Issued item"}
                        {asset.kind === "stock" && asset.quantity
                          ? ` · ${asset.quantity} ${asset.unit ?? "unit"}`
                          : ""}
                      </span>
                      <span className={styles.rowMeta}>{assetMeta(asset)}</span>
                    </span>
                    <span className={styles.rowTag} data-kind={asset.kind}>
                      {asset.kind === "asset" ? "Property" : "Consumable"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </article>

          {/* -------- Requests -------- */}
          <article className={styles.panel}>
            <header className={styles.panelHead}>
              <div>
                <h2 className={styles.panelTitle}>My requests</h2>
                <p className={styles.panelSub}>Latest activity across your requests</p>
              </div>
              <Link href="/employee/requests" className={styles.panelLink}>
                View all
                <ArrowRight size={13} aria-hidden="true" />
              </Link>
            </header>

            <div className={styles.statusRow}>
              <div className={styles.statusBar} aria-hidden="true">
                {statusTotal === 0 ? (
                  <span className={styles.statusBarEmpty} />
                ) : (
                  statusSummary.map((item) =>
                    item.value > 0 ? (
                      <span
                        key={item.label}
                        className={`${styles.statusSegment} ${item.tone}`}
                        style={{ flexGrow: item.value }}
                      />
                    ) : null
                  )
                )}
              </div>
              <div className={styles.statusLegend}>
                {statusSummary.map((item) => (
                  <span key={item.label} className={styles.statusLegendItem}>
                    <span className={`${styles.statusDot} ${item.tone}`} aria-hidden="true" />
                    {item.label}
                    <strong>{item.value}</strong>
                  </span>
                ))}
              </div>
            </div>

            {requests.length === 0 ? (
              <div className={styles.empty}>
                <ClipboardList size={20} aria-hidden="true" />
                <p>No requests yet.</p>
                <span>File a request and track its status here.</span>
              </div>
            ) : (
              <ul className={styles.list}>
                {requests.slice(0, 4).map((request) => (
                  <li key={request.id} className={styles.row}>
                    <span className={styles.rowIcon} data-kind="request">
                      <ClipboardList size={15} aria-hidden="true" />
                    </span>
                    <span className={styles.rowBody}>
                      <span className={styles.rowTitle}>
                        {requestTypeLabel(request.request_type)}
                        {request.item_count > 0 ? ` · ${request.item_count} item${request.item_count === 1 ? "" : "s"}` : ""}
                      </span>
                      <span className={styles.rowMeta}>
                        {request.description || "No description"}
                        {request.date_requested ? ` · ${fmtDay(request.date_requested)}` : ""}
                      </span>
                    </span>
                    <span className={`${styles.pill} ${statusClass(request.status)}`}>
                      {statusLabel(request.status)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </article>
        </div>

        <aside className={styles.sideCol}>
          {/* -------- Account overview -------- */}
          <article className={styles.panel}>
            <header className={styles.panelHead}>
              <div>
                <h2 className={styles.panelTitle}>Account overview</h2>
                <p className={styles.panelSub}>Your employee record</p>
              </div>
              <UserRound size={16} aria-hidden="true" className={styles.panelIcon} />
            </header>

            <div className={styles.identity}>
              <span className={styles.avatar} aria-hidden="true">
                {initials(displayName)}
              </span>
              <span className={styles.identityBody}>
                <span className={styles.identityName}>{displayName}</span>
                <span className={styles.identityRole}>
                  {contextLine ?? "Employee"}
                </span>
              </span>
            </div>

            <dl className={styles.accountList}>
              {account.map((row) => {
                const Icon = row.icon;
                return (
                  <div key={row.label} className={styles.accountRow}>
                    <dt>
                      <Icon size={13} aria-hidden="true" />
                      {row.label}
                    </dt>
                    <dd data-empty={row.value === "Not set" || undefined}>
                      {row.value}
                    </dd>
                  </div>
                );
              })}
              <div className={styles.accountRow}>
                <dt>
                  <ShieldCheck size={13} aria-hidden="true" />
                  Account
                </dt>
                <dd>
                  <span className={`${styles.pill} ${styles.pillApproved}`}>
                    {statusLabel(status)}
                  </span>
                </dd>
              </div>
            </dl>

            <div className={styles.completion}>
              <div className={styles.completionHead}>
                <span>Profile completeness</span>
                <strong>{profileCompletion}%</strong>
              </div>
              <div
                className={styles.completionTrack}
                role="progressbar"
                aria-valuenow={profileCompletion}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Profile completeness"
              >
                <span
                  className={styles.completionFill}
                  style={{ width: `${profileCompletion}%` }}
                />
              </div>
              {memberSince && (
                <p className={styles.completionNote}>
                  <CalendarClock size={12} aria-hidden="true" />
                  Account active since {fmtDay(memberSince)}
                </p>
              )}
            </div>
          </article>

          {/* -------- Documents -------- */}
          <article className={styles.panel}>
            <header className={styles.panelHead}>
              <div>
                <h2 className={styles.panelTitle}>Documents on file</h2>
                <p className={styles.panelSub}>PAR / ICS accountability copies</p>
              </div>
              <Link href="/employee/assets" className={styles.panelLink}>
                View
                <ArrowRight size={13} aria-hidden="true" />
              </Link>
            </header>

            {docs.length === 0 ? (
              <div className={styles.empty}>
                <FileText size={20} aria-hidden="true" />
                <p>No documents yet.</p>
                <span>Signed PAR / ICS copies are downloaded from here.</span>
              </div>
            ) : (
              <ul className={styles.docList}>
                {docs.slice(0, 4).map((doc) => (
                  <li key={doc.id} className={styles.docRow}>
                    <span className={styles.docType}>{doc.doc_type}</span>
                    <span className={styles.docBody}>
                      <span className={styles.docNo}>{doc.doc_no ?? "Unnumbered"}</span>
                      <span className={styles.docMeta}>
                        {fmtDay(doc.doc_date)} · {doc.asset_label ?? "Multiple items"}
                      </span>
                    </span>
                    <a
                      href={doc.downloadHref}
                      className={styles.docDownload}
                      aria-label={`Download ${doc.doc_type} ${doc.doc_no ?? ""}`}
                    >
                      <Download size={14} aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </article>
        </aside>
      </div>
    </section>
  );
}
