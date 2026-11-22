"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  Boxes,
  ClipboardCheck,
  Eye,
  FileCheck2,
  FileText,
  PackageSearch,
  RefreshCw,
  Search,
  SearchX,
  Truck,
} from "lucide-react";
import type { IconComponent } from "@/components/personnel/SummaryTiles";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/personnel/PageHeader";
import { label } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { getRecordCounts, getRecentAssets } from "./actions";
import { browseAsset, browseIssuance } from "../browse/actions";
import type { UnifiedAssetRow } from "@/app/personnel/assets/actions";
import type { IssuanceDetail } from "@/app/personnel/issuances/actions";
import {
  getLowStockItems,
  getRecentIssuances,
} from "@/app/personnel/dashboard/actions";
import { useCachedAction } from "@/hooks/use-cached-action";
import { buildQueryKey } from "@/lib/query-keys";
import { useReceipt } from "@/hooks/use-receipt";
import { ReceiptLoading } from "@/components/personnel/ReceiptLoading";
import { ReceiptOverlay } from "@/app/personnel/documents/receipt-overlay";
import { AssetReceipt } from "@/app/personnel/assets/asset-receipt";
import { ParReportSheet } from "@/app/personnel/documents/par-report";
import { IcsReportSheet } from "@/app/personnel/documents/ics-report";
import receipt from "@/app/personnel/inspections/components/receipt.module.css";
import RecordsLoading from "./loading";
import ui from "@/components/personnel/personnel-ui.module.css";
import styles from "./page.module.css";

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  });
}

/** Yellow 24px action buttons — same treatment as Assets / Inspections / Users. */
const ACTION_BTN = cn(
  "h-6 gap-1.5 rounded-[4px] border border-yellow-500 bg-yellow-500 px-3 text-xs font-semibold",
  "text-navy-900 opacity-[0.85] transition-colors hover:bg-yellow-400 hover:text-navy-900 hover:opacity-100 disabled:opacity-40"
);

const VIEW_TABS = [
  { value: "assets", label: "Recent assets" },
  { value: "stock", label: "Low stock" },
  { value: "issuances", label: "PAR / ICS" },
] as const;

type ViewTab = (typeof VIEW_TABS)[number]["value"];

type Tone = "ok" | "warn" | "bad" | "info";

interface SummaryTile {
  label: string;
  value: number;
  meta: string;
  tone: Tone;
  icon: IconComponent;
  /** When set, the tile switches the panel to this stream. */
  tab?: ViewTab;
  /** Otherwise the tile links to its own oversight screen. */
  href?: string;
}

function stockTone(level: string): Tone {
  return level === "low" ? "warn" : "bad";
}

function assetTone(status: string | null): Tone {
  if (status === "available") return "ok";
  if (status === "assigned" || status === "issued") return "info";
  return "warn";
}

const SEARCH_PLACEHOLDER: Record<ViewTab, string> = {
  assets: "Search article, code, type, location…",
  stock: "Search item or stock level…",
  issuances: "Search document no., end user, type…",
};

const EMPTY_COPY: Record<ViewTab, string> = {
  assets: "Assets appear here as soon as a delivery passes inspection.",
  stock: "Nothing is below its reorder threshold right now.",
  issuances: "PAR and ICS records appear here once items are issued.",
};

