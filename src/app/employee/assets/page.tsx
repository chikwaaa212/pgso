"use client";

import { useMemo } from "react";
import Image from "next/image";
import { Package } from "lucide-react";
import { Card } from "@/components/ui/card";
import { BackButton } from "../back-button";
import { getMyAssets, getMyAssetRequests, getMyDocs, getMyIssuanceDetail } from "../actions";
import { requestTypeLabel } from "@/app/personnel/requests/request-types";
import { RequestQrButton } from "@/components/personnel/RequestQrButton";
import { useCachedAction } from "@/hooks/use-cached-action";
import { useReceipt } from "@/hooks/use-receipt";
import { CLIENT_CACHE_KEYS } from "@/lib/client-cache";
import type { IssuanceDetail } from "@/app/personnel/issuances/actions";
import { ParReportSheet } from "@/app/personnel/documents/par-report";
import { IcsReportSheet } from "@/app/personnel/documents/ics-report";
import { DocSheetSkeleton, EmployeeDocModal } from "./doc-view-modal";
import receipt from "@/app/personnel/inspections/components/receipt.module.css";
import AssetsLoading from "./loading";
import styles from "./page.module.css";

function label(value: string | null) {
  if (!value) return "—";
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");
}

function fmtDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric", timeZone: "Asia/Manila" });
}

/** "Direct assignment · ICS ICS-2026-001" — doc ref omitted when absent. */
function receivedLabel(a: {
  source: string;
  doc_type: string | null;
  doc_no: string | null;
}) {
  const docRef = [a.doc_type, a.doc_no].filter(Boolean).join(" ");
  if (a.source === "direct") return docRef ? `Direct assignment · ${docRef}` : "Direct assignment";
  if (a.source === "request") return docRef ? `Via request · ${docRef}` : "Via request";
  return "On record";
}

