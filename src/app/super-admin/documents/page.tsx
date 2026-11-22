"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
} from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Eye,
  EyeOff,
  FileStack,
  FileText,
  Info,
  PackageSearch,
  Search,
  TriangleAlert,
} from "lucide-react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { PAGE_SIZE, CACHE_TTL } from "@/lib/constants";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/personnel/PageHeader";
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
} from "../browse/actions";
import {
  getDocumentsCounts,
  markDocumentViewed,
  type DeliveryDocumentRow,
  type IarReportRow,
} from "@/app/personnel/documents/actions";
import type { UnifiedInspectionRow } from "@/app/personnel/inspections/actions";
import type { InventoryRow } from "@/app/personnel/stocks/actions";
import type { UnifiedAssetRow } from "@/app/personnel/assets/actions";
import type { RepairRow } from "@/app/personnel/repairs/actions";
import {
  type IssuanceRecordRow,
  type IssuanceDetail,
} from "@/app/personnel/issuances/actions";
import type { DeliveryDetails } from "@/app/personnel/deliveries/actions";
import type {
  DeliveryForInspection,
  InspectionHistoryRecord,
  IarRecordRow,
} from "@/app/personnel/inspections/actions";
import { InspectionReceipt } from "@/app/personnel/inspections/components/inspection-receipt";
import { StockReceipt } from "@/app/personnel/stocks/stock-receipt";
import { AssetReceipt } from "@/app/personnel/assets/asset-receipt";
import { RepairReceipt } from "@/app/personnel/repairs/repair-receipt";
import { DeliveryReceipt } from "@/app/personnel/deliveries/[id]/delivery-receipt";
import { IarReportSheet } from "@/app/personnel/documents/iar-report";
import { ParReportSheet } from "@/app/personnel/documents/par-report";
import { IcsReportSheet } from "@/app/personnel/documents/ics-report";
import { ReceiptOverlay } from "@/app/personnel/documents/receipt-overlay";
import receipt from "@/app/personnel/inspections/components/receipt.module.css";
import { TablePager } from "@/components/personnel/TablePager";
import { ReceiptLoading } from "@/components/personnel/ReceiptLoading";
import { EmptySearchState } from "@/components/personnel/EmptySearchState";
import { useCachedAction } from "@/hooks/use-cached-action";
import { buildQueryKey } from "@/lib/query-keys";
import { useReceipt } from "@/hooks/use-receipt";
import DocumentsLoading from "./loading";
import { DocumentsTableSkeleton } from "@/components/personnel/DocumentsTableSkeleton";
import stockStyles from "@/app/personnel/stocks/page.module.css";
import docs from "@/app/personnel/documents/page.module.css";

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

/** Viewed-receipt keys use the singular document type, not the tab id. */
const DOC_TYPE: Record<Tab, string> = {
  delivery: "delivery",
  inspection: "inspection",
  stocks: "stock",
  assets: "asset",
  repairs: "repair",
  iar: "iar",
  par: "par",
  ics: "ics",
};

const EMPTY_COPY: Record<Tab, string> = {
  delivery:
    "Delivery receipts appear here automatically once a delivery is logged.",
  inspection:
    "Inspection history receipts appear here once a delivery has been inspected.",
  stocks:
    "Stock receipts appear here automatically once a delivery passes inspection.",
  assets:
    "Asset receipts appear here once an asset delivery passes inspection or an asset is registered.",
  repairs:
    "Repair receipts appear here once a repair ticket is completed.",
  iar: "IAR reports appear here once an inspection report is generated or attached.",
  par: "PAR records appear here once items valued over ₱50,000 are issued.",
  ics: "ICS records appear here once items valued at ₱50,000 or less are issued.",
};

/** One plain-language sentence per tab so staff never have to guess what a
 *  document type means before opening it. */
const TAB_HELP: Record<Tab, string> = {
  delivery:
    "Proof that a supplier delivered items — includes the supplier, purchase order, and delivery status.",
  inspection:
    "What the inspector found after a delivery. Items either pass and go to stock, or are returned to the supplier.",
  stocks:
    "Items accepted into the stockroom after a passed inspection, with the quantity on hand.",
  assets:
    "Registered property. Each row carries the property number, description, and where the item is kept.",
  repairs:
    "Repair tickets for damaged items — who reported it, who fixed it, the cost, and the outcome.",
  iar: "The Inspection and Acceptance Report that supports a delivery.",
  par: "Property Acknowledgment Receipt — issued for property worth more than ₱50,000.",
  ics: "Inventory Custodian Slip — issued for property worth ₱50,000 or less.",
};

/**
 * The whole tab window is loaded once; search and paging stay local so
 * typing filters results on the same keystroke — no fetch, no debounce,
 * and never a stale page from a superseded request.
 */
const FETCH_LIMIT = 100;

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
  if (status === "complete" || status === "delivered") return "ok";
  if (status === "awaiting" || status === "partial") return "warn";
  if (status === "failed" || status === "returned") return "bad";
  if (!status) return "neutral";
  return "info";
}

