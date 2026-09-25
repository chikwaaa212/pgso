"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  getDocumentsCounts,
  getDocumentsTabPage,
  getViewedDocKeys,
  markDocumentViewed,
  type DeliveryDocumentRow,
  type DocumentsTab,
  type IarReportRow,
} from "./actions";
import type { UnifiedInspectionRow } from "../inspections/actions";
import type { InventoryRow } from "../inventory/actions";
import type { UnifiedAssetRow } from "../assets/actions";
import type { RepairRow } from "../repairs/actions";
import {
  getIssuance,
  type IssuanceRecordRow,
  type IssuanceDetail,
} from "../issuances/actions";
import {
  getDeliveryForInspection,
  getInspectionHistory,
  getIarRecords,
  type DeliveryForInspection,
  type InspectionHistoryRecord,
  type IarRecordRow,
} from "../inspections/actions";
import { InspectionReceipt } from "../inspections/components/inspection-receipt";
import { StockReceipt } from "../inventory/stock-receipt";
import { AssetReceipt } from "../assets/asset-receipt";
import { RepairReceipt } from "../repairs/repair-receipt";
import { DeliveryReceipt } from "../deliveries/[id]/delivery-receipt";
import {
  getDeliveryDetails,
  type DeliveryDetails,
} from "../deliveries/actions";
import { IarReportSheet } from "./iar-report";
import { ParReportSheet } from "./par-report";
import { IcsReportSheet } from "./ics-report";
import { ReceiptOverlay } from "./receipt-overlay";
import receipt from "../inspections/components/receipt.module.css";
import { TablePager, FIXED_PAGE_SIZE } from "@/components/personnel/TablePager";
import { ReceiptLoading } from "@/components/personnel/ReceiptLoading";
import { useCachedAction } from "@/hooks/use-cached-action";
import {
  CLIENT_CACHE_KEYS,
  bustClientCache,
} from "@/lib/client-cache";
import { useReceipt } from "@/hooks/use-receipt";
import DocumentsLoading from "./loading";
import {
  DataTableSkeleton,
  PagerSkeleton,
} from "@/components/personnel/skeletons";
import styles from "../dashboard/page.module.css";
import air from "../inspections/air-section.module.css";

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

export default function PersonnelDocumentsPage() {
  return (
    <Suspense fallback={<DocumentsLoading />}>
      <PersonnelDocumentsContent />
    </Suspense>
  );
}

