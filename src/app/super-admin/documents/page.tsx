"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { PAGE_SIZE } from "@/lib/constants";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  browseDelivery,
  browseDeliveryForInspection,
  browseInspectionHistory,
  browseIarRecords,
  browseIssuance,
  browseViewedDocKeys,
  getAdminDocumentsTabPage,
  type AdminDocumentsTab,
  type BrowseDeliveryDocumentRow,
  type BrowseIarReportRow,
  type BrowseIssuanceRow,
} from "../browse/actions";
import {
  getDocumentsCounts,
} from "@/app/personnel/documents/actions";
import type { UnifiedInspectionRow } from "@/app/personnel/inspections/actions";
import type { InventoryRow } from "@/app/personnel/inventory/actions";
import type { UnifiedAssetRow } from "@/app/personnel/assets/actions";
import type { RepairRow } from "@/app/personnel/repairs/actions";
import type { IssuanceDetail } from "@/app/personnel/issuances/actions";
import type { DeliveryDetails } from "@/app/personnel/deliveries/actions";
import type {
  DeliveryForInspection,
  InspectionHistoryRecord,
  IarRecordRow,
} from "@/app/personnel/inspections/actions";
import { InspectionReceipt } from "@/app/personnel/inspections/components/inspection-receipt";
import { DeliveryReceipt } from "@/app/personnel/deliveries/[id]/delivery-receipt";
import { StockReceipt } from "@/app/personnel/inventory/stock-receipt";
import { AssetReceipt } from "@/app/personnel/assets/asset-receipt";
import { RepairReceipt } from "@/app/personnel/repairs/repair-receipt";
import { IarReportSheet } from "@/app/personnel/documents/iar-report";
import { ParReportSheet } from "@/app/personnel/documents/par-report";
import { IcsReportSheet } from "@/app/personnel/documents/ics-report";
import { ReceiptOverlay } from "@/app/personnel/documents/receipt-overlay";
import receipt from "@/app/personnel/inspections/components/receipt.module.css";
import { Pagination } from "@/components/ui/pagination";
import {
  DataTableSkeleton,
  PagerSkeleton,
} from "@/components/personnel/skeletons";
import { ReceiptLoading } from "@/components/personnel/ReceiptLoading";
import { useCachedAction } from "@/hooks/use-cached-action";
import { buildQueryKey } from "@/lib/query-keys";
import {
  getClientCache,
  setClientCache,
} from "@/lib/client-cache";
import { useReceipt } from "@/hooks/use-receipt";
import DocumentsLoading from "./loading";
import styles from "@/app/personnel/dashboard/page.module.css";
import air from "@/app/personnel/inspections/air-section.module.css";

const TABS = [
  { value: "delivery", label: "Delivery" },
  { value: "inspection", label: "Inspection" },
  { value: "stocks", label: "Stocks" },
  { value: "assets", label: "Assets" },
  { value: "repairs", label: "Repairs" },
  { value: "iar", label: "IAR Reports" },
  { value: "par", label: "PAR" },
  { value: "ics", label: "ICS" },
] as const;

type Tab = (typeof TABS)[number]["value"];

function isTab(v: string | null): v is Tab {
  return TABS.some((t) => t.value === v);
}