export default function SuperAdminRecordsPage() {
  const [view, setView] = useState<ViewTab>("assets");
  const [query, setQuery] = useState("");

  // Cached snapshot (counts + 3 recent lists): back-navigation paints
  // instantly from memory / sessionStorage and only revalidates silently
  // when stale (60s, matching the server caches) — same SWR pattern as
  // the other admin pages.
  const {
    data: snapshot,
    loading,
    isValidating,
    refresh,
  } = useCachedAction(
    buildQueryKey({ module: "super-admin", resource: "records" }),
    () =>
      Promise.all([
        getRecordCounts(),
        getRecentAssets(10),
        getLowStockItems(8),
        getRecentIssuances(8),
      ]).then(([counts, assets, lowStock, issuances]) => ({
        counts,
        assets,
        lowStock,
        issuances,
      })),
    { staleTime: 60_000 }
  );
  const counts = snapshot?.counts;
  const assets = useMemo(() => snapshot?.assets ?? [], [snapshot]);
  const lowStock = useMemo(() => snapshot?.lowStock ?? [], [snapshot]);
  const issuances = useMemo(() => snapshot?.issuances ?? [], [snapshot]);

  // Overlay viewers with per-record client caching (same shared scheme as
  // the other admin pages — admin-prefixed keys keep per-role caches
  // separate): viewing a record opens a modal, not a new page.
  const assetViewer = useReceipt<UnifiedAssetRow | null>();
  const openAsset = (id: string) =>
    assetViewer.open(id, `admin-asset:${id}`, () => browseAsset(id));

  const issuanceViewer = useReceipt<IssuanceDetail | null>();
  const openIssuance = (id: string) =>
    issuanceViewer.open(id, `admin-issuance:${id}`, () => browseIssuance(id));

  const needle = query.trim().toLowerCase();
  const matches = (...values: (string | null | undefined)[]) =>
    needle === "" ||
    values.some((v) => (v ?? "").toLowerCase().includes(needle));

  const filteredAssets = assets.filter((a) =>
    matches(a.article, a.account_code, a.category, a.status, a.location)
  );
  const filteredStock = lowStock.filter((s) =>
    matches(
      s.item_name,
      s.unit,
      s.level === "out"
        ? "out of stock"
        : s.level === "critical"
          ? "critical"
          : "low stock"
    )
  );
  const filteredIssuances = issuances.filter((r) =>
    matches(r.doc_type, r.doc_no, r.employee_name)
  );

  const countsByTab: Record<ViewTab, number> = {
    assets: assets.length,
    stock: lowStock.length,
    issuances: issuances.length,
  };
  const filteredByTab: Record<ViewTab, number> = {
    assets: filteredAssets.length,
    stock: filteredStock.length,
    issuances: filteredIssuances.length,
  };

  if (loading) {
    return <RecordsLoading />;
  }

  const totalAssets = counts?.assets ?? 0;
  const totalStockSkus = counts?.stockSkus ?? 0;
  const totalIssuances = counts?.issuances ?? 0;

  const tiles: SummaryTile[] = [
    {
      label: "Assets",
      value: totalAssets,
      meta: `${assets.length} newest in the panel`,
      tone: "info" as Tone,
      icon: Boxes,
      tab: "assets" as ViewTab,
    },
    {
      label: "Stock SKUs",
      value: totalStockSkus,
      meta:
        lowStock.length === 0
          ? "levels healthy"
          : `${lowStock.length} at or below threshold`,
      tone: (lowStock.length === 0 ? "ok" : "warn") as Tone,
      icon: PackageSearch,
      tab: "stock" as ViewTab,
    },
    {
      label: "IAR records",
      value: counts?.iarRecords ?? 0,
      meta: "inspection reports on file",
      tone: "info" as Tone,
      icon: FileText,
      href: "/super-admin/documents",
    },
    {
      label: "PAR / ICS",
      value: totalIssuances,
      meta: "accountability documents",
      tone: "ok" as Tone,
      icon: FileCheck2,
      tab: "issuances" as ViewTab,
    },
    {
      label: "Deliveries",
      value: counts?.deliveries ?? 0,
      meta: "logged to date",
      tone: "info" as Tone,
      icon: Truck,
      href: "/super-admin/transactions",
    },
    {
      label: "Inspections",
      value: counts?.inspections ?? 0,
      meta: "processed deliveries",
      tone: "ok" as Tone,
      icon: ClipboardCheck,
      href: "/super-admin/inspections",
    },
  ];

  const currentCount = filteredByTab[view] ?? 0;
  const tabTotal = countsByTab[view] ?? 0;
  const activeTabLabel =
    VIEW_TABS.find((t) => t.value === view)?.label.toLowerCase() ?? "records";

  const issuanceDoc = issuanceViewer.doc ?? null;
  const issuanceIsIcs = issuanceDoc?.doc_type === "ICS";

  const rowAction = (
    text: string,
    onClick: () => void,
    ariaLabel: string
  ) => (
    <button
      type="button"
      className={cn(ACTION_BTN, "cursor-pointer")}
      aria-label={ariaLabel}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {text}
    </button>
  );

  return (
    <section className={styles.section}>
      <PageHeader
        eyebrow="Registry overview"
        title="Records"
        subtitle="Registry totals and the newest entries across assets, stock levels and accountability documents — open any record in a read-only overlay."
        meta={
          <>
            {totalAssets.toLocaleString()} assets · {totalStockSkus.toLocaleString()}{" "}
            stock SKUs · {(counts?.iarRecords ?? 0).toLocaleString()} IAR ·{" "}
            {totalIssuances.toLocaleString()} PAR/ICS ·{" "}
            {(counts?.deliveries ?? 0).toLocaleString()} deliveries ·{" "}
            {(counts?.inspections ?? 0).toLocaleString()} inspections
            {isValidating ? <span className={styles.updating}> · Updating…</span> : null}
          </>
        }
        actions={
          <Button
            type="button"
            onClick={refresh}
            disabled={isValidating}
            title="Reload the latest registry entries"
            className={ACTION_BTN}
          >
            <RefreshCw
              size={14}
              aria-hidden="true"
              className={isValidating ? "animate-spin" : undefined}
            />
            {isValidating ? "Refreshing…" : "Refresh"}
          </Button>
        }
      />

      {/* Summary tiles — registry tiles switch the panel, the rest open their
          own oversight screen. */}
      <div className={ui.tiles}>
        {tiles.map((tile) => {
          const Icon = tile.icon;
          const inner = (
            <>
              <span className={ui.tileIcon}>
                <Icon size={16} aria-hidden="true" />
              </span>
              <div className={ui.tileBody}>
                <p className={ui.tileLabel}>{tile.label}</p>
                <p className={ui.tileValue}>{tile.value.toLocaleString()}</p>
                <p className={ui.tileMeta}>{tile.meta}</p>
              </div>
            </>
          );

          if (tile.tab) {
            const tab = tile.tab;
            return (
              <button
                key={tile.label}
                type="button"
                title={`Show ${tab === "stock" ? "low-stock items" : tab === "assets" ? "recent assets" : "recent PAR / ICS"}`}
                className={cn(ui.tile, styles.tileButton)}
                data-tone={tile.tone}
                data-active={view === tab}
                onClick={() => {
                  setView(tab);
                  setQuery("");
                }}
              >
                {inner}
              </button>
            );
          }

          return (
            <Link
              key={tile.label}
              href={tile.href ?? "/super-admin/records"}
              title={`Open ${tile.label}`}
              className={cn(ui.tile, styles.tileButton, styles.tileLink)}
            >
              {inner}
              <ArrowUpRight
                size={14}
                aria-hidden="true"
                className={styles.tileArrow}
              />
            </Link>
          );
        })}
      </div>

      <Card className={styles.panel}>
        <div className={styles.panelHead}>
          <div className={styles.tabs} role="tablist" aria-label="Record type">
            {VIEW_TABS.map((tab) => {
              const active = view === tab.value;
              return (
                <button
                  key={tab.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={styles.tab}
                  data-active={active}
                  onClick={() => {
                    setView(tab.value);
                    setQuery("");
                  }}
                >
                  {tab.label}
                  <span className={styles.tabCount} data-active={active}>
                    {countsByTab[tab.value]}
                  </span>
                </button>
              );
            })}
          </div>

          <div className={styles.filters}>
            <div className={styles.searchWrap}>
              <Search size={15} aria-hidden="true" className={styles.searchIcon} />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={SEARCH_PLACEHOLDER[view]}
                className={styles.search}
                aria-label={SEARCH_PLACEHOLDER[view]}
              />
            </div>
            {query.trim() !== "" ? (
              <button
                type="button"
                className={styles.clearBtn}
                onClick={() => setQuery("")}
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>

        {currentCount === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>
              {query.trim() !== "" ? (
                <SearchX size={20} aria-hidden="true" />
              ) : view === "stock" ? (
                <PackageSearch size={20} aria-hidden="true" />
              ) : (
                <FileText size={20} aria-hidden="true" />
              )}
            </span>
            <p className={styles.emptyTitle}>
              {query.trim() !== "" ? "No matching records" : "Nothing to show yet"}
            </p>
            <p className={styles.emptyText}>
              {query.trim() !== ""
                ? "Try a different keyword, or clear the search to see every record."
                : EMPTY_COPY[view]}
            </p>
            {query.trim() !== "" ? (
              <button
                type="button"
                className={styles.emptyAction}
                onClick={() => setQuery("")}
              >
                Clear search
              </button>
            ) : null}
          </div>
        ) : (
          <div className={styles.tableWrap}>
            {view === "assets" ? (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Article</th>
                    <th>Code</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Location</th>
                    <th className={styles.actionHead}>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAssets.map((a) => (
                    <tr
                      key={a.id}
                      className={styles.bodyRow}
                      tabIndex={0}
                      onClick={() => openAsset(a.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openAsset(a.id);
                        }
                      }}
                    >
                      <td>
                        <span className={styles.cellMain}>{a.article ?? "—"}</span>
                        {a.condition ? (
                          <span className={styles.cellSub}>
                            Condition: {label(a.condition)}
                          </span>
                        ) : null}
                      </td>
                      <td>
                        <span className={styles.mono}>{a.account_code ?? "—"}</span>
                      </td>
                      <td>{a.category ?? "—"}</td>
                      <td>
                        <span className={styles.badge} data-tone={assetTone(a.status)}>
                          {label(a.status)}
                        </span>
                      </td>
                      <td>{a.location ?? "—"}</td>
                      <td className={styles.actionCell}>
                        {rowAction(
                          "View details",
                          () => openAsset(a.id),
                          `View details for asset ${a.article ?? a.id.slice(0, 8).toUpperCase()}`
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}

            {view === "stock" ? (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>On hand</th>
                    <th>Reorder threshold</th>
                    <th>Level</th>
                    <th className={styles.actionHead}>Manage</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStock.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <span className={styles.cellMain}>{s.item_name}</span>
                        {s.unit ? <span className={styles.cellSub}>Unit: {s.unit}</span> : null}
                      </td>
                      <td className={styles.numCell}>
                        {s.quantity.toLocaleString()}
                        {s.unit ? ` ${s.unit}` : ""}
                      </td>
                      <td className={styles.numCell}>
                        {s.reorder_threshold ?? "—"}
                      </td>
                      <td>
                        <span className={styles.badge} data-tone={stockTone(s.level)}>
                          {s.level === "out"
                            ? "Out of stock"
                            : s.level === "critical"
                              ? "Critical"
                              : "Low stock"}
                        </span>
                      </td>
                      <td className={styles.actionCell}>
                        <Link
                          href="/super-admin/stocks"
                          className={cn(ACTION_BTN, "inline-flex items-center")}
                          aria-label={`Manage stock for ${s.item_name}`}
                        >
                          <Eye size={13} aria-hidden="true" />
                          View stock
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}

            {view === "issuances" ? (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>End user</th>
                    <th>Date issued</th>
                    <th className={styles.actionHead}>Report</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredIssuances.map((r) => (
                    <tr
                      key={r.id}
                      className={styles.bodyRow}
                      tabIndex={0}
                      onClick={() => openIssuance(r.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openIssuance(r.id);
                        }
                      }}
                    >
                      <td>
                        <span
                          className={styles.badge}
                          data-tone={r.doc_type === "PAR" ? "info" : "neutral"}
                        >
                          {r.doc_type}
                        </span>
                        <span className={styles.cellSub}>
                          {r.doc_no ? `No. ${r.doc_no}` : "No document number"}
                        </span>
                      </td>
                      <td>
                        <span className={styles.cellMain}>{r.employee_name}</span>
                      </td>
                      <td>{fmtDate(r.created_at)}</td>
                      <td className={styles.actionCell}>
                        {rowAction(
                          `View ${r.doc_type}`,
                          () => openIssuance(r.id),
                          `View ${r.doc_type} report ${r.doc_no ?? r.id.slice(0, 8).toUpperCase()}`
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
        )}

        <div className={styles.panelFoot}>
          <span className={styles.footInfo}>
            Showing <strong>{currentCount}</strong> of <strong>{tabTotal}</strong>{" "}
            {activeTabLabel}
            {query.trim() !== "" ? " matching your search" : " · newest first"}
          </span>
          <span className={styles.footHint}>
            {view === "stock"
              ? "Stock levels live under Stocks"
              : "Select any row to open its read-only record"}
          </span>
        </div>
      </Card>

      <ReceiptOverlay
        open={assetViewer.selectedId !== null}
        title="Asset receipt"
        onClose={assetViewer.close}
      >
        {assetViewer.docLoading ? (
          <ReceiptLoading label="Loading asset…" />
        ) : !assetViewer.doc ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyText}>
              This record is no longer available.
            </p>
          </div>
        ) : (
          <div className={receipt.receiptStack} style={{ maxWidth: "none" }}>
            <AssetReceipt asset={assetViewer.doc} />
          </div>
        )}
      </ReceiptOverlay>

      <ReceiptOverlay
        open={issuanceViewer.selectedId !== null}
        title={
          issuanceIsIcs
            ? "Inventory Custodian Slip"
            : "Property Acknowledgment Receipt"
        }
        onClose={issuanceViewer.close}
      >
        {issuanceViewer.docLoading ? (
          <ReceiptLoading label="Loading report…" />
        ) : !issuanceDoc ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyText}>
              This record is no longer available.
            </p>
          </div>
        ) : (
          <div className={receipt.receiptStack} style={{ maxWidth: "none" }}>
            {issuanceIsIcs ? (
              <IcsReportSheet issuance={issuanceDoc} />
            ) : (
              <ParReportSheet issuance={issuanceDoc} />
            )}
            <p className={styles.docLinkRow}>
              <Link
                href={`/super-admin/issuances/${issuanceDoc.id}`}
                className={styles.docLink}
              >
                Open full report
              </Link>
              {" · "}
              <a
                href={`/api/personnel/issuances/${issuanceDoc.id}/${issuanceIsIcs ? "ics-xlsx" : "par-xlsx"}`}
                className={styles.docLink}
              >
                Download Excel
              </a>
            </p>
          </div>
        )}
      </ReceiptOverlay>
    </section>
  );
}