function PersonnelDocumentsContent() {
  const searchParams = useSearchParams();
  const initialTab = isTab(searchParams.get("tab"))
    ? (searchParams.get("tab") as Tab)
    : "delivery";

  const [tab, setTab] = useState<Tab>(initialTab);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 250);
  const searching = query.trim() !== debouncedQuery.trim();
  // Fixed 20 rows/page (no selector) — only the ACTIVE tab fetches, and the
  // DB returns just this window (was: all 8 tabs, unbounded, on every visit).
  const pageSize = FIXED_PAGE_SIZE;
  const [page, setPage] = useState(1);
  const {
    data: tabPayload,
    loading,
    isValidating,
  } = useCachedAction(
    `${CLIENT_CACHE_KEYS.documents}:${tab}:${page}:${debouncedQuery}`,
    () =>
      getDocumentsTabPage(tab as DocumentsTab, { page, q: debouncedQuery }).then(
        (res) => ({ ...res, _tab: tab })
      ),
    { staleTime: 30_000 }
  );
  // The hook keeps the previous key's payload while the new key loads.
  // Only trust rows/totals stamped for the CURRENT tab — otherwise a
  // delivery/stock payload would render (and crash, e.g. `r.id.slice`
  // on a delivery row) inside the repairs table during a tab switch.
  const tabData =
    tabPayload && tabPayload._tab === tab ? tabPayload : undefined;
  // Cheap per-tab totals for the header counts (no row payloads).
  const { data: countsData } = useCachedAction(
    `${CLIENT_CACHE_KEYS.documents}-counts`,
    getDocumentsCounts,
    { staleTime: 60_000 }
  );
  // Per-tab rows: only the active tab has data; the rest stay empty so
  // inactive sections (not rendered) cost nothing.
  const windowRows = useMemo(() => tabData?.rows ?? [], [tabData]);
  const tabTotal = tabData?.total ?? 0;
  const deliveries = useMemo(
    () => (tab === "delivery" ? (windowRows as DeliveryDocumentRow[]) : []),
    [tab, windowRows]
  );
  const inspections = useMemo(
    () => (tab === "inspection" ? (windowRows as UnifiedInspectionRow[]) : []),
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
    () => (tab === "iar" ? (windowRows as IarReportRow[]) : []),
    [tab, windowRows]
  );
  const iarRows = iars;
  const pars = useMemo(
    () => (tab === "par" ? (windowRows as IssuanceRecordRow[]) : []),
    [tab, windowRows]
  );
  const icss = useMemo(
    () => (tab === "ics" ? (windowRows as IssuanceRecordRow[]) : []),
    [tab, windowRows]
  );
  const { data: viewedKeysData } = useCachedAction(
    `${CLIENT_CACHE_KEYS.documents}-viewed`,
    getViewedDocKeys,
    { staleTime: 30_000 }
  );
  const [viewedKeys, setViewedKeys] = useState<Set<string>>(new Set());
  // Sync viewed keys after hydration (local marks apply instantly via
  // markViewed below; the server copy wins on refetch).
  useEffect(() => {
    if (viewedKeysData) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional post-hydration sync of cached state
      setViewedKeys(new Set(viewedKeysData));
    }
  }, [viewedKeysData]);
  const inspectionR = useReceipt<{
    delivery: DeliveryForInspection;
    history: InspectionHistoryRecord[];
  }>();
  const deliveryR = useReceipt<DeliveryDetails>();
  const iarR = useReceipt<{
    delivery: DeliveryForInspection;
    records: IarRecordRow[];
  }>();
  const parR = useReceipt<IssuanceDetail | null>();
  const icsR = useReceipt<IssuanceDetail | null>();
  const {
    selectedId: selectedInspectionId,
    doc: inspectionDoc,
    docLoading: inspectionDocLoading,
  } = inspectionR;
  const {
    selectedId: selectedDeliveryId,
    doc: deliveryDoc,
    docLoading: deliveryDocLoading,
  } = deliveryR;
  const { selectedId: selectedIarId, doc: iarDoc, docLoading: iarDocLoading } = iarR;
  const { selectedId: selectedParId, doc: parDoc, docLoading: parDocLoading } = parR;
  const { selectedId: selectedIcsId, doc: icsDoc, docLoading: icsDocLoading } = icsR;
  const [selectedStockId, setSelectedStockId] = useState<string | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectedRepairId, setSelectedRepairId] = useState<string | null>(null);

  const docKey = (type: string, id: string) => `${type}:${id}`;
  const isViewed = (type: string, id: string) => viewedKeys.has(docKey(type, id));

  function markViewed(type: string, id: string) {
    const key = docKey(type, id);
    if (viewedKeys.has(key)) return;
    setViewedKeys((prev) => new Set(prev).add(key));
    // Viewing changes the dashboard "Open Documents" count — drop its
    // snapshot so its next visit refetches instead of serving stale counts.
    // Targeted client bust only (was full router.refresh() reloading the
    // entire documents snapshot on every receipt open).
    bustClientCache(CLIENT_CACHE_KEYS.dashboard);
    void markDocumentViewed(type, id).catch(() => {});
  }

  // Server already searched + paged each tab — these are identity aliases
  // keeping the section render code unchanged. The DB window IS the page.
  const deliveryRows = deliveries;
  const inspectionRows = inspections;
  const stockRows = stocks;
  const assetRows = assets;
  // Server returns completed repairs only (same as the old client filter).
  const completedRepairs = repairs;
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

  // Only inspected deliveries have a history receipt to show (the server
  // already excludes pending for this tab — belt and suspenders).
  const inspectedRows = useMemo(
    () => inspectionRows.filter((d) => d.inspection_status !== "pending"),
    [inspectionRows]
  );

  // One shared server pager: the DB window IS the visible page. Aliases
  // keep each tab's render code typed and unchanged.
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
    deliveryR.open(deliveryId, `delivery:${deliveryId}`, () =>
      getDeliveryDetails(deliveryId)
    );
  }

  function openInspectionHistory(deliveryId: string) {
    markViewed("inspection", deliveryId);
    inspectionR.open(deliveryId, `inspection:${deliveryId}`, () =>
      Promise.all([
        getDeliveryForInspection(deliveryId),
        getInspectionHistory(deliveryId),
      ]).then(([delivery, history]) => ({ delivery, history }))
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

  function openIarReport(row: IarReportRow) {
    markViewed("iar", row.id);
    iarR.open(row.id, `iar:${row.id}`, () =>
      Promise.all([
        getDeliveryForInspection(row.delivery_id),
        getIarRecords(row.delivery_id),
      ]).then(([delivery, records]) => ({ delivery, records }))
    );
  }

  const selectedIarRecord =
    iarDoc?.records.find((r) => r.id === selectedIarId) ??
    iarDoc?.records[0] ??
    null;

  function openParReport(row: IssuanceRecordRow) {
    markViewed("par", row.id);
    parR.open(row.id, `issuance:${row.id}`, () => getIssuance(row.id));
  }

  function openIcsReport(row: IssuanceRecordRow) {
    markViewed("ics", row.id);
    icsR.open(row.id, `issuance:${row.id}`, () => getIssuance(row.id));
  }

  const selectedStock = stocks.find((r) => r.id === selectedStockId) ?? null;
  const selectedAsset = assets.find((a) => a.id === selectedAssetId) ?? null;
  const selectedRepair =
    completedRepairs.find((r) => r.id === selectedRepairId) ?? null;

  // Cold for THIS tab (no rows stamped for it yet): the table region
  // below shows a table skeleton while header/tabs/search stay put.
  // Warm refetches keep stale rows visible with an "updating…" badge.
  const cold = loading && windowRows.length === 0;

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Personnel / Documents</p>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Documents</h1>
          <p className={styles.subtitle}>
            {cold ? (
              <span
                className="mt-1 block h-4 w-48 animate-pulse rounded bg-navy-100"
                aria-hidden="true"
              />
            ) : (
              <>
                {tabTotal} of {counts[tab]}{" "}
                {counts[tab] === 1 ? "record" : "records"} shown
                {(isValidating || searching || loading) ? " · updating…" : ""}
              </>
            )}
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

        <>
          {tab === "delivery" &&
              (cold ? (
                <>
                  <DataTableSkeleton
                    headers={["Ref", "Supplier", "PO ref", "Date delivered", "Items", "Delivery", "Inspection", "Receipt"]}
                    cols={8}
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
                        <th>Delivery</th>
                        <th>Inspection</th>
                        <th>Receipt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deliveryPaging.visible.map((d, i) => (
                        <tr key={`${d.delivery_id}-${i}`}>
                          <td>{d.ref}</td>
                          <td>{d.supplier ?? "—"}</td>
                          <td>{d.po_reference ?? "—"}</td>
                          <td>{fmt(d.date_delivered)}</td>
                          <td>{d.item_count}</td>
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
              <TablePager
                id="docs-delivery"
                total={tabTotal}
                page={safePage}
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
                  <p className={styles.panelSub}>
                    This record is no longer available.
                  </p>
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
                    headers={["Delivery ref", "Supplier", "PO ref", "Inspector", "Date inspected", "Result", "History receipt"]}
                    cols={7}
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
                        <th>Date inspected</th>
                        <th>Result</th>
                        <th>History receipt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inspectionPaging.visible.map((d, i) => (
                        <tr key={`${d.delivery_id}-${i}`}>
                          <td>{d.delivery_ref}</td>
                          <td>{d.supplier ?? "—"}</td>
                          <td>{d.po_reference ?? "—"}</td>
                          <td>{d.inspector_name ?? "—"}</td>
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
              <TablePager
                id="docs-inspection"
                total={tabTotal}
                page={safePage}
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
                    This record is no longer available.
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
                      {stockPaging.visible.map((r, i) => (
                        <tr key={`${r.id}-${i}`}>
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
            {tab === "stocks" && tabTotal > 0 ? (
              <TablePager
                id="docs-stocks"
                total={tabTotal}
                page={safePage}
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
                      {assetPaging.visible.map((a, i) => (
                        <tr key={`${a.id}-${i}`}>
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
                              href={`/personnel/assets/${a.id}`}
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
            {tab === "assets" && tabTotal > 0 ? (
              <TablePager
                id="docs-assets"
                total={tabTotal}
                page={safePage}
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
                    headers={["Ticket", "Asset", "Reported by", "Technician", "Repair date", "Cost", "Status", "Receipt"]}
                    cols={8}
                    label="Loading repair documents"
                  />
                  <PagerSkeleton />
                </>
              ) : repairRows.length === 0 ? (
                <div className={styles.emptyState}>
                  <p className={styles.panelSub}>
                    {tabTotal === 0
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
                        <th>Technician</th>
                        <th>Repair date</th>
                        <th>Cost</th>
                        <th>Status</th>
                        <th>Receipt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {repairPaging.visible.map((r, i) => (
                        <tr key={`${r.id}-${i}`}>
                          <td>{r.id ? r.id.slice(0, 8).toUpperCase() : "—"}</td>
                          <td>{r.asset_label ?? "—"}</td>
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
            {tab === "repairs" && tabTotal > 0 ? (
              <TablePager
                id="docs-repairs"
                total={tabTotal}
                page={safePage}
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
                    headers={["IAR no.", "Type", "Delivery ref", "Supplier", "Inspector", "Result", "Date inspected", "Generated", "Report"]}
                    cols={9}
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
                        <th>Result</th>
                        <th>Date inspected</th>
                        <th>Generated</th>
                        <th>Report</th>
                      </tr>
                    </thead>
                    <tbody>
                      {iarPaging.visible.map((r, i) => (
                        <tr key={`${r.id}-${i}`}>
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
            {tab === "iar" && tabTotal > 0 ? (
              <TablePager
                id="docs-iar"
                total={tabTotal}
                page={safePage}
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
                    This record is no longer available.
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
                    headers={["PAR no.", "Employee", "Item", "Qty", "Total", "Date", "Generated", "Report", "Details"]}
                    cols={9}
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
                      {parPaging.visible.map((r, i) => (
                        <tr key={`${r.id}-${i}`}>
                          <td>{r.doc_no ?? "Signed scan"}</td>
                          <td>{r.employee_name}</td>
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
                              href={`/personnel/issuances/${r.id}`}
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
            {tab === "par" && tabTotal > 0 ? (
              <TablePager
                id="docs-par"
                total={tabTotal}
                page={safePage}
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
                      href={`/personnel/issuances/${parDoc.id}`}
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
                    headers={["ICS no.", "Employee", "Item", "Qty", "Total", "Date", "Generated", "Report", "Details"]}
                    cols={9}
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
                      {icsPaging.visible.map((r, i) => (
                        <tr key={`${r.id}-${i}`}>
                          <td>{r.doc_no ?? "Signed scan"}</td>
                          <td>{r.employee_name}</td>
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
                              href={`/personnel/issuances/${r.id}`}
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
            {tab === "ics" && tabTotal > 0 ? (
              <TablePager
                id="docs-ics"
                total={tabTotal}
                page={safePage}
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
                      href={`/personnel/issuances/${icsDoc.id}`}
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
          </>
      </Card>
    </section>
  );
}
