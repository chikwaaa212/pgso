"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  ClipboardList,
  Download,
  FileText,
  Package,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { getMyAssets, getMyAssetRequests, getMyDocs, getMyIssuanceDetail } from "../actions";
import { requestTypeLabel } from "@/app/personnel/requests/request-types";
import { RequestQrButton } from "@/components/personnel/RequestQrButton";
import { useCachedAction } from "@/hooks/use-cached-action";
import { useReceipt } from "@/hooks/use-receipt";
import { buildQueryKey } from "@/lib/query-keys";
import type { IssuanceDetail } from "@/app/personnel/issuances/actions";
import { ParReportSheet } from "@/app/personnel/documents/par-report";
import { IcsReportSheet } from "@/app/personnel/documents/ics-report";
import { DocSheetSkeleton, EmployeeDocModal } from "./doc-view-modal";
import receipt from "@/app/personnel/inspections/components/receipt.module.css";
import AssetsLoading from "./loading";
import shell from "../page-shell.module.css";
import styles from "./page.module.css";

type KindFilter = "all" | "asset" | "stock";
type RequestTone = "ok" | "warn" | "bad" | "info";

function label(value: string | null) {
  if (!value) return "-";
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");
}

function fmtDate(value: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  });
}

/** "Direct assignment - ICS ICS-2026-001"; doc ref omitted when absent. */
function receivedLabel(a: {
  source: string;
  doc_type: string | null;
  doc_no: string | null;
}) {
  const docRef = [a.doc_type, a.doc_no].filter(Boolean).join(" ");
  if (a.source === "direct") return docRef ? `Direct assignment - ${docRef}` : "Direct assignment";
  if (a.source === "request") return docRef ? `Via request - ${docRef}` : "Via request";
  return "On record";
}

function requestTone(status: string | null): RequestTone {
  if (status === "rejected") return "bad";
  if (status === "pending") return "warn";
  if (status === "approved" || status === "completed") return "ok";
  return "info";
}