function inspectionTone(result: string | null, inspectionStatus: string) {
  const status = (inspectionStatus ?? "").toLowerCase();
  const outcome = (result ?? status).toLowerCase();
  if (status === "pending") return "warn";
  if (outcome === "passed") return "ok";
  if (outcome === "failed") return "bad";
  if (outcome === "partial") return "warn";
  if (!outcome) return "neutral";
  return "info";
}

function assetTone(status: string | null) {
  const key = (status ?? "").trim().toLowerCase();
  if (key === "available") return "ok";
  if (key === "in use" || key === "assigned") return "info";
  if (key === "maintenance") return "warn";
  if (key === "retired" || key === "disposed") return "neutral";
  if (!key) return "neutral";
  return "info";
}

function repairTone(status: string | null) {
  const key = (status ?? "").trim().toLowerCase();
  if (key === "completed") return "ok";
  if (key === "in progress" || key === "in_progress") return "info";
  if (key === "pending") return "warn";
  return "neutral";
}

function fmtCost(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(value);
}

/** Local, case-insensitive match over any number of display fields. */
function filterBy<T>(
  rows: T[],
  query: string,
  pick: (row: T) => Array<string | number | null | undefined>
): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((row) =>
    pick(row).some(
      (value) => value != null && String(value).toLowerCase().includes(needle)
    )
  );
}

/**
 * Whole-row opener: one click (or Enter / Space) opens the receipt, matching
 * the Inspections list. Action cells stop propagation so their own button
 * never double-fires.
 */