export default function EmployeeAssetsPage() {
  // Cached snapshot (assets + docs + requests): back-navigation paints
  // instantly from memory / sessionStorage and only revalidates silently
  // when stale (30s, matching the personnel lists) — same SWR pattern as
  // the personnel dashboard / deliveries pages.
  const { data: snapshot, loading } = useCachedAction(
    CLIENT_CACHE_KEYS.employeeAssets,
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

  // PAR/ICS record viewer with per-record client caching (memory +
  // sessionStorage, shared `issuance:${id}` key space with the personnel
  // documents page): fresh (<5min) paints instantly with no network,
  // stale paints instantly then refreshes silently, cold shows the
  // sheet skeleton below.
  const viewer = useReceipt<IssuanceDetail | null>();
  const openDoc = (id: string) =>
    viewer.open(id, `issuance:${id}`, () => getMyIssuanceDetail(id));
  const viewingDoc = viewer.doc ?? null;
  // While cold-loading the sheet is null — fall back to the row's type so
  // the skeleton + title already match the PAR/ICS layout being fetched.
  const viewingType =
    viewingDoc?.doc_type ??
    docs.find((d) => d.id === viewer.selectedId)?.doc_type ??
    "PAR";
  const viewingIsIcs = viewingType === "ICS";

  if (loading) {
    return <AssetsLoading />;
  }

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Employee / My Assets</p>
      <div className={styles.headerRow}>
        <div>
          <BackButton />
          <h1 className={styles.title}>My Assets</h1>
          <p className={styles.subtitle}>
            {assets.length} {assets.length === 1 ? "item" : "items"} assigned to you
            {assets.length > 0 ? ` (${assetCount} ${assetCount === 1 ? "asset" : "assets"}${stockCount > 0 ? ` · ${stockCount} stock ${stockCount === 1 ? "lot" : "lots"}` : ""})` : ""}
            {docs.length > 0 ? ` · ${docs.length} issuance ${docs.length === 1 ? "document" : "documents"}` : ""}.
          </p>
        </div>
        <Image
          src="/favicon.png"
          alt="PGSO logo"
          width={120}
          height={120}
          priority
          className={styles.mascot}
        />
      </div>

      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>Assigned assets</h2>
        <p className={styles.panelSub}>
          Property under your accountability — requested or issued directly by
          PGSO personnel. Report loss, damage, or needed repairs through My Requests.
        </p>
        <div className={styles.assetGrid}>
          {assets.map((a) => (
            <Card key={a.id} className={styles.assetCard}>
              <div className={styles.assetTop}>
                <span className={styles.assetIcon} aria-hidden="true">
                  <Package size={18} />
                </span>
                <span className={styles.assetId}>{a.qr_code ?? a.property_number ?? a.doc_no ?? "—"}</span>
                {a.kind === "stock" ? (
                  <span className={styles.status} data-tone="warn">
                    Stock
                  </span>
                ) : (
                  <span className={styles.status} data-tone={a.status === "available" ? "ok" : "info"}>
                    {label(a.status)}
                  </span>
                )}
              </div>
              <h3 className={styles.assetTitle}>{a.article ?? "Untitled asset"}</h3>
              <p className={styles.assetDesc}>{a.description ?? "No description on record."}</p>
              <dl className={styles.assetMeta}>
                <div className={styles.assetMetaRow}>
                  <dt>Account code</dt>
                  <dd>{a.account_code ?? "—"}</dd>
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
                  <dd>{a.location ?? "—"}</dd>
                </div>
                {a.condition != null ? (
                  <div className={styles.assetMetaRow}>
                    <dt>Condition</dt>
                    <dd>
                      <span className={styles.status} data-tone={a.condition === "unserviceable" ? "bad" : "ok"}>
                        {label(a.condition)}
                      </span>
                    </dd>
                  </div>
                ) : null}
              </dl>
            </Card>
          ))}
          {assets.length === 0 && (
            <p className={styles.empty}>No assets assigned to you yet.</p>
          )}
        </div>
      </Card>

      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>Requested &amp; transferred to me</h2>
        <p className={styles.panelSub}>
          Your new assignments, transfers (assets or stock lots), and repairs —
          plus transfers others addressed to your name — with live status.
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
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
                  <td className={styles.colWide}>{r.asset_label ?? "—"}</td>
                  <td>{r.direction === "incoming" ? r.employee_name : "Me"}</td>
                  <td>
                    <span className={styles.status} data-tone={r.status === "rejected" ? "bad" : r.status === "pending" ? "warn" : "ok"}>
                      {label(r.status)}
                    </span>
                  </td>
                  <td>{fmtDate(r.date_requested)}</td>
                  <td>{fmtDate(r.date_resolved)}</td>
                  <td>
                    {(r.status ?? "pending") === "completed" ? (
                      <RequestQrButton requestId={r.id} />
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
              {requests.length === 0 && (
                <tr>
                  <td colSpan={7} className={styles.empty}>No requests or transfers to you yet — file one in My Requests.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>My PAR / ICS documents</h2>
        <p className={styles.panelSub}>
          Issuance records under your name — preview the record or download the Excel copy anytime.
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
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
                  <td>{d.doc_no ?? "—"}</td>
                  <td>{d.doc_type}</td>
                  <td>{d.doc_date ?? "—"}</td>
                  <td>{d.quantity}</td>
                  <td className={styles.colWide}>{d.asset_label ?? "—"}</td>
                  <td>
                    <button
                      type="button"
                      className={`${styles.inspectLinkSecondary} cursor-pointer`}
                      onClick={() => openDoc(d.id)}
                    >
                      View {d.doc_type}
                    </button>
                  </td>
                  <td>
                    <a href={d.downloadHref} download className={styles.inspectLinkSecondary}>
                      Excel (.xlsx)
                    </a>
                  </td>
                </tr>
              ))}
              {docs.length === 0 && (
                <tr>
                  <td colSpan={7} className={styles.empty}>No issuance documents yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <EmployeeDocModal
        open={viewer.selectedId !== null}
        title={viewingIsIcs ? "Inventory Custodian Slip" : "Property Acknowledgment Receipt"}
        onClose={viewer.close}
      >
        {viewer.docLoading ? (
          <div className={receipt.receiptStack} style={{ maxWidth: "none" }}>
            <DocSheetSkeleton
              docType={viewingType}
              label={viewingIsIcs ? "Loading ICS report…" : "Loading PAR report…"}
            />
          </div>
        ) : !viewingDoc ? (
          <p className={styles.empty}>This record is no longer available.</p>
        ) : (
          <div className={receipt.receiptStack} style={{ maxWidth: "none" }}>
            {viewingIsIcs ? (
              <IcsReportSheet issuance={viewingDoc} />
            ) : (
              <ParReportSheet issuance={viewingDoc} />
            )}
            <p className={styles.panelSub}>
              <a
                href={
                  viewingIsIcs
                    ? `/api/personnel/issuances/${viewingDoc.id}/ics-xlsx`
                    : `/api/personnel/issuances/${viewingDoc.id}/par-xlsx`
                }
                download
                className={styles.inspectLinkSecondary}
              >
                Download Excel
              </a>
            </p>
          </div>
        )}
      </EmployeeDocModal>
    </section>
  );
}