export default function EmployeeAssetsPage() {
  // Cached snapshot (assets + docs + requests): back-navigation paints
  // instantly from memory / sessionStorage and only revalidates silently
  // when stale (30s, matching the personnel lists) - same SWR pattern as
  // the personnel dashboard / deliveries pages.
  const { data: snapshot, loading } = useCachedAction(
    buildQueryKey({ module: 'employee', resource: 'assets' }),
    () =>
      Promise.all([getMyAssets(), getMyDocs(), getMyAssetRequests()]).then(
        ([assets, docs, requests]) => ({ assets, docs, requests })
      ),
    { staleTime: 30_000 }
  );
  const assets = useMemo(() => snapshot?.assets ?? [], [snapshot]);
  const docs = useMemo(() => snapshot?.docs ?? [], [snapshot]);
  const requests = useMemo(() => snapshot?.requests ?? [], [snapshot]);

  const assetCount = useMemo(() => assets.filter((a) => a.kind === "asset").length, [assets]);
  const stockCount = useMemo(() => assets.filter((a) => a.kind === "stock").length, [assets]);
  const stockQuantity = useMemo(
    () => assets.reduce((sum, a) => sum + (a.kind === "stock" ? a.quantity ?? 0 : 0), 0),
    [assets]
  );
  const pendingRequests = useMemo(
    () => requests.filter((r) => r.status === "pending").length,
    [requests]
  );

  // Client-side lens over the cached snapshot - no extra round-trips.
  const [kind, setKind] = useState<KindFilter>("all");
  const [query, setQuery] = useState("");

  const visibleAssets = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assets.filter((a) => {
      if (kind !== "all" && a.kind !== kind) return false;
      if (!q) return true;
      return [a.article, a.description, a.property_number, a.account_code, a.doc_no, a.qr_code, a.location]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [assets, kind, query]);

  // PAR/ICS record viewer with per-record client caching (memory +
  // sessionStorage, shared `issuance:${id}` key space with the personnel
  // documents page): fresh (<5min) paints instantly with no network,
  // stale paints instantly then refreshes silently, cold shows the
  // sheet skeleton below.
  const viewer = useReceipt<IssuanceDetail | null>();
  const openDoc = (id: string) =>
    viewer.open(id, `issuance:${id}`, () => getMyIssuanceDetail(id));
  const viewingDoc = viewer.doc ?? null;
  // While cold-loading the sheet is null - fall back to the row's type so
  // the skeleton + title already match the PAR/ICS layout being fetched.
  const viewingType =
    viewingDoc?.doc_type ??
    docs.find((d) => d.id === viewer.selectedId)?.doc_type ??
    "PAR";
  const viewingIsIcs = viewingType === "ICS";

  if (loading) {
    return <AssetsLoading />;
  }

  const kindChips: { key: KindFilter; label: string; count: number }[] = [
    { key: "all", label: "All items", count: assets.length },
    { key: "asset", label: "Property", count: assetCount },
    { key: "stock", label: "Consumables", count: stockCount },
  ];

  return (
    <section className={shell.page}>
      <nav className={shell.crumb} aria-label="Breadcrumb">
        <Link href="/employee/dashboard" className={shell.crumbLink}>
          Employee
        </Link>
        <span aria-hidden="true">/</span>
        <span data-current="true">My Assets</span>
      </nav>

      <header className={shell.pageHead}>
        <div className={shell.headText}>
          <span className={shell.eyebrow}>
            <ShieldCheck size={12} aria-hidden="true" />
            My accountability
          </span>
          <h1 className={shell.title}>My Assets</h1>
          <p className={shell.subtitle}>
            Property, consumables and PAR / ICS records under your name. Report
            loss, damage or a needed repair through My Requests.
          </p>
        </div>
        <div className={shell.headActions}>
          <Link href="/employee/dashboard" className={shell.btnSecondary}>
            <ArrowRight size={14} aria-hidden="true" style={{ transform: "rotate(180deg)" }} />
            Dashboard
          </Link>
          <Link href="/employee/requests" className={shell.btnPrimary}>
            <ClipboardList size={14} aria-hidden="true" />
            File a request
          </Link>
        </div>
      </header>

      {/* ---------------- Stat strip ---------------- */}
      <div className={shell.statStrip}>
        <button
          type="button"
          className={shell.stat}
          data-active={kind === "all"}
          onClick={() => setKind("all")}
          aria-pressed={kind === "all"}
        >
          <span className={shell.statIcon}>
            <Package size={15} aria-hidden="true" />
          </span>
          <span className={shell.statBody}>
            <span className={shell.statValue}>{assets.length}</span>
            <span className={shell.statLabel}>Items on record</span>
          </span>
        </button>
        <button
          type="button"
          className={shell.stat}
          data-active={kind === "asset"}
          onClick={() => setKind("asset")}
          aria-pressed={kind === "asset"}
        >
          <span className={shell.statIcon} data-tone="ok">
            <ShieldCheck size={15} aria-hidden="true" />
          </span>
          <span className={shell.statBody}>
            <span className={shell.statValue}>{assetCount}</span>
            <span className={shell.statLabel}>Property assets</span>
          </span>
        </button>
        <button
          type="button"
          className={shell.stat}
          data-active={kind === "stock"}
          onClick={() => setKind("stock")}
          aria-pressed={kind === "stock"}
        >
          <span className={shell.statIcon} data-tone="warn">
            <Boxes size={15} aria-hidden="true" />
          </span>
          <span className={shell.statBody}>
            <span className={shell.statValue}>{stockQuantity}</span>
            <span className={shell.statLabel}>
              Consumables in {stockCount} {stockCount === 1 ? "lot" : "lots"}
            </span>
          </span>
        </button>
        <a href="#documents" className={shell.stat}>
          <span className={shell.statIcon}>
            <FileText size={15} aria-hidden="true" />
          </span>
          <span className={shell.statBody}>
            <span className={shell.statValue}>{docs.length}</span>
            <span className={shell.statLabel}>PAR / ICS documents</span>
          </span>
        </a>
      </div>

      {/* ---------------- Assets ---------------- */}
      <section className={shell.panel}>
        <header className={shell.panelHead}>
          <div className={shell.panelHeadText}>
            <h2 className={shell.panelTitle}>
              <Package size={15} aria-hidden="true" />
              Assigned assets
            </h2>
            <p className={shell.panelSub}>
              Property under your accountability - requested or issued directly by
              PGSO personnel.
            </p>
          </div>
          <div className={shell.panelActions}>
            <span className={shell.countBadge}>{visibleAssets.length}</span>
          </div>
        </header>

        <div className={shell.toolbar}>
          <label className={shell.search}>
            <Search className={shell.searchIcon} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search item, property no., account code..."
              className={shell.searchInput}
              aria-label="Search my assets"
            />
            {query && (
              <button
                type="button"
                className={shell.searchClear}
                onClick={() => setQuery("")}
                aria-label="Clear search"
              >
                <X size={12} aria-hidden="true" />
              </button>
            )}
          </label>
          <div className={shell.filters} role="group" aria-label="Filter by item kind">
            {kindChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                className={shell.filterChip}
                data-active={kind === chip.key}
                onClick={() => setKind(chip.key)}
                aria-pressed={kind === chip.key}
              >
                {chip.label}
                <span className={shell.filterCount}>{chip.count}</span>
              </button>
            ))}
          </div>
        </div>

        {visibleAssets.length === 0 ? (
          <div className={shell.empty}>
            <span className={shell.emptyIcon}>
              <Package size={18} aria-hidden="true" />
            </span>
            <p className={shell.emptyTitle}>
              {assets.length === 0 ? "No assets yet" : "No matching assets"}
            </p>
            <p className={shell.emptyText}>
              {assets.length === 0
                ? "Issued property and consumables appear here once PGSO personnel record them under your name."
                : "Try a different search term or switch the filter back to all items."}
            </p>
            {assets.length === 0 ? (
              <Link href="/employee/requests" className={shell.emptyAction}>
                <ClipboardList size={13} aria-hidden="true" />
                File a request
              </Link>
            ) : (
              <button
                type="button"
                className={shell.emptyAction}
                onClick={() => {
                  setQuery("");
                  setKind("all");
                }}
              >
                Reset filters
              </button>
            )}
          </div>
        ) : (
          <div className={styles.assetGrid}>
            {visibleAssets.map((a) => (
              <article key={a.id} className={styles.assetCard}>
                <div className={styles.assetTop}>
                  <span className={styles.assetIcon} data-kind={a.kind} aria-hidden="true">
                    {a.kind === "stock" ? <Boxes size={17} /> : <Package size={17} />}
                  </span>
                  <span className={styles.assetId}>
                    {a.qr_code ?? a.property_number ?? a.doc_no ?? "No reference"}
                  </span>
                  {a.kind === "stock" ? (
                    <span className={shell.pill} data-tone="warn">
                      Consumable
                    </span>
                  ) : (
                    <span className={shell.pill} data-tone={a.status === "available" ? "ok" : "info"}>
                      {label(a.status)}
                    </span>
                  )}
                </div>

                <h3 className={styles.assetTitle}>{a.article ?? "Untitled asset"}</h3>
                <p className={styles.assetDesc}>
                  {a.description ?? "No description on record."}
                </p>

                <dl className={styles.assetMeta}>
                  <div className={styles.assetMetaRow}>
                    <dt>Account code</dt>
                    <dd>{a.account_code ?? "-"}</dd>
                  </div>
                  {a.quantity != null ? (
                    <div className={styles.assetMetaRow}>
                      <dt>Quantity</dt>
                      <dd>{a.unit ? `${a.quantity} ${a.unit}` : String(a.quantity)}</dd>
                    </div>
                  ) : null}
                  <div className={styles.assetMetaRow}>
                    <dt>Received</dt>
                    <dd>{receivedLabel(a)}</dd>
                  </div>
                  <div className={styles.assetMetaRow}>
                    <dt>Location</dt>
                    <dd>{a.location ?? "-"}</dd>
                  </div>
                  {a.condition != null ? (
                    <div className={styles.assetMetaRow}>
                      <dt>Condition</dt>
                      <dd>
                        <span
                          className={shell.pill}
                          data-tone={a.condition === "unserviceable" ? "bad" : "ok"}
                        >
                          {label(a.condition)}
                        </span>
                      </dd>
                    </div>
                  ) : null}
                </dl>

                {a.units && a.units.length > 0 ? (
                  <div className="mt-3 border-t border-slate-200 pt-3">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      My tracked pieces
                    </p>
                    <ul className="space-y-2">
                      {a.units.map((unit) => (
                        <li
                          key={unit.id}
                          className="flex items-center gap-2.5 rounded-md border border-slate-200 bg-white p-2"
                        >
                          {unit.qr_data_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={unit.qr_data_url}
                              alt={`QR code for ${unit.item_code}`}
                              width={56}
                              height={56}
                              className="h-14 w-14 shrink-0"
                              loading="lazy"
                              decoding="async"
                            />
                          ) : null}
                          <div className="min-w-0">
                            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-navy-900">
                              {unit.item_code}
                            </code>
                            <p className="mt-0.5 text-[10px] capitalize text-slate-500">
                              {unit.status ?? "assigned"}
                              {unit.assigned_at ? ` · ${fmtDate(unit.assigned_at)}` : ""}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>

      {/* ---------------- Requests / transfers ---------------- */}
      <section className={shell.panel}>
        <header className={shell.panelHead}>
          <div className={shell.panelHeadText}>
            <h2 className={shell.panelTitle}>
              <ClipboardList size={15} aria-hidden="true" />
              Requested &amp; transferred to me
            </h2>
            <p className={shell.panelSub}>
              New assignments, transfers and repairs you filed - plus transfers
              others addressed to your name.
            </p>
          </div>
          <div className={shell.panelActions}>
            {pendingRequests > 0 && (
              <span className={shell.pill} data-tone="warn">
                {pendingRequests} pending
              </span>
            )}
            <span className={shell.countBadge}>{requests.length}</span>
          </div>
        </header>

        <div className={shell.tableWrap}>
          <table className={shell.table}>
            <thead>
              <tr>
                <th>Type</th>
                <th>Item</th>
                <th>From</th>
                <th>Status</th>
                <th>Filed</th>
                <th>Resolved</th>
                <th>QR</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id}>
                  <td>{requestTypeLabel(r.request_type)}</td>
                  <td className={shell.colWide}>{r.asset_label ?? "-"}</td>
                  <td>{r.direction === "incoming" ? r.employee_name : "Me"}</td>
                  <td>
                    <span className={shell.pill} data-tone={requestTone(r.status)}>
                      {label(r.status)}
                    </span>
                  </td>
                  <td className={shell.mutedCell}>{fmtDate(r.date_requested)}</td>
                  <td className={shell.mutedCell}>{fmtDate(r.date_resolved)}</td>
                  <td>
                    {(r.status ?? "pending") === "completed" ? (
                      <RequestQrButton requestId={r.id} />
                    ) : (
                      <span className={shell.mutedCell}>-</span>
                    )}
                  </td>
                </tr>
              ))}
              {requests.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <div className={styles.tableEmpty}>
                      No requests or transfers yet - file one from My Requests.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------- Documents ---------------- */}
      <section className={shell.panel} id="documents">
        <header className={shell.panelHead}>
          <div className={shell.panelHeadText}>
            <h2 className={shell.panelTitle}>
              <FileText size={15} aria-hidden="true" />
              My PAR / ICS documents
            </h2>
            <p className={shell.panelSub}>
              Issuance records under your name - preview the sheet or download the
              Excel copy anytime.
            </p>
          </div>
          <div className={shell.panelActions}>
            <span className={shell.countBadge}>{docs.length}</span>
          </div>
        </header>

        <div className={shell.tableWrap}>
          <table className={shell.table}>
            <thead>
              <tr>
                <th>Doc</th>
                <th>Type</th>
                <th>Date</th>
                <th>Qty</th>
                <th>Asset</th>
                <th>Report</th>
                <th>Download</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td className={shell.monoCell}>{d.doc_no ?? "-"}</td>
                  <td>
                    <span className={styles.docType}>{d.doc_type}</span>
                  </td>
                  <td className={shell.mutedCell}>{d.doc_date ?? "-"}</td>
                  <td className={styles.qtyCell}>{d.quantity}</td>
                  <td className={shell.colWide}>{d.asset_label ?? "-"}</td>
                  <td>
                    <button
                      type="button"
                      className={styles.rowAction}
                      onClick={() => openDoc(d.id)}
                    >
                      View {d.doc_type}
                    </button>
                  </td>
                  <td>
                    <a href={d.downloadHref} download className={styles.rowAction}>
                      <Download size={12} aria-hidden="true" />
                      Excel (.xlsx)
                    </a>
                  </td>
                </tr>
              ))}
              {docs.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <div className={styles.tableEmpty}>
                      No issuance documents yet - they arrive with your first PAR or ICS.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <EmployeeDocModal
        open={viewer.selectedId !== null}
        title={viewingIsIcs ? "Inventory Custodian Slip" : "Property Acknowledgment Receipt"}
        onClose={viewer.close}
      >
        {viewer.docLoading ? (
          <div className={receipt.receiptStack} style={{ maxWidth: "none" }}>
            <DocSheetSkeleton
              docType={viewingType}
              label={viewingIsIcs ? "Loading ICS report..." : "Loading PAR report..."}
            />
          </div>
        ) : !viewingDoc ? (
          <p className={styles.tableEmpty}>This record is no longer available.</p>
        ) : (
          <div className={receipt.receiptStack} style={{ maxWidth: "none" }}>
            {viewingIsIcs ? (
              <IcsReportSheet issuance={viewingDoc} />
            ) : (
              <ParReportSheet issuance={viewingDoc} />
            )}
            <p className={shell.panelSub}>
              <a
                href={
                  viewingIsIcs
                    ? `/api/employee/issuances/${viewingDoc.id}/ics-xlsx`
                    : `/api/employee/issuances/${viewingDoc.id}/par-xlsx`
                }
                download
                className={styles.rowAction}
              >
                <Download size={12} aria-hidden="true" />
                Download Excel
              </a>
            </p>
          </div>
        )}
      </EmployeeDocModal>
    </section>
  );
}