function rowOpenProps(onOpen: () => void) {
  return {
    className: docs.clickableRow,
    tabIndex: 0,
    title: "Open this document",
    onClick: onOpen,
    onKeyDown: (event: KeyboardEvent<HTMLTableRowElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onOpen();
      }
    },
  } as const;
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
  // Only the URL write is debounced — the table reads `query` directly so
  // typing filters results on the same keystroke, with no fetch involved.
  const debouncedQuery = useDebouncedValue(query, 300);
  const pageSize = PAGE_SIZE;
  const [page, setPage] = useState(initialPage);
  // "Unviewed" narrows every tab to receipts that have not been opened yet.
  // It runs locally over the same in-memory window as search — no fetch.
  const [viewedFilter, setViewedFilter] = useState<"all" | "unviewed">("all");

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

  // URL persistence: page/search/tab survive reload + back-navigation.
  useEffect(() => {
    setUrl({
      tab: tab === "delivery" ? null : tab,
      page: page === 1 ? null : String(page),
      q: debouncedQuery || null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, page, debouncedQuery]);

  // One read per tab — the DB window is loaded once (no q). Search and
  // paging then run in memory exactly like the Stocks ledger and Assets
  // registry, so results are instant and never flash a stale page.
  const {
    data: tabPayload,
    loading,
    error,
  } = useCachedAction(
    buildQueryKey({
      module: "super-admin",
      resource: "documents",
      page: 1,
      pageSize: FETCH_LIMIT,
      filters: { tab },
    }),
    () =>
      getAdminDocumentsTabPage(tab as AdminDocumentsTab, {
        page: 1,
        pageSize: FETCH_LIMIT,
      }).then((res) => ({ ...res, _tab: tab })),
    { staleTime: CACHE_TTL.listsMs }
  );
  // The hook keeps the previous key's payload while the new key loads. Only
  // trust rows stamped for the CURRENT tab — otherwise a delivery payload
  // could render inside the repairs table during a tab switch.
  const tabData =
    tabPayload && tabPayload._tab === tab ? tabPayload : undefined;
  // Cheap per-tab totals for the tab count pills (no row payloads).
  const { data: countsData } = useCachedAction(
    buildQueryKey({ module: "super-admin", resource: "documents-counts" }),
    getDocumentsCounts,
    { staleTime: 60_000 }
  );

  const windowRows = useMemo(() => tabData?.rows ?? [], [tabData]);

  // Local filtering, per tab — every field a user could reasonably search.
  const deliveries = useMemo(
    () =>
      tab === "delivery"
        ? filterBy(windowRows as DeliveryDocumentRow[], query, (d) => [
            d.ref,
            d.supplier,
            d.po_reference,
            d.delivery_status,
            d.inspection_status,
            d.inspection_date,
            d.item_count,
          ])
        : [],
    [tab, windowRows, query]
  );
  const inspections = useMemo(
    () =>
      tab === "inspection"
        ? filterBy(windowRows as UnifiedInspectionRow[], query, (d) => [
            d.delivery_ref,
            d.supplier,
            d.po_reference,
            d.inspector_name,
            d.result,
            d.inspection_status,
            d.inspection_date,
            d.delivery_kind,
          ]).filter((d) => d.inspection_status !== "pending")
        : [],
    [tab, windowRows, query]
  );
  const stocks = useMemo(
    () =>
      tab === "stocks"
        ? filterBy(windowRows as InventoryRow[], query, (r) => [
            r.item_name,
            r.account_code,
            r.category,
            r.account_title,
            r.unit,
            r.location,
          ])
        : [],
    [tab, windowRows, query]
  );
  const assets = useMemo(
    () =>
      tab === "assets"
        ? filterBy(windowRows as UnifiedAssetRow[], query, (a) => [
            a.account_code,
            a.qr_code,
            a.category,
            a.account_title,
            a.account_name,
            a.identifier,
            a.article,
            a.description,
            a.location,
            a.unit,
            a.status,
            a.condition,
          ])
        : [],
    [tab, windowRows, query]
  );
  const repairs = useMemo(
    () =>
      tab === "repairs"
        ? filterBy(windowRows as RepairRow[], query, (r) => [
            r.id,
            r.asset_label,
            r.account_code,
            r.account_title,
            r.reporter_name,
            r.technician,
            r.description,
            r.status,
            r.repair_date,
          ])
        : [],
    [tab, windowRows, query]
  );
  const iars = useMemo(
    () =>
      tab === "iar"
        ? filterBy(windowRows as IarReportRow[], query, (r) => [
            r.iar_no,
            r.kind,
            r.delivery_ref,
            r.supplier,
            r.po_reference,
            r.inspector_name,
            r.inspection_result,
            r.inspection_date,
          ])
        : [],
    [tab, windowRows, query]
  );
  const issuances = useMemo(
    () =>
      tab === "par" || tab === "ics"
        ? filterBy(windowRows as IssuanceRecordRow[], query, (r) => [
            r.doc_no,
            r.employee_name,
            r.item_label,
            r.doc_date,
          ])
        : [],
    [tab, windowRows, query]
  );

  const { data: viewedKeysData } = useCachedAction(
    buildQueryKey({ module: "super-admin", resource: "documents-viewed" }),
    browseViewedDocKeys,
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
  const {
    selectedId: selectedIarId,
    doc: iarDoc,
    docLoading: iarDocLoading,
  } = iarR;
  const {
    selectedId: selectedParId,
    doc: parDoc,
    docLoading: parDocLoading,
  } = parR;
  const {
    selectedId: selectedIcsId,
    doc: icsDoc,
    docLoading: icsDocLoading,
  } = icsR;
  const [selectedStockId, setSelectedStockId] = useState<string | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectedRepairId, setSelectedRepairId] = useState<string | null>(null);

  const docKey = (type: string, id: string) => `${type}:${id}`;
  const isViewed = (type: string, id: string) => viewedKeys.has(docKey(type, id));

  function markViewed(type: string, id: string) {
    const key = docKey(type, id);
    if (viewedKeys.has(key)) return;
    setViewedKeys((prev) => new Set(prev).add(key));
    void markDocumentViewed(type, id).catch(() => {});
  }

  function resetPage() {
    setPage(1);
  }

  // Server totals for the tab count pills (cheap, no row payloads).
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
  const totalDocuments = Object.values(counts).reduce((sum, n) => sum + n, 0);

  // Stable identity per tab, shared by the viewed filter and the unviewed count.
  const rowId = (t: Tab, row: unknown): string => {
    switch (t) {
      case "delivery":
      case "inspection":
        return (row as { delivery_id: string }).delivery_id;
      default:
        return (row as { id: string }).id;
    }
  };

  // "Unviewed" narrows the already-searched in-memory rows — no fetch, no
  // stale page: the same visible list is refiltered on the next render.
  const byViewed = <T,>(rows: T[]): T[] =>
    viewedFilter === "all"
      ? rows
      : rows.filter((row) => !isViewed(DOC_TYPE[tab], rowId(tab, row)));

  const deliveryRows = byViewed(deliveries);
  const inspectionRows = byViewed(inspections);
  const stockRows = byViewed(stocks);
  const assetRows = byViewed(assets);
  const repairRows = byViewed(repairs);
  const iarRows = byViewed(iars);
  const issuanceRows = byViewed(issuances);

  // The filtered window drives the visible page. No server paging here —
  // one request per tab, everything else is instant and local.
  const activeTotal =
    tab === "delivery"
      ? deliveryRows.length
      : tab === "inspection"
        ? inspectionRows.length
        : tab === "stocks"
          ? stockRows.length
          : tab === "assets"
            ? assetRows.length
            : tab === "repairs"
              ? repairRows.length
              : tab === "iar"
                ? iarRows.length
                : issuanceRows.length;
  const pageCount = Math.max(1, Math.ceil(activeTotal / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const start = (safePage - 1) * pageSize;
  const end = start + pageSize;

  const deliveryVisible = deliveryRows.slice(start, end);
  const inspectionVisible = inspectionRows.slice(start, end);
  const stockVisible = stockRows.slice(start, end);
  const assetVisible = assetRows.slice(start, end);
  const repairVisible = repairRows.slice(start, end);
  const iarVisible = iarRows.slice(start, end);
  const issuanceVisible = issuanceRows.slice(start, end);

  const hasQuery = query.trim() !== "";
  const hasFilters = hasQuery || viewedFilter !== "all";
  const tabLabel = TABS.find((t) => t.value === tab)?.label ?? "Document";
  const activeDocType = DOC_TYPE[tab];

  const unviewedInWindow = tabData
    ? windowRows.filter((row) => !isViewed(activeDocType, rowId(tab, row)))
        .length
    : 0;

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

  function clearFilters() {
    setQuery("");
    setViewedFilter("all");
    setPage(1);
  }

  function openDeliveryReceipt(deliveryId: string) {
    markViewed("delivery", deliveryId);
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

  function openStockReceipt(id: string) {
    markViewed("stock", id);
    setSelectedStockId(id);
  }

  function openAssetReceipt(id: string) {
    markViewed("asset", id);
    setSelectedAssetId(id);
  }

  function openRepairReceipt(id: string) {
    markViewed("repair", id);
    setSelectedRepairId(id);
  }

  function switchTab(t: Tab) {
    setTab(t);
    setQuery("");
    setViewedFilter("all");
    resetPage();
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

  function openParReport(row: IssuanceRecordRow) {
    markViewed("par", row.id);
    parR.open(row.id, `admin-issuance:${row.id}`, () =>
      browseIssuance(row.id)
    );
  }

  function openIcsReport(row: IssuanceRecordRow) {
    markViewed("ics", row.id);
    icsR.open(row.id, `admin-issuance:${row.id}`, () =>
      browseIssuance(row.id)
    );
  }

  const selectedStock = stocks.find((r) => r.id === selectedStockId) ?? null;
  const selectedAsset = assets.find((a) => a.id === selectedAssetId) ?? null;
  const selectedRepair = repairs.find((r) => r.id === selectedRepairId) ?? null;

  // Cold start only: background refetches keep the loaded rows on screen
  // instead of flashing the skeleton (search is always instant and local).
  const coldLoading = loading && windowRows.length === 0;

  return (
    <section className={docs.section}>
      <PageHeader
        eyebrow="Document library"
        title="Documents"
        subtitle={
          <>
            Every receipt and report in one place. Pick a type below, then click
            any row — or its <strong>Open</strong> button — to read or print the
            document.
          </>
        }
        meta={`${countsData ? totalDocuments.toLocaleString("en-PH") : "—"} document${
          totalDocuments === 1 ? "" : "s"
        } across ${TABS.length} types`}
      />

      <div className={docs.tipStrip}>
        <span className={docs.tipIcon}>
          <Info size={15} aria-hidden="true" />
        </span>
        <p className={docs.tipText}>
          <strong>New here?</strong> Documents are added automatically as work
          happens — logging a delivery, passing an inspection, issuing an item,
          or closing a repair. Nothing here needs to be uploaded by hand.
        </p>
      </div>

      <div className={stockStyles.summary}>
        <div className={stockStyles.summaryCard}>
          <span className={stockStyles.summaryIcon}>
            <FileStack size={16} aria-hidden="true" />
          </span>
          <div className={stockStyles.summaryBody}>
            <p className={stockStyles.summaryLabel}>Documents in library</p>
            <p className={stockStyles.summaryValue}>
              {countsData ? (
                totalDocuments
              ) : (
                <span className="block h-6 w-14 animate-pulse rounded bg-navy-100" />
              )}
            </p>
            <p className={stockStyles.summaryMeta}>
              Across all {TABS.length} document types
            </p>
          </div>
        </div>

        <div className={stockStyles.summaryCard}>
          <span className={stockStyles.summaryIcon}>
            <FileText size={16} aria-hidden="true" />
          </span>
          <div className={stockStyles.summaryBody}>
            <p className={stockStyles.summaryLabel}>{tabLabel} documents</p>
            <p className={stockStyles.summaryValue}>
              {countsData ? (
                counts[tab]
              ) : (
                <span className="block h-6 w-14 animate-pulse rounded bg-navy-100" />
              )}
            </p>
            <p className={stockStyles.summaryMeta}>In the active tab</p>
          </div>
        </div>

        {/* Doubles as a filter: press it to show only receipts not opened yet. */}
        <button
          type="button"
          className={`${stockStyles.summaryCard} ${docs.summaryButton}`}
          data-tone={unviewedInWindow > 0 ? "warn" : undefined}
          aria-pressed={viewedFilter === "unviewed"}
          title={
            viewedFilter === "unviewed"
              ? "Show all documents"
              : "Show only documents that have not been opened"
          }
          onClick={() => {
            setViewedFilter((prev) =>
              prev === "unviewed" ? "all" : "unviewed"
            );
            resetPage();
          }}
        >
          <span className={stockStyles.summaryIcon}>
            <EyeOff size={16} aria-hidden="true" />
          </span>
          <div className={stockStyles.summaryBody}>
            <p className={stockStyles.summaryLabel}>Unviewed receipts</p>
            <p className={stockStyles.summaryValue}>
              {tabData && !coldLoading ? (
                unviewedInWindow
              ) : (
                <span className="block h-6 w-14 animate-pulse rounded bg-navy-100" />
              )}
            </p>
            <p className={stockStyles.summaryMeta}>
              {viewedFilter === "unviewed"
                ? "Filtering to unviewed · press to show all"
                : `In ${tabLabel.toLowerCase()} · press to filter`}
            </p>
          </div>
        </button>
      </div>

      <div className={docs.tabsRow}>
        <div className={docs.tabs} role="tablist" aria-label="Document types">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={tab === t.value}
              className={docs.tab}
              data-active={tab === t.value}
              onClick={() => switchTab(t.value)}
            >
              <span className={docs.tabLabel}>{t.label}</span>
              <span
                className={docs.tabCount}
                data-active={tab === t.value ? "true" : undefined}
                aria-hidden="true"
              >
                {counts[t.value]}
              </span>
            </button>
          ))}
        </div>
        <p className={docs.tabHelp}>
          <strong>{tabLabel}</strong> — {TAB_HELP[tab]}
        </p>
      </div>

      <Card className={stockStyles.panel}>
        <div className={stockStyles.toolbar}>
          <p
            className={stockStyles.toolbarInfo}
            aria-live="polite"
            aria-busy={coldLoading || undefined}
          >
            {coldLoading ? (
              <span
                role="status"
                aria-label="Loading documents"
                className="block h-3.5 w-44 animate-pulse rounded bg-navy-100"
              />
            ) : hasFilters ? (
              <>
                Showing <strong>{activeTotal}</strong> of {windowRows.length}{" "}
                {tabLabel.toLowerCase()} document
                {windowRows.length !== 1 ? "s" : ""}
                {viewedFilter === "unviewed" ? " · unviewed only" : ""}
              </>
            ) : (
              <>
                <strong>{activeTotal}</strong> {tabLabel.toLowerCase()} document
                {activeTotal !== 1 ? "s" : ""}
              </>
            )}
            {!coldLoading && tabData && counts[tab] > windowRows.length
              ? ` · first ${windowRows.length} loaded`
              : ""}
          </p>

          <div className={stockStyles.filters}>
            <div className={docs.searchWrap}>
              <Search size={14} aria-hidden="true" className={docs.searchIcon} />
              <Input
                type="search"
                value={query}
                onChange={(e) => {
                  // Local filter only — the tab window is already loaded, so
                  // results update on the same keystroke with no fetch.
                  setQuery(e.target.value);
                  resetPage();
                }}
                placeholder={searchPlaceholder[tab]}
                className={docs.search}
                aria-label={`Search ${tab} documents`}
              />
            </div>
            <div
              className={docs.viewToggle}
              role="group"
              aria-label="Filter documents by viewed state"
            >
              <button
                type="button"
                className={docs.viewToggleButton}
                data-active={viewedFilter === "all"}
                aria-pressed={viewedFilter === "all"}
                onClick={() => {
                  setViewedFilter("all");
                  resetPage();
                }}
              >
                All
              </button>
              <button
                type="button"
                className={docs.viewToggleButton}
                data-active={viewedFilter === "unviewed"}
                aria-pressed={viewedFilter === "unviewed"}
                onClick={() => {
                  setViewedFilter("unviewed");
                  resetPage();
                }}
              >
                Unviewed
                {unviewedInWindow > 0 ? (
                  <span className={docs.viewToggleCount}>
                    {unviewedInWindow}
                  </span>
                ) : null}
              </button>
            </div>
            {hasFilters ? (
              <button
                type="button"
                className={docs.clearButton}
                onClick={clearFilters}
              >
                Clear filters
              </button>
            ) : null}
          </div>
        </div>

        {error && !coldLoading ? (
          <div className={stockStyles.empty} role="alert">
            <span className={stockStyles.emptyIcon}>
              <TriangleAlert size={20} aria-hidden="true" />
            </span>
            <p className={stockStyles.emptyTitle}>Could not load documents</p>
            <p className={stockStyles.emptyText}>
              The documents service did not respond. Refresh the page to try
              again.
            </p>
          </div>
        ) : coldLoading ? (
          <DocumentsTableSkeleton
            tab={tab}
            label={`Loading ${tabLabel} documents`}
          />
        ) : activeTotal === 0 ? (
          hasFilters ? (
            <EmptySearchState
              title={
                viewedFilter === "unviewed" && !hasQuery
                  ? "Everything here has been viewed"
                  : undefined
              }
              description={
                viewedFilter === "unviewed" && !hasQuery
                  ? `All ${tabLabel.toLowerCase()} documents in this window have already been opened.`
                  : `Try a different search term for ${tabLabel.toLowerCase()} documents.`
              }
              onClear={clearFilters}
            />
          ) : (
            <div className={stockStyles.empty}>
              <span className={stockStyles.emptyIcon}>
                <PackageSearch size={20} aria-hidden="true" />
              </span>
              <p className={stockStyles.emptyTitle}>
                No {tabLabel.toLowerCase()} documents yet
              </p>
              <p className={stockStyles.emptyText}>{EMPTY_COPY[tab]}</p>
            </div>
          )
        ) : (
          <>
            {tab === "delivery" ? (
              <div className={docs.tableWrap}>
                <table className={docs.table}>
                  <thead>
                    <tr>
                      <th>Reference no.</th>
                      <th>Supplier</th>
                      <th>Purchase order</th>
                      <th>Date inspected</th>
                      <th>Items</th>
                      <th>Delivery status</th>
                      <th>Inspection status</th>
                      <th className={docs.actionHead}>Document</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deliveryVisible.map((d, i) => (
                      <tr
                        key={`${d.delivery_id}-${i}`}
                        {...rowOpenProps(() =>
                          openDeliveryReceipt(d.delivery_id)
                        )}
                      >
                        <td>
                          <span className={docs.mono}>{d.ref}</span>
                        </td>
                        <td>{d.supplier ?? "—"}</td>
                        <td>{d.po_reference ?? "—"}</td>
                        <td>
                          {d.inspection_date ? (
                            fmt(d.inspection_date)
                          ) : (
                            <span className={docs.muted}>Not yet inspected</span>
                          )}
                        </td>
                        <td className={docs.num}>{d.item_count}</td>
                        <td>
                          <span
                            className={stockStyles.badge}
                            data-tone={deliveryTone(d.delivery_status)}
                          >
                            {label(d.delivery_status)}
                          </span>
                        </td>
                        <td>
                          <span
                            className={stockStyles.badge}
                            data-tone={inspectionTone(
                              null,
                              d.inspection_status ?? "pending"
                            )}
                          >
                            {label(d.inspection_status)}
                          </span>
                        </td>
                        <td
                          className={docs.actionCell}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className={docs.rowAction}
                            onClick={() => openDeliveryReceipt(d.delivery_id)}
                          >
                            <Eye size={14} aria-hidden="true" />
                            {isViewed("delivery", d.delivery_id)
                              ? "Reopen"
                              : "Open"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {tab === "inspection" ? (
              <div className={docs.tableWrap}>
                <table className={docs.table}>
                  <thead>
                    <tr>
                      <th>Delivery ref.</th>
                      <th>Supplier</th>
                      <th>Purchase order</th>
                      <th>Inspector</th>
                      <th>Date inspected</th>
                      <th>Result</th>
                      <th className={docs.actionHead}>Document</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inspectionVisible.map((d, i) => (
                      <tr
                        key={`${d.delivery_id}-${i}`}
                        {...rowOpenProps(() =>
                          openInspectionHistory(d.delivery_id)
                        )}
                      >
                        <td>
                          <span className={docs.mono}>{d.delivery_ref}</span>
                        </td>
                        <td>{d.supplier ?? "—"}</td>
                        <td>{d.po_reference ?? "—"}</td>
                        <td>{d.inspector_name ?? "—"}</td>
                        <td>{fmt(d.inspection_date)}</td>
                        <td>
                          <span
                            className={stockStyles.badge}
                            data-tone={inspectionTone(
                              d.result,
                              d.inspection_status
                            )}
                          >
                            {d.result ? label(d.result) : "Pending"}
                          </span>
                        </td>
                        <td
                          className={docs.actionCell}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className={docs.rowAction}
                            onClick={() =>
                              openInspectionHistory(d.delivery_id)
                            }
                          >
                            <Eye size={14} aria-hidden="true" />
                            {isViewed("inspection", d.delivery_id)
                              ? "Reopen"
                              : "Open"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {tab === "stocks" ? (
              <div className={docs.tableWrap}>
                <table className={docs.table}>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Account code</th>
                      <th>Quantity</th>
                      <th>Unit</th>
                      <th>Location</th>
                      <th className={docs.actionHead}>Document</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockVisible.map((r, i) => (
                      <tr
                        key={`${r.id}-${i}`}
                        {...rowOpenProps(() => openStockReceipt(r.id))}
                      >
                        <td>
                          <span className={docs.cellMain}>{r.item_name}</span>
                        </td>
                        <td>
                          {r.account_code ? (
                            <span className={docs.mono}>{r.account_code}</span>
                          ) : (
                            <span className={docs.muted}>—</span>
                          )}
                        </td>
                        <td className={docs.num}>{r.quantity}</td>
                        <td>{r.unit ?? "—"}</td>
                        <td>{r.location ?? "—"}</td>
                        <td
                          className={docs.actionCell}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className={docs.rowAction}
                            onClick={() => openStockReceipt(r.id)}
                          >
                            <Eye size={14} aria-hidden="true" />
                            {isViewed("stock", r.id) ? "Reopen" : "Open"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {tab === "assets" ? (
              <div className={docs.tableWrap}>
                <table className={docs.table}>
                  <thead>
                    <tr>
                      <th>Property no.</th>
                      <th>Account code</th>
                      <th>Article</th>
                      <th>Description</th>
                      <th>Qty.</th>
                      <th>Location</th>
                      <th>Status</th>
                      <th className={docs.actionHead}>Document</th>
                      <th className={docs.actionHead}>More</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assetVisible.map((a, i) => (
                      <tr
                        key={`${a.id}-${i}`}
                        {...rowOpenProps(() => openAssetReceipt(a.id))}
                      >
                        <td>
                          <span className={docs.mono}>{a.qr_code ?? "—"}</span>
                        </td>
                        <td>{a.account_code ?? "—"}</td>
                        <td>{label(a.article)}</td>
                        <td>
                          <span className={docs.cellStack}>
                            <span className={docs.cellMain}>
                              {a.description ?? "—"}
                            </span>
                          </span>
                        </td>
                        <td className={docs.num}>{a.quantity ?? "—"}</td>
                        <td>{a.location ?? "—"}</td>
                        <td>
                          <span
                            className={stockStyles.badge}
                            data-tone={assetTone(a.status)}
                          >
                            {label(a.status)}
                          </span>
                        </td>
                        <td
                          className={docs.actionCell}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className={docs.rowAction}
                            onClick={() => openAssetReceipt(a.id)}
                          >
                            <Eye size={14} aria-hidden="true" />
                            {isViewed("asset", a.id) ? "Reopen" : "Open"}
                          </button>
                        </td>
                        <td
                          className={docs.actionCell}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <Link
                            href={`/super-admin/assets/${a.id}`}
                            className={docs.rowActionMuted}
                          >
                            See details
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {tab === "repairs" ? (
              <div className={docs.tableWrap}>
                <table className={docs.table}>
                  <thead>
                    <tr>
                      <th>Ticket</th>
                      <th>Asset</th>
                      <th>Reported by</th>
                      <th>Technician</th>
                      <th>Repair date</th>
                      <th>Cost</th>
                      <th>Status</th>
                      <th className={docs.actionHead}>Document</th>
                    </tr>
                  </thead>
                  <tbody>
                    {repairVisible.map((r, i) => (
                      <tr
                        key={`${r.id}-${i}`}
                        {...rowOpenProps(() => openRepairReceipt(r.id))}
                      >
                        <td>
                          <span className={docs.mono}>
                            {r.id ? r.id.slice(0, 8).toUpperCase() : "—"}
                          </span>
                        </td>
                        <td>{r.asset_label ?? "—"}</td>
                        <td>{r.reporter_name}</td>
                        <td>{r.technician ?? "Unassigned"}</td>
                        <td>{fmt(r.repair_date)}</td>
                        <td className={docs.num}>{fmtCost(r.cost)}</td>
                        <td>
                          <span
                            className={stockStyles.badge}
                            data-tone={repairTone(r.status)}
                          >
                            {label(r.status)}
                          </span>
                        </td>
                        <td
                          className={docs.actionCell}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className={docs.rowAction}
                            onClick={() => openRepairReceipt(r.id)}
                          >
                            <Eye size={14} aria-hidden="true" />
                            {isViewed("repair", r.id)
                              ? "Reopen"
                              : "Open"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {tab === "iar" ? (
              <div className={docs.tableWrap}>
                <table className={docs.table}>
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
                      <th className={docs.actionHead}>Report</th>
                    </tr>
                  </thead>
                  <tbody>
                    {iarVisible.map((r, i) => (
                      <tr
                        key={`${r.id}-${i}`}
                        {...rowOpenProps(() => openIarReport(r))}
                      >
                        <td>
                          <span className={docs.mono}>
                            {r.iar_no ?? "Attached scan"}
                          </span>
                        </td>
                        <td>
                          <span
                            className={stockStyles.badge}
                            data-tone={r.kind === "attached" ? "info" : "ok"}
                          >
                            {r.kind === "attached" ? "Attached" : "Generated"}
                          </span>
                        </td>
                        <td>{r.delivery_ref}</td>
                        <td>{r.supplier ?? "—"}</td>
                        <td>{r.inspector_name ?? "—"}</td>
                        <td>
                          <span
                            className={stockStyles.badge}
                            data-tone={inspectionTone(
                              r.inspection_result,
                              r.inspection_result ?? ""
                            )}
                          >
                            {label(r.inspection_result)}
                          </span>
                        </td>
                        <td>{fmt(r.inspection_date)}</td>
                        <td>{fmt(r.created_at)}</td>
                        <td
                          className={docs.actionCell}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className={docs.rowAction}
                            onClick={() => openIarReport(r)}
                          >
                            <Eye size={14} aria-hidden="true" />
                            {isViewed("iar", r.id) ? "Reopen" : "Open IAR"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {tab === "par" || tab === "ics" ? (
              <div className={docs.tableWrap}>
                <table className={docs.table}>
                  <thead>
                    <tr>
                      <th>Document no.</th>
                      <th>Employee</th>
                      <th>Item</th>
                      <th>Qty</th>
                      <th>Total</th>
                      <th>Date</th>
                      <th>Generated</th>
                      <th className={docs.actionHead}>Report</th>
                      <th className={docs.actionHead}>More</th>
                    </tr>
                  </thead>
                  <tbody>
                    {issuanceVisible.map((r, i) => (
                      <tr
                        key={`${r.id}-${i}`}
                        {...rowOpenProps(() =>
                          tab === "par" ? openParReport(r) : openIcsReport(r)
                        )}
                      >
                        <td>
                          <span className={docs.mono}>
                            {r.doc_no ?? "Signed scan"}
                          </span>
                        </td>
                        <td>{r.employee_name}</td>
                        <td>{r.item_label}</td>
                        <td className={docs.num}>{r.quantity}</td>
                        <td className={docs.num}>{fmtCost(r.total_amount)}</td>
                        <td>{fmt(r.doc_date)}</td>
                        <td>{fmt(r.created_at)}</td>
                        <td
                          className={docs.actionCell}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className={docs.rowAction}
                            onClick={() =>
                              tab === "par"
                                ? openParReport(r)
                                : openIcsReport(r)
                            }
                          >
                            <Eye size={14} aria-hidden="true" />
                            {isViewed(activeDocType, r.id)
                              ? "Reopen"
                              : `Open ${r.doc_type}`}
                          </button>
                        </td>
                        <td
                          className={docs.actionCell}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <Link
                            href={`/super-admin/issuances/${r.id}`}
                            className={docs.rowActionMuted}
                          >
                            Open
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            <div className={stockStyles.footer}>
              {activeTotal > pageSize ? (
                <TablePager
                  id={`admin-docs-${tab}`}
                  total={activeTotal}
                  page={safePage}
                  onPageChange={setPage}
                />
              ) : (
                <span className={stockStyles.footerInfo}>
                  Showing all {activeTotal} {tabLabel.toLowerCase()} document
                  {activeTotal !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </>
        )}

        <ReceiptOverlay
          open={selectedDeliveryId !== null}
          title="Delivery receipt"
          onClose={deliveryR.close}
        >
          {deliveryDocLoading ? (
            <ReceiptLoading label="Loading delivery receipt…" />
          ) : !deliveryDoc ? (
            <div className={stockStyles.empty}>
              <p className={stockStyles.emptyText}>
                This record is no longer available.
              </p>
            </div>
          ) : (
            <div className={receipt.receiptStack} style={{ maxWidth: "none" }}>
              <DeliveryReceipt delivery={deliveryDoc} />
            </div>
          )}
        </ReceiptOverlay>

        <ReceiptOverlay
          open={selectedInspectionId !== null}
          title="Inspection history receipt"
          onClose={inspectionR.close}
        >
          {inspectionDocLoading ? (
            <ReceiptLoading label="Loading history receipt…" />
          ) : !inspectionDoc ? (
            <div className={stockStyles.empty}>
              <p className={stockStyles.emptyText}>
                This record is no longer available.
              </p>
            </div>
          ) : inspectionDoc.history.length === 0 ? (
            <div className={stockStyles.empty}>
              <p className={stockStyles.emptyText}>
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

        <ReceiptOverlay
          open={selectedIarId !== null}
          title="Inspection and Acceptance Report"
          onClose={iarR.close}
          printable={!iarDocLoading && !!iarDoc && !!selectedIarRecord}
        >
          {iarDocLoading ? (
            <ReceiptLoading label="Loading IAR report…" />
          ) : !iarDoc ? (
            <div className={stockStyles.empty}>
              <p className={stockStyles.emptyText}>
                This record is no longer available.
              </p>
            </div>
          ) : !selectedIarRecord ? (
            <div className={stockStyles.empty}>
              <p className={stockStyles.emptyText}>
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

        <ReceiptOverlay
          open={selectedParId !== null}
          title="Property Acknowledgment Receipt"
          onClose={parR.close}
          printable={!parDocLoading && !!parDoc}
        >
          {parDocLoading ? (
            <ReceiptLoading label="Loading PAR report…" />
          ) : !parDoc ? (
            <div className={stockStyles.empty}>
              <p className={stockStyles.emptyText}>
                This record is no longer available.
              </p>
            </div>
          ) : (
            <div className={receipt.receiptStack} style={{ maxWidth: "none" }}>
              <ParReportSheet issuance={parDoc} />
              <p className={docs.note}>
                <Link
                  href={`/super-admin/issuances/${parDoc.id}`}
                  className={docs.rowActionMuted}
                >
                  Open full report
                </Link>{" "}
                ·{" "}
                <a
                  href={`/api/personnel/issuances/${parDoc.id}/par-xlsx`}
                  className={docs.rowActionMuted}
                >
                  Download Excel
                </a>
              </p>
            </div>
          )}
        </ReceiptOverlay>

        <ReceiptOverlay
          open={selectedIcsId !== null}
          title="Inventory Custodian Slip"
          onClose={icsR.close}
          printable={!icsDocLoading && !!icsDoc}
        >
          {icsDocLoading ? (
            <ReceiptLoading label="Loading ICS report…" />
          ) : !icsDoc ? (
            <div className={stockStyles.empty}>
              <p className={stockStyles.emptyText}>
                This record is no longer available.
              </p>
            </div>
          ) : (
            <div className={receipt.receiptStack} style={{ maxWidth: "none" }}>
              <IcsReportSheet issuance={icsDoc} />
              <p className={docs.note}>
                <Link
                  href={`/super-admin/issuances/${icsDoc.id}`}
                  className={docs.rowActionMuted}
                >
                  Open full report
                </Link>{" "}
                ·{" "}
                <a
                  href={`/api/personnel/issuances/${icsDoc.id}/ics-xlsx`}
                  className={docs.rowActionMuted}
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