function fmt(iso: string | null | undefined) {
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

function label(value: string | null | undefined) {
  if (!value) return "—";
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");
}

function deliveryTone(status: string | null) {
  if (status === "complete") return "ok";
  if (status === "awaiting") return "info";
  return "warn";
}

function inspectionTone(result: string | null, inspectionStatus: string) {
  if (inspectionStatus === "pending") return "info";
  if (result === "passed") return "ok";
  if (result === "failed") return "bad";
  if (result === "partial") return "warn";
  return "info";
}

function assetTone(status: string | null) {
  if (status === "available") return "ok";
  if (status === "retired") return "warn";
  return "info";
}

function repairTone(status: string | null) {
  if (status === "completed") return "ok";
  if (status === "in_progress") return "info";
  return "warn";
}

function fmtCost(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(value);
}

export default function SuperAdminDocumentsPage() {
  return (
    <Suspense fallback={<DocumentsLoading />}>
      <SuperAdminDocumentsContent />
    </Suspense>
  );
}

function SuperAdminDocumentsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const initialTab = isTab(searchParams.get("tab"))
    ? (searchParams.get("tab") as Tab)
    : "delivery";
  const initialPage = Math.max(1, Number(searchParams.get("page")) || 1);
  const initialQ = searchParams.get("q") ?? "";

  const [tab, setTab] = useState<Tab>(initialTab);
  const [query, setQuery] = useState(initialQ);
  const debouncedQuery = useDebouncedValue(query, 300);
  // Fixed page size shared across Record Keeper + Registrar lists.
  const pageSize = PAGE_SIZE;
  const [page, setPage] = useState(initialPage);

  const setUrl = useCallback(
    (next: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(next)) {
        if (v === null || v === "") params.delete(k);
        else params.set(k, v);
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [searchParams, router, pathname]
  );

  // Keep URL in sync (refresh + back/forward work). Callers reset to page 1
  // when tab/search change via resetDocPages below.
  useEffect(() => {
    setUrl({
      tab: tab === "delivery" ? null : tab,
      page: page === 1 ? null : String(page),
      q: debouncedQuery || null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, page, debouncedQuery]);

  // Server-paginated tab window (PAGE_SIZE = 15): only the ACTIVE tab
  // fetches — one 15-row window + cached counts, never the 8×500 snapshot.
  // The hook keeps the previous key's payload while the new key loads; rows
  // are trusted only when stamped for the CURRENT tab.
  const {
    data: tabPayload,
    loading,
    error,
  } = useCachedAction(
    buildQueryKey({ module: 'super-admin', resource: 'documents', page, pageSize, filters: { tab, q: debouncedQuery } }),
    () =>
      getAdminDocumentsTabPage(tab as AdminDocumentsTab, { page, q: debouncedQuery }).then(
        (res) => ({ ...res, _tab: tab })
      ),
    { staleTime: 60_000 }
  );
  const tabData =
    tabPayload && (tabPayload as { _tab?: string })._tab === tab ? tabPayload : undefined;
  // Cheap per-tab totals for the header counts (no row payloads).
  const { data: countsData } = useCachedAction(
    buildQueryKey({ module: 'super-admin', resource: 'documents-counts' }),
    getDocumentsCounts,
    { staleTime: 60_000 }
  );
  // Per-tab rows: only the active tab has data. The server already searched
  // + paged — the DB window IS the page (same pattern as personnel docs).
  const windowRows = useMemo(() => (tabData?.rows ?? []) as unknown[], [tabData]);
  const tabTotal = tabData?.total ?? 0;
  const deliveries = useMemo(
    () => (tab === "delivery" ? (windowRows as BrowseDeliveryDocumentRow[]) : []),
    [tab, windowRows]
  );
  const inspections = useMemo(
    () => (
      tab === "inspection"
        ? (windowRows as (UnifiedInspectionRow & { logged_by: string | null })[])
        : []
    ),
    [tab, windowRows]
  );
  const stocks = useMemo(
    () => (tab === "stocks" ? (windowRows as InventoryRow[]) : []),
    [tab, windowRows]
  );
  const assets = useMemo(
    () => (tab === "assets" ? (windowRows as UnifiedAssetRow[]) : []),
    [tab, windowRows]
  );
  const repairs = useMemo(
    () => (tab === "repairs" ? (windowRows as RepairRow[]) : []),
    [tab, windowRows]
  );
  const iars = useMemo(
    () => (tab === "iar" ? (windowRows as BrowseIarReportRow[]) : []),
    [tab, windowRows]
  );
  const pars = useMemo(
    () => (tab === "par" ? (windowRows as BrowseIssuanceRow[]) : []),
    [tab, windowRows]
  );
  const icss = useMemo(
    () => (tab === "ics" ? (windowRows as BrowseIssuanceRow[]) : []),
    [tab, windowRows]
  );
  const { data: viewedKeysData } = useCachedAction(
    buildQueryKey({ module: 'super-admin', resource: 'documents-viewed' }),
    browseViewedDocKeys,
    { staleTime: 60_000 }
  );
  const [viewedKeys, setViewedKeys] = useState<Set<string>>(new Set());
  // Sync viewed keys from the server after hydration (local marks apply
  // instantly via markViewed; the server copy wins on refetch).
  useEffect(() => {
    if (viewedKeysData) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional post-hydration sync of cached state
      setViewedKeys(new Set(viewedKeysData));
    }
  }, [viewedKeysData]);
  const deliveryR = useReceipt<DeliveryDetails>();
  const inspectionR = useReceipt<{
    delivery: DeliveryForInspection;
    history: InspectionHistoryRecord[];
  }>();
  const iarR = useReceipt<{
    delivery: DeliveryForInspection;
    records: IarRecordRow[];
  }>();
  const parR = useReceipt<IssuanceDetail | null>();
  const icsR = useReceipt<IssuanceDetail | null>();
  const {
    selectedId: selectedDeliveryId,
    doc: deliveryDoc,
    docLoading: deliveryDocLoading,
  } = deliveryR;
  const {
    selectedId: selectedInspectionId,
    doc: inspectionDoc,
    docLoading: inspectionDocLoading,
  } = inspectionR;
  const { selectedId: selectedIarId, doc: iarDoc, docLoading: iarDocLoading } = iarR;
  const { selectedId: selectedParId, doc: parDoc, docLoading: parDocLoading } = parR;
  const { selectedId: selectedIcsId, doc: icsDoc, docLoading: icsDocLoading } = icsR;
  const [selectedStockId, setSelectedStockId] = useState<string | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectedRepairId, setSelectedRepairId] = useState<string | null>(null);

  const docKey = (type: string, id: string) => `${type}:${id}`;
  const isViewed = (type: string, id: string) => viewedKeys.has(docKey(type, id));

  // Oversight is read-only: track opened docs locally only, so admin viewing
  // never clears the unread state personnel see.
  function markViewed(type: string, id: string) {
    const key = docKey(type, id);
    if (viewedKeys.has(key)) return;
    setViewedKeys((prev) => new Set(prev).add(key));
  }

  // Server already searched + paged each tab — these are identity aliases
  // keeping the section render code unchanged. The DB window IS the page.
  const deliveryRows = deliveries;
  const inspectionRows = inspections;
  const stockRows = stocks;
  const assetRows = assets;
  // Server returns completed repairs only (same as the old client filter).
  const completedRepairs = repairs;
  const iarRows = iars;
  const parRows = pars;
  const icsRows = icss;
  const repairRows = completedRepairs;

  function resetDocPages() {
    setPage(1);
  }

  // Server totals for the header counts (cheap, no row payloads).
  const counts: Record<Tab, number> = {
    delivery: countsData?.delivery ?? 0,
    inspection: countsData?.inspection ?? 0,
    stocks: countsData?.stocks ?? 0,
    assets: countsData?.assets ?? 0,
    repairs: countsData?.repairs ?? 0,
    iar: countsData?.iar ?? 0,
    par: countsData?.par ?? 0,
    ics: countsData?.ics ?? 0,
  };

  // Filtered total for the active tab comes from its page query; the pager
  // clamps to it and the window rows render directly.
  const pageCount = Math.max(1, Math.ceil(tabTotal / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);

  const searchPlaceholder: Record<Tab, string> = {
    delivery: "Search ref, supplier, PO, status…",
    inspection: "Search ref, supplier, PO, inspector, result…",
    stocks: "Search item, account code, location…",
    assets: "Search property no., category, description…",
    repairs: "Search asset, reporter, technician, issue…",
    iar: "Search IAR no., ref, supplier, inspector…",
    par: "Search PAR no., employee, item…",
    ics: "Search ICS no., employee, item…",
  };

  // Only inspected deliveries have a history receipt to show.
  const inspectedRows = useMemo(
    () => inspectionRows.filter((d) => d.inspection_status !== "pending"),
    [inspectionRows]
  );

  const deliveryPaging = { safePage, visible: deliveryRows };
  const inspectionPaging = { safePage, visible: inspectedRows };
  const stockPaging = { safePage, visible: stockRows };
  const assetPaging = { safePage, visible: assetRows };
  const repairPaging = { safePage, visible: repairRows };
  const iarPaging = { safePage, visible: iarRows };
  const parPaging = { safePage, visible: parRows };
  const icsPaging = { safePage, visible: icsRows };

  function openDeliveryReceipt(deliveryId: string) {
    markViewed("delivery", deliveryId);
    // Same cached-receipt pattern as personnel (admin-prefixed keys keep
    // per-role caches separate): reopening paints instantly, stale
    // revalidates silently, cold shows the spinner.
    deliveryR.open(deliveryId, `admin-delivery:${deliveryId}`, () =>
      browseDelivery(deliveryId).then((detail) => {
        if (!detail) throw new Error("Delivery not found.");
        return detail;
      })
    );
  }

  function openInspectionHistory(deliveryId: string) {
    markViewed("inspection", deliveryId);
    inspectionR.open(deliveryId, `admin-inspection:${deliveryId}`, () =>
      Promise.all([
        browseDeliveryForInspection(deliveryId),
        browseInspectionHistory(deliveryId),
      ]).then(([delivery, history]) => {
        if (!delivery) throw new Error("Delivery not found.");
        return { delivery, history };
      })
    );
  }

  function switchTab(t: Tab) {
    setTab(t);
    setQuery("");
    resetDocPages();
    deliveryR.close();
    inspectionR.close();
    setSelectedStockId(null);
    setSelectedAssetId(null);
    setSelectedRepairId(null);
    iarR.close();
    parR.close();
    icsR.close();
  }

  function openIarReport(row: BrowseIarReportRow) {
    markViewed("iar", row.id);
    iarR.open(row.id, `admin-iar:${row.id}`, () =>
      Promise.all([
        browseDeliveryForInspection(row.delivery_id),
        browseIarRecords(row.delivery_id),
      ]).then(([delivery, records]) => {
        if (!delivery) throw new Error("Delivery not found.");
        return { delivery, records };
      })
    );
  }

  const selectedIarRecord =
    iarDoc?.records.find((r) => r.id === selectedIarId) ??
    iarDoc?.records[0] ??
    null;

  function openParReport(row: BrowseIssuanceRow) {
    markViewed("par", row.id);
    parR.open(row.id, `admin-issuance:${row.id}`, () => browseIssuance(row.id));
  }

  function openIcsReport(row: BrowseIssuanceRow) {
    markViewed("ics", row.id);
    icsR.open(row.id, `admin-issuance:${row.id}`, () => browseIssuance(row.id));
  }

  const selectedStock = stocks.find((r) => r.id === selectedStockId) ?? null;
  const selectedAsset = assets.find((a) => a.id === selectedAssetId) ?? null;
  const selectedRepair =
    completedRepairs.find((r) => r.id === selectedRepairId) ?? null;

  // Cold for THIS tab (no rows stamped for it yet): the table region shows a
  // skeleton while header/tabs/search stay put. Warm refetches keep stale
  // rows visible. Tab switches revalidate silently via per-tab cache keys.
  const cold = loading && windowRows.length === 0;

  // Prefetch next page while the user views the current one (no flicker).
  useEffect(() => {
    if (!tabData || tabTotal <= page * pageSize) return;
    const nextKey = buildQueryKey({ module: 'super-admin', resource: 'documents', page: page + 1, pageSize, filters: { tab, q: debouncedQuery } });
    if (getClientCache(nextKey)) return;
    const t = setTimeout(() => {
      void getAdminDocumentsTabPage(tab as AdminDocumentsTab, { page: page + 1, q: debouncedQuery })
        .then((fresh) => setClientCache(nextKey, { ...fresh, _tab: tab }))
        .catch(() => {});
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, page, debouncedQuery, tabData]);

  if (cold && !countsData) {
    return <DocumentsLoading />;
  }

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Super Admin / Documents</p>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Documents</h1>
          <p className={styles.subtitle}>
            {tabTotal} of {counts[tab]}{" "}
            {counts[tab] === 1 ? "record" : "records"} shown · every document
            from all personnel
          </p>
        </div>
        <div className={styles.actions}>
          <div className={air.tabs} role="tablist" aria-label="Document types">
            {TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={tab === t.value}
                className={air.tab}
                data-active={tab === t.value}
                onClick={() => switchTab(t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Card className={styles.panel}>
        <div className={air.controls}>
          <Input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              resetDocPages();
            }}
            placeholder={searchPlaceholder[tab]}
            className={air.search}
            aria-label={`Search ${tab} documents`}
          />
        </div>

        {error ? (
          <div className={styles.emptyState} role="alert">
            <p className={styles.panelSub}>
              Failed to load documents. Please try again.
            </p>
          </div>
        ) : null}

        {tab === "delivery" &&
          (cold ? (
            <>
              <DataTableSkeleton
                headers={["Ref", "Supplier", "PO ref", "Date delivered", "Items", "Logged By", "Delivery", "Inspection", "Receipt"]}
                cols={9}
                label="Loading delivery documents"
              />
              <PagerSkeleton />
            </>
          ) : deliveryRows.length === 0 ? (
            <div className={styles.emptyState}>
              <p className={styles.panelSub}>
                No delivery receipts match your search.
              </p>
            </div>
          ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Ref</th>
                        <th>Supplier</th>
                        <th>PO ref</th>
                        <th>Date delivered</th>
                        <th>Items</th>
                        <th>Logged By</th>
                        <th>Delivery</th>
                        <th>Inspection</th>
                        <th>Receipt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deliveryPaging.visible.map((d) => (
                        <tr key={d.delivery_id}>
                          <td>{d.ref}</td>
                          <td>{d.supplier ?? "—"}</td>
                          <td>{d.po_reference ?? "—"}</td>
                          <td>{fmt(d.date_delivered)}</td>
                          <td>{d.item_count}</td>
                          <td>{d.logged_by ?? "—"}</td>
                          <td>
                            <span
                              className={styles.status}
                              data-tone={deliveryTone(d.delivery_status)}
                            >
                              {label(d.delivery_status)}
                            </span>
                          </td>
                          <td>
                            <span
                              className={styles.status}
                              data-tone={inspectionTone(
                                null,
                                d.inspection_status ?? "pending"
                              )}
                            >
                              {label(d.inspection_status)}
                            </span>
                          </td>
                          <td>
                            <button
                              type="button"
                              className={`${styles.inspectLinkSecondary} cursor-pointer`}
                              onClick={() => openDeliveryReceipt(d.delivery_id)}
                            >
                              {isViewed("delivery", d.delivery_id)
                                ? "✓ Viewed"
                                : "View receipt"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            {tab === "delivery" && deliveryRows.length > 0 ? (
              <Pagination
                id="admin-docs-delivery"
                total={tabTotal}
                page={deliveryPaging.safePage}
                onPageChange={setPage}
              />
            ) : null}

            <ReceiptOverlay
              open={selectedDeliveryId !== null}
              title="Delivery receipt"
              onClose={deliveryR.close}
            >
              {deliveryDocLoading ? (
                <ReceiptLoading label="Loading delivery receipt…" />
              ) : !deliveryDoc ? (
                <div className={styles.emptyState}>
                  <p className={styles.panelSub}>No delivery record found.</p>
                </div>
              ) : (
                <div className={receipt.receiptStack} style={{ maxWidth: "none" }}>
                  <DeliveryReceipt delivery={deliveryDoc} />
                </div>
              )}
            </ReceiptOverlay>

            {tab === "inspection" &&
              (cold ? (
                <>
                  <DataTableSkeleton
                    headers={["Delivery ref", "Supplier", "PO ref", "Inspector", "Logged By", "Date inspected", "Result", "History receipt"]}
                    cols={8}
                    label="Loading inspection documents"
                  />
                  <PagerSkeleton />
                </>
              ) : inspectedRows.length === 0 ? (
                <div className={styles.emptyState}>
                  <p className={styles.panelSub}>
                    No inspection history receipts match your search.
                  </p>
                </div>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Delivery ref</th>
                        <th>Supplier</th>
                        <th>PO ref</th>
                        <th>Inspector</th>
                        <th>Logged By</th>
                        <th>Date inspected</th>
                        <th>Result</th>
                        <th>History receipt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inspectionPaging.visible.map((d) => (
                        <tr key={d.delivery_id}>
                          <td>{d.delivery_ref}</td>
                          <td>{d.supplier ?? "—"}</td>
                          <td>{d.po_reference ?? "—"}</td>
                          <td>{d.inspector_name ?? "—"}</td>
                          <td>{d.logged_by ?? d.inspector_name ?? "—"}</td>
                          <td>{fmt(d.inspection_date)}</td>
                          <td>
                            <span
                              className={styles.status}
                              data-tone={inspectionTone(
                                d.result,
                                d.inspection_status
                              )}
                            >
                              {d.result ? label(d.result) : "—"}
                            </span>
                          </td>
                          <td>
                            <button
                              type="button"
                              className={`${styles.inspectLinkSecondary} cursor-pointer`}
                              onClick={() =>
                                openInspectionHistory(d.delivery_id)
                              }
                            >
                              {isViewed("inspection", d.delivery_id)
                                ? "✓ Viewed"
                                : "View receipt"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            {tab === "inspection" && inspectedRows.length > 0 ? (
              <Pagination
                id="admin-docs-inspection"
                total={tabTotal}
                page={inspectionPaging.safePage}
                onPageChange={setPage}
              />
            ) : null}

            <ReceiptOverlay
              open={selectedInspectionId !== null}
              title="Inspection history receipt"
              onClose={inspectionR.close}
            >
              {inspectionDocLoading ? (
                <ReceiptLoading label="Loading history receipt…" />
              ) : !inspectionDoc ? (
                <div className={styles.emptyState}>
                  <p className={styles.panelSub}>
                    No inspection record found for this delivery.
                  </p>
                </div>
              ) : inspectionDoc.history.length === 0 ? (
                <div className={styles.emptyState}>
                  <p className={styles.panelSub}>
                    No inspection records for this delivery yet.
                  </p>
                </div>
              ) : (
                <div className={receipt.receiptStack} style={{ maxWidth: "none" }}>
                  {inspectionDoc.history.map((record) => (
                    <InspectionReceipt
                      key={record.id}
                      delivery={inspectionDoc.delivery}
                      inspection={record}
                    />
                  ))}
                </div>
              )}
            </ReceiptOverlay>

            {tab === "stocks" &&
              (cold ? (
                <>
                  <DataTableSkeleton
                    headers={["Item", "Account code", "Quantity", "Unit", "Location", "Receipt"]}
                    cols={6}
                    label="Loading stock documents"
                  />
                  <PagerSkeleton />
                </>
              ) : stockRows.length === 0 ? (
                <div className={styles.emptyState}>
                  <p className={styles.panelSub}>
                    No stock records match your search.
                  </p>
                </div>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Account code</th>
                        <th>Quantity</th>
                        <th>Unit</th>
                        <th>Location</th>
                        <th>Receipt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stockPaging.visible.map((r) => (
                        <tr key={r.id}>
                          <td>{r.item_name}</td>
                          <td>{r.account_code ?? "—"}</td>
                          <td>{r.quantity}</td>
                          <td>{r.unit ?? "—"}</td>
                          <td>{r.location ?? "—"}</td>
                          <td>
                            <button
                              type="button"
                              className={`${styles.inspectLinkSecondary} cursor-pointer`}
                              onClick={() => {
                                setSelectedStockId(r.id);
                                markViewed("stock", r.id);
                              }}
                            >
                              {isViewed("stock", r.id)
                                ? "✓ Viewed"
                                : "View receipt"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            {tab === "stocks" && stockRows.length > 0 ? (
              <Pagination
                id="admin-docs-stocks"
                total={tabTotal}
                page={stockPaging.safePage}
                onPageChange={setPage}
              />
            ) : null}

            <ReceiptOverlay
              open={selectedStock !== null}
              title="Stock receipt"
              onClose={() => setSelectedStockId(null)}
            >
              {selectedStock ? (
                <div className={receipt.receiptStack} style={{ maxWidth: "none" }}>
                  <StockReceipt item={selectedStock} />
                </div>
              ) : null}
            </ReceiptOverlay>

            {tab === "assets" &&
              (cold ? (
                <>
                  <DataTableSkeleton
                    headers={["Property no.", "Account code", "Article", "Description", "Qty.", "Location", "Status", "Receipt", "Details"]}
                    cols={9}
                    label="Loading asset documents"
                  />
                  <PagerSkeleton />
                </>
              ) : assetRows.length === 0 ? (
                <div className={styles.emptyState}>
                  <p className={styles.panelSub}>
                    No asset records match your search.
                  </p>
                </div>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Property no.</th>
                        <th>Account code</th>
                        <th>Article</th>
                        <th>Description</th>
                        <th>Qty.</th>
                        <th>Location</th>
                        <th>Status</th>
                        <th>Receipt</th>
                        <th>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assetPaging.visible.map((a) => (
                        <tr key={a.id}>
                          <td>{a.qr_code ?? "—"}</td>
                          <td>{a.account_code ?? "—"}</td>
                          <td>{label(a.article)}</td>
                          <td>{a.description ?? "—"}</td>
                          <td>{a.quantity ?? "—"}</td>
                          <td>{a.location ?? "—"}</td>
                          <td>
                            <span
                              className={styles.status}
                              data-tone={assetTone(a.status)}
                            >
                              {label(a.status)}
                            </span>
                          </td>
                          <td>
                            <button
                              type="button"
                              className={`${styles.inspectLinkSecondary} cursor-pointer`}
                              onClick={() => {
                                setSelectedAssetId(a.id);
                                markViewed("asset", a.id);
                              }}
                            >
                              {isViewed("asset", a.id)
                                ? "✓ Viewed"
                                : "View receipt"}
                            </button>
                          </td>
                          <td>
                            <Link
                              href={`/super-admin/assets/${a.id}`}
                              className={styles.inspectLinkSecondary}
                            >
                              See details
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            {tab === "assets" && assetRows.length > 0 ? (
              <Pagination
                id="admin-docs-assets"
                total={tabTotal}
                page={assetPaging.safePage}
                onPageChange={setPage}
              />
            ) : null}

            <ReceiptOverlay
              open={selectedAsset !== null}
              title="Asset receipt"
              onClose={() => setSelectedAssetId(null)}
            >
              {selectedAsset ? (
                <div className={receipt.receiptStack} style={{ maxWidth: "none" }}>
                  <AssetReceipt asset={selectedAsset} />
                </div>
              ) : null}
            </ReceiptOverlay>

            {tab === "repairs" &&
              (cold ? (
                <>
                  <DataTableSkeleton
                    headers={["Ticket", "Asset", "Reported by", "Logged By", "Technician", "Repair date", "Cost", "Status", "Receipt"]}
                    cols={9}
                    label="Loading repair documents"
                  />
                  <PagerSkeleton />
                </>
              ) : repairRows.length === 0 ? (
                <div className={styles.emptyState}>
                  <p className={styles.panelSub}>
                    {completedRepairs.length === 0
                      ? "No completed repairs yet — receipts appear here once a repair is completed."
                      : "No repair receipts match your search."}
                  </p>
                </div>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Ticket</th>
                        <th>Asset</th>
                        <th>Reported by</th>
                        <th>Logged By</th>
                        <th>Technician</th>
                        <th>Repair date</th>
                        <th>Cost</th>
                        <th>Status</th>
                        <th>Receipt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {repairPaging.visible.map((r) => (
                        <tr key={r.id}>
                          <td>{r.id.slice(0, 8).toUpperCase()}</td>
                          <td>{r.asset_label ?? "—"}</td>
                          <td>{r.reporter_name}</td>
                          <td>{r.reporter_name}</td>
                          <td>{r.technician ?? "Unassigned"}</td>
                          <td>{fmt(r.repair_date)}</td>
                          <td>{fmtCost(r.cost)}</td>
                          <td>
                            <span
                              className={styles.status}
                              data-tone={repairTone(r.status)}
                            >
                              {label(r.status)}
                            </span>
                          </td>
                          <td>
                            <button
                              type="button"
                              className={`${styles.inspectLinkSecondary} cursor-pointer`}
                              onClick={() => {
                                setSelectedRepairId(r.id);
                                markViewed("repair", r.id);
                              }}
                            >
                              {isViewed("repair", r.id)
                                ? "✓ Viewed"
                                : "View receipt"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            {tab === "repairs" && repairRows.length > 0 ? (
              <Pagination
                id="admin-docs-repairs"
                total={tabTotal}
                page={repairPaging.safePage}
                onPageChange={setPage}
              />
            ) : null}

            <ReceiptOverlay
              open={selectedRepair !== null}
              title="Repair receipt"
              onClose={() => setSelectedRepairId(null)}
            >
              {selectedRepair ? (
                <div className={receipt.receiptStack} style={{ maxWidth: "none" }}>
                  <RepairReceipt repair={selectedRepair} />
                </div>
              ) : null}
            </ReceiptOverlay>

            {tab === "iar" &&
              (cold ? (
                <>
                  <DataTableSkeleton
                    headers={["IAR no.", "Type", "Delivery ref", "Supplier", "Inspector", "Logged By", "Result", "Date inspected", "Generated", "Report"]}
                    cols={10}
                    label="Loading IAR documents"
                  />
                  <PagerSkeleton />
                </>
              ) : iarRows.length === 0 ? (
                <div className={styles.emptyState}>
                  <p className={styles.panelSub}>
                    No IAR reports generated yet.
                  </p>
                </div>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>IAR no.</th>
                        <th>Type</th>
                        <th>Delivery ref</th>
                        <th>Supplier</th>
                        <th>Inspector</th>
                        <th>Logged By</th>
                        <th>Result</th>
                        <th>Date inspected</th>
                        <th>Generated</th>
                        <th>Report</th>
                      </tr>
                    </thead>
                    <tbody>
                      {iarPaging.visible.map((r) => (
                        <tr key={r.id}>
                          <td>{r.iar_no ?? "Attached scan"}</td>
                          <td>
                            <span
                              className={styles.status}
                              data-tone={
                                r.kind === "attached" ? "info" : "ok"
                              }
                            >
                              {r.kind === "attached"
                                ? "Attached"
                                : "Generated"}
                            </span>
                          </td>
                          <td>{r.delivery_ref}</td>
                          <td>{r.supplier ?? "—"}</td>
                          <td>{r.inspector_name ?? "—"}</td>
                          <td>{r.logged_by ?? r.inspector_name ?? "—"}</td>
                          <td>
                            <span
                              className={styles.status}
                              data-tone={inspectionTone(
                                r.inspection_result,
                                r.inspection_result ?? "pending"
                              )}
                            >
                              {label(r.inspection_result)}
                            </span>
                          </td>
                          <td>{fmt(r.inspection_date)}</td>
                          <td>{fmt(r.created_at)}</td>
                          <td>
                            <button
                              type="button"
                              className={`${styles.inspectLinkSecondary} cursor-pointer`}
                              onClick={() => openIarReport(r)}
                            >
                              {isViewed("iar", r.id) ? "✓ Viewed" : "View IAR"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            {tab === "iar" && iarRows.length > 0 ? (
              <Pagination
                id="admin-docs-iar"
                total={tabTotal}
                page={iarPaging.safePage}
                onPageChange={setPage}
              />
            ) : null}

            <ReceiptOverlay
              open={selectedIarId !== null}
              title="Inspection and Acceptance Report"
              onClose={iarR.close}
            >
              {iarDocLoading ? (
                <ReceiptLoading label="Loading IAR report…" />
              ) : !iarDoc ? (
                <div className={styles.emptyState}>
                  <p className={styles.panelSub}>
                    This IAR record is no longer available.
                  </p>
                </div>
              ) : !selectedIarRecord ? (
                <div className={styles.emptyState}>
                  <p className={styles.panelSub}>
                    This IAR record is no longer available.
                  </p>
                </div>
              ) : (
                <div className={receipt.receiptStack} style={{ maxWidth: "none" }}>
                  <IarReportSheet
                    delivery={iarDoc.delivery}
                    record={selectedIarRecord}
                  />
                </div>
              )}
            </ReceiptOverlay>

            {tab === "par" &&
              (cold ? (
                <>
                  <DataTableSkeleton
                    headers={["PAR no.", "Employee", "Logged By", "Item", "Qty", "Total", "Date", "Generated", "Report", "Details"]}
                    cols={10}
                    label="Loading PAR documents"
                  />
                  <PagerSkeleton />
                </>
              ) : parRows.length === 0 ? (
                <div className={styles.emptyState}>
                  <p className={styles.panelSub}>
                    No PAR records yet — items valued over ₱50,000 appear here
                    once issued with a signed PAR.
                  </p>
                </div>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>PAR no.</th>
                        <th>Employee</th>
                        <th>Logged By</th>
                        <th>Item</th>
                        <th>Qty</th>
                        <th>Total</th>
                        <th>Date</th>
                        <th>Generated</th>
                        <th>Report</th>
                        <th>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parPaging.visible.map((r) => (
                        <tr key={r.id}>
                          <td>{r.doc_no ?? "Signed scan"}</td>
                          <td>{r.employee_name}</td>
                          <td>{r.logged_by ?? "—"}</td>
                          <td>{r.item_label}</td>
                          <td>{r.quantity}</td>
                          <td>{fmtCost(r.total_amount)}</td>
                          <td>{fmt(r.doc_date)}</td>
                          <td>{fmt(r.created_at)}</td>
                          <td>
                            <button
                              type="button"
                              className={`${styles.inspectLinkSecondary} cursor-pointer`}
                              onClick={() => openParReport(r)}
                            >
                              {isViewed("par", r.id) ? "✓ Viewed" : "View PAR"}
                            </button>
                          </td>
                          <td>
                            <Link
                              href={`/super-admin/issuances/${r.id}`}
                              className={styles.inspectLinkSecondary}
                            >
                              Open
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            {tab === "par" && parRows.length > 0 ? (
              <Pagination
                id="admin-docs-par"
                total={tabTotal}
                page={parPaging.safePage}
                onPageChange={setPage}
              />
            ) : null}

            <ReceiptOverlay
              open={selectedParId !== null}
              title="Property Acknowledgment Receipt"
              onClose={parR.close}
            >
              {parDocLoading ? (
                <ReceiptLoading label="Loading PAR report…" />
              ) : !parDoc ? (
                <div className={styles.emptyState}>
                  <p className={styles.panelSub}>
                    This record is no longer available.
                  </p>
                </div>
              ) : (
                <div className={receipt.receiptStack} style={{ maxWidth: "none" }}>
                  <ParReportSheet issuance={parDoc} />
                  <p className={styles.panelSub}>
                    <Link
                      href={`/super-admin/issuances/${parDoc.id}`}
                      className={styles.inspectLinkSecondary}
                    >
                      Open full report
                    </Link>{" "}
                    ·{" "}
                    <a
                      href={`/api/personnel/issuances/${parDoc.id}/par-xlsx`}
                      className={styles.inspectLinkSecondary}
                    >
                      Download Excel
                    </a>
                  </p>
                </div>
              )}
            </ReceiptOverlay>

            {tab === "ics" &&
              (cold ? (
                <>
                  <DataTableSkeleton
                    headers={["ICS no.", "Employee", "Logged By", "Item", "Qty", "Total", "Date", "Generated", "Report", "Details"]}
                    cols={10}
                    label="Loading ICS documents"
                  />
                  <PagerSkeleton />
                </>
              ) : icsRows.length === 0 ? (
                <div className={styles.emptyState}>
                  <p className={styles.panelSub}>
                    No ICS records yet — items valued at ₱50,000 or less appear
                    here once issued with a signed ICS.
                  </p>
                </div>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>ICS no.</th>
                        <th>Employee</th>
                        <th>Logged By</th>
                        <th>Item</th>
                        <th>Qty</th>
                        <th>Total</th>
                        <th>Date</th>
                        <th>Generated</th>
                        <th>Report</th>
                        <th>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {icsPaging.visible.map((r) => (
                        <tr key={r.id}>
                          <td>{r.doc_no ?? "Signed scan"}</td>
                          <td>{r.employee_name}</td>
                          <td>{r.logged_by ?? "—"}</td>
                          <td>{r.item_label}</td>
                          <td>{r.quantity}</td>
                          <td>{fmtCost(r.total_amount)}</td>
                          <td>{fmt(r.doc_date)}</td>
                          <td>{fmt(r.created_at)}</td>
                          <td>
                            <button
                              type="button"
                              className={`${styles.inspectLinkSecondary} cursor-pointer`}
                              onClick={() => openIcsReport(r)}
                            >
                              {isViewed("ics", r.id) ? "✓ Viewed" : "View ICS"}
                            </button>
                          </td>
                          <td>
                            <Link
                              href={`/super-admin/issuances/${r.id}`}
                              className={styles.inspectLinkSecondary}
                            >
                              Open
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            {tab === "ics" && icsRows.length > 0 ? (
              <Pagination
                id="admin-docs-ics"
                total={tabTotal}
                page={icsPaging.safePage}
                onPageChange={setPage}
              />
            ) : null}

            <ReceiptOverlay
              open={selectedIcsId !== null}
              title="Inventory Custodian Slip"
              onClose={icsR.close}
            >
              {icsDocLoading ? (
                <ReceiptLoading label="Loading ICS report…" />
              ) : !icsDoc ? (
                <div className={styles.emptyState}>
                  <p className={styles.panelSub}>
                    This record is no longer available.
                  </p>
                </div>
              ) : (
                <div className={receipt.receiptStack} style={{ maxWidth: "none" }}>
                  <IcsReportSheet issuance={icsDoc} />
                  <p className={styles.panelSub}>
                    <Link
                      href={`/super-admin/issuances/${icsDoc.id}`}
                      className={styles.inspectLinkSecondary}
                    >
                      Open full report
                    </Link>{" "}
                    ·{" "}
                    <a
                      href={`/api/personnel/issuances/${icsDoc.id}/ics-xlsx`}
                      className={styles.inspectLinkSecondary}
                    >
                      Download Excel
                    </a>
                  </p>
                </div>
              )}
            </ReceiptOverlay>
      </Card>
    </section>
  );
}
