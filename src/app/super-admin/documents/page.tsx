"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  browseDeliveryDocuments,
  browseIarReports,
  browseViewedDocKeys,
  browseInspections,
  browseInventory,
  browseAssets,
  browseRepairs,
  browseParReports,
  browseIcsReports,
  browseDeliveryForInspection,
  browseInspectionHistory,
  browseIarRecords,
  browseIssuance,
  type BrowseDeliveryDocumentRow,
  type BrowseIarReportRow,
  type BrowseIssuanceRow,
} from "../browse/actions";
import type { IssuanceDetail } from "@/app/personnel/issuances/actions";
import type {
  UnifiedInspectionRow,
  DeliveryForInspection,
  InspectionHistoryRecord,
  IarRecordRow,
} from "@/app/personnel/inspections/actions";
import { InspectionReceipt } from "@/app/personnel/inspections/components/inspection-receipt";
import { StockReceipt } from "@/app/personnel/inventory/stock-receipt";
import { AssetReceipt } from "@/app/personnel/assets/asset-receipt";
import { RepairReceipt } from "@/app/personnel/repairs/repair-receipt";
import { IarReportSheet } from "@/app/personnel/documents/iar-report";
import { ParReportSheet } from "@/app/personnel/documents/par-report";
import { IcsReportSheet } from "@/app/personnel/documents/ics-report";
import { ReceiptOverlay } from "@/app/personnel/documents/receipt-overlay";
import receipt from "@/app/personnel/inspections/components/receipt.module.css";
import type { InventoryRow } from "@/app/personnel/inventory/actions";
import type { RepairRow } from "@/app/personnel/repairs/actions";
import type { UnifiedAssetRow } from "@/app/personnel/assets/actions";
import { TablePager } from "@/components/personnel/TablePager";
import { usePageSize } from "@/hooks/use-page-size";
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
  return status === "complete" ? "ok" : "warn";
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
    <Suspense
      fallback={
        <section className={styles.section}>
          <p className={styles.crumb}>Super Admin / Documents</p>
          <div className={styles.emptyState}>
            <p className={styles.panelSub}>Loading documents…</p>
          </div>
        </section>
      }
    >
      <SuperAdminDocumentsContent />
    </Suspense>
  );
}

function SuperAdminDocumentsContent() {
  const searchParams = useSearchParams();
  const initialTab = isTab(searchParams.get("tab"))
    ? (searchParams.get("tab") as Tab)
    : "delivery";

  const [tab, setTab] = useState<Tab>(initialTab);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [deliveries, setDeliveries] = useState<BrowseDeliveryDocumentRow[]>([]);
  const [inspections, setInspections] = useState<UnifiedInspectionRow[]>([]);
  const [stocks, setStocks] = useState<InventoryRow[]>([]);
  const [assets, setAssets] = useState<UnifiedAssetRow[]>([]);
  const [repairs, setRepairs] = useState<RepairRow[]>([]);
  const [iars, setIars] = useState<BrowseIarReportRow[]>([]);
  const [pars, setPars] = useState<BrowseIssuanceRow[]>([]);
  const [icss, setIcss] = useState<BrowseIssuanceRow[]>([]);
  const [viewedKeys, setViewedKeys] = useState<Set<string>>(new Set());
  const [selectedInspectionId, setSelectedInspectionId] = useState<string | null>(
    null
  );
  const [inspectionDoc, setInspectionDoc] = useState<{
    delivery: DeliveryForInspection;
    history: InspectionHistoryRecord[];
  } | null>(null);
  const [inspectionDocLoading, setInspectionDocLoading] = useState(false);
  const [selectedStockId, setSelectedStockId] = useState<string | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectedRepairId, setSelectedRepairId] = useState<string | null>(null);
  const [selectedIarId, setSelectedIarId] = useState<string | null>(null);
  const [iarDoc, setIarDoc] = useState<{
    delivery: DeliveryForInspection;
    records: IarRecordRow[];
  } | null>(null);
  const [iarDocLoading, setIarDocLoading] = useState(false);
  const [selectedParId, setSelectedParId] = useState<string | null>(null);
  const [parDoc, setParDoc] = useState<IssuanceDetail | null>(null);
  const [parDocLoading, setParDocLoading] = useState(false);
  const [selectedIcsId, setSelectedIcsId] = useState<string | null>(null);
  const [icsDoc, setIcsDoc] = useState<IssuanceDetail | null>(null);
  const [icsDocLoading, setIcsDocLoading] = useState(false);

  useEffect(() => {
    void Promise.all([
      browseDeliveryDocuments(),
      browseInspections(),
      browseInventory(),
      browseAssets(),
      browseRepairs(),
      browseIarReports(),
      browseParReports(),
      browseIcsReports(),
      browseViewedDocKeys(),
    ]).then(([d, i, s, a, rep, r, p, c, v]) => {
      setDeliveries(d);
      setInspections(i);
      setStocks(s);
      setAssets(a);
      setRepairs(rep);
      setIars(r);
      setPars(p);
      setIcss(c);
      setViewedKeys(new Set(v));
      setLoading(false);
    });
  }, []);

  const docKey = (type: string, id: string) => `${type}:${id}`;
  const isViewed = (type: string, id: string) => viewedKeys.has(docKey(type, id));

  // Oversight is read-only: track opened docs locally only, so admin viewing
  // never clears the unread state personnel see.
  function markViewed(type: string, id: string) {
    const key = docKey(type, id);
    if (viewedKeys.has(key)) return;
    setViewedKeys((prev) => new Set(prev).add(key));
  }

  const q = query.trim().toLowerCase();
  const hay = (parts: (string | null | undefined)[]) =>
    parts.filter(Boolean).join(" ").toLowerCase().includes(q);

  const deliveryRows = useMemo(
    () =>
      q === ""
        ? deliveries
        : deliveries.filter((d) =>
            hay([
              d.ref,
              d.supplier,
              d.po_reference,
              d.delivery_status,
              d.inspection_status,
              d.logged_by,
            ])
          ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deliveries, query]
  );

  const inspectionRows = useMemo(
    () =>
      q === ""
        ? inspections
        : inspections.filter((d) =>
            hay([
              d.delivery_ref,
              d.supplier,
              d.po_reference,
              d.inspector_name,
              d.result,
              d.inspection_status,
              d.logged_by,
            ])
          ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inspections, query]
  );

  const stockRows = useMemo(
    () =>
      q === ""
        ? stocks
        : stocks.filter((r) =>
            hay([r.item_name, r.account_code, r.location, r.unit])
          ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stocks, query]
  );

  const assetRows = useMemo(
    () =>
      q === ""
        ? assets
        : assets.filter((a) =>
            hay([
              a.account_code,
              a.qr_code,
              a.category,
              a.article,
              a.description,
              a.location,
              a.status,
            ])
          ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assets, query]
  );

  const iarRows = useMemo(
    () =>
      q === ""
        ? iars
        : iars.filter((r) =>
            hay([
              r.iar_no,
              r.delivery_ref,
              r.supplier,
              r.po_reference,
              r.inspector_name,
              r.inspection_result,
              r.kind,
              r.logged_by,
            ])
          ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [iars, query]
  );

  const completedRepairs = useMemo(
    () => repairs.filter((r) => r.status === "completed"),
    [repairs]
  );

  const issuanceHay = (r: BrowseIssuanceRow) =>
    hay([r.doc_no, r.employee_name, r.item_label, r.doc_type, r.logged_by]);

  const parRows = useMemo(
    () => (q === "" ? pars : pars.filter(issuanceHay)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pars, query]
  );

  const icsRows = useMemo(
    () => (q === "" ? icss : icss.filter(issuanceHay)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [icss, query]
  );

  const repairRows = useMemo(
    () =>
      q === ""
        ? completedRepairs
        : completedRepairs.filter((r) =>
            hay([
              r.asset_label,
              r.account_code,
              r.account_title,
              r.asset_type,
              r.reporter_name,
              r.technician,
              r.description,
            ])
          ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [completedRepairs, query]
  );

  const [deliveryPageSize, setDeliveryPageSize] = usePageSize(
    "pgso:admin:docs-delivery",
    10
  );
  const [deliveryPage, setDeliveryPage] = useState(1);
  const [inspectionPageSize, setInspectionPageSize] = usePageSize(
    "pgso:admin:docs-inspection",
    10
  );
  const [inspectionPage, setInspectionPage] = useState(1);
  const [stockPageSize, setStockPageSize] = usePageSize(
    "pgso:admin:docs-stocks",
    10
  );
  const [stockPage, setStockPage] = useState(1);
  const [assetPageSize, setAssetPageSize] = usePageSize(
    "pgso:admin:docs-assets",
    10
  );
  const [assetPage, setAssetPage] = useState(1);
  const [repairPageSize, setRepairPageSize] = usePageSize(
    "pgso:admin:docs-repairs",
    10
  );
  const [repairPage, setRepairPage] = useState(1);
  const [iarPageSize, setIarPageSize] = usePageSize("pgso:admin:docs-iar", 10);
  const [iarPage, setIarPage] = useState(1);
  const [parPageSize, setParPageSize] = usePageSize("pgso:admin:docs-par", 10);
  const [parPage, setParPage] = useState(1);
  const [icsPageSize, setIcsPageSize] = usePageSize("pgso:admin:docs-ics", 10);
  const [icsPage, setIcsPage] = useState(1);

  function resetDocPages() {
    setDeliveryPage(1);
    setInspectionPage(1);
    setStockPage(1);
    setAssetPage(1);
    setRepairPage(1);
    setIarPage(1);
    setParPage(1);
    setIcsPage(1);
  }

  function paginate<T>(rows: T[], page: number, pageSize: number) {
    const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
    const safePage = Math.min(Math.max(1, page), pageCount);
    return {
      safePage,
      visible: rows.slice(
        (safePage - 1) * pageSize,
        (safePage - 1) * pageSize + pageSize
      ),
    };
  }

  const counts: Record<Tab, number> = {
    delivery: deliveries.length,
    inspection: inspections.length,
    stocks: stocks.length,
    assets: assets.length,
    repairs: completedRepairs.length,
    iar: iars.length,
    par: pars.length,
    ics: icss.length,
  };

  const shown: Record<Tab, number> = {
    delivery: deliveryRows.length,
    inspection: inspectionRows.length,
    stocks: stockRows.length,
    assets: assetRows.length,
    repairs: repairRows.length,
    iar: iarRows.length,
    par: parRows.length,
    ics: icsRows.length,
  };

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

  const deliveryPaging = paginate(deliveryRows, deliveryPage, deliveryPageSize);
  const inspectionPaging = paginate(
    inspectedRows,
    inspectionPage,
    inspectionPageSize
  );
  const stockPaging = paginate(stockRows, stockPage, stockPageSize);
  const assetPaging = paginate(assetRows, assetPage, assetPageSize);
  const repairPaging = paginate(repairRows, repairPage, repairPageSize);
  const iarPaging = paginate(iarRows, iarPage, iarPageSize);
  const parPaging = paginate(parRows, parPage, parPageSize);
  const icsPaging = paginate(icsRows, icsPage, icsPageSize);

  function openInspectionHistory(deliveryId: string) {
    setSelectedInspectionId(deliveryId);
    setInspectionDoc(null);
    setInspectionDocLoading(true);
    markViewed("inspection", deliveryId);
    void Promise.all([
      browseDeliveryForInspection(deliveryId),
      browseInspectionHistory(deliveryId),
    ]).then(([delivery, history]) => {
      if (delivery) {
        setInspectionDoc({ delivery, history });
      } else {
        setInspectionDoc(null);
      }
      setInspectionDocLoading(false);
    });
  }

  function switchTab(t: Tab) {
    setTab(t);
    setQuery("");
    resetDocPages();
    setSelectedInspectionId(null);
    setInspectionDoc(null);
    setSelectedStockId(null);
    setSelectedAssetId(null);
    setSelectedRepairId(null);
    setSelectedIarId(null);
    setIarDoc(null);
    setSelectedParId(null);
    setParDoc(null);
    setSelectedIcsId(null);
    setIcsDoc(null);
  }

  function openIarReport(row: BrowseIarReportRow) {
    setSelectedIarId(row.id);
    setIarDoc(null);
    setIarDocLoading(true);
    markViewed("iar", row.id);
    void Promise.all([
      browseDeliveryForInspection(row.delivery_id),
      browseIarRecords(row.delivery_id),
    ]).then(([delivery, records]) => {
      if (delivery) {
        setIarDoc({ delivery, records });
      } else {
        setIarDoc(null);
      }
      setIarDocLoading(false);
    });
  }

  const selectedIarRecord =
    iarDoc?.records.find((r) => r.id === selectedIarId) ??
    iarDoc?.records[0] ??
    null;

  function openParReport(row: BrowseIssuanceRow) {
    setSelectedParId(row.id);
    setParDoc(null);
    setParDocLoading(true);
    markViewed("par", row.id);
    void browseIssuance(row.id).then((detail) => {
      setParDoc(detail);
      setParDocLoading(false);
    });
  }

  function openIcsReport(row: BrowseIssuanceRow) {
    setSelectedIcsId(row.id);
    setIcsDoc(null);
    setIcsDocLoading(true);
    markViewed("ics", row.id);
    void browseIssuance(row.id).then((detail) => {
      setIcsDoc(detail);
      setIcsDocLoading(false);
    });
  }

  const selectedStock = stocks.find((r) => r.id === selectedStockId) ?? null;
  const selectedAsset = assets.find((a) => a.id === selectedAssetId) ?? null;
  const selectedRepair =
    completedRepairs.find((r) => r.id === selectedRepairId) ?? null;

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Super Admin / Documents</p>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Documents</h1>
          <p className={styles.subtitle}>
            {shown[tab]} of {counts[tab]}{" "}
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

        {loading ? (
          <div className={styles.emptyState}>
            <p className={styles.panelSub}>Loading documents…</p>
          </div>
        ) : (
          <>
            {tab === "delivery" &&
              (deliveryRows.length === 0 ? (
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
                            <Link
                              href={`/super-admin/deliveries/${d.delivery_id}`}
                              className={styles.inspectLinkSecondary}
                              onClick={() =>
                                markViewed("delivery", d.delivery_id)
                              }
                            >
                              {isViewed("delivery", d.delivery_id)
                                ? "✓ Viewed"
                                : "View receipt"}
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            {tab === "delivery" && deliveryRows.length > 0 ? (
              <TablePager
                id="admin-docs-delivery"
                total={deliveryRows.length}
                pageSize={deliveryPageSize}
                page={deliveryPaging.safePage}
                onPageSizeChange={setDeliveryPageSize}
                onPageChange={setDeliveryPage}
              />
            ) : null}

            {tab === "inspection" &&
              (inspectedRows.length === 0 ? (
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
              <TablePager
                id="admin-docs-inspection"
                total={inspectedRows.length}
                pageSize={inspectionPageSize}
                page={inspectionPaging.safePage}
                onPageSizeChange={setInspectionPageSize}
                onPageChange={setInspectionPage}
              />
            ) : null}

            <ReceiptOverlay
              open={selectedInspectionId !== null}
              title="Inspection history receipt"
              onClose={() => {
                setSelectedInspectionId(null);
                setInspectionDoc(null);
              }}
            >
              {inspectionDocLoading || !inspectionDoc ? (
                <div className={styles.emptyState}>
                  <p className={styles.panelSub}>
                    {inspectionDocLoading
                      ? "Loading history receipt…"
                      : "No inspection record found for this delivery."}
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
              (stockRows.length === 0 ? (
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
              <TablePager
                id="admin-docs-stocks"
                total={stockRows.length}
                pageSize={stockPageSize}
                page={stockPaging.safePage}
                onPageSizeChange={setStockPageSize}
                onPageChange={setStockPage}
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
              (assetRows.length === 0 ? (
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
              <TablePager
                id="admin-docs-assets"
                total={assetRows.length}
                pageSize={assetPageSize}
                page={assetPaging.safePage}
                onPageSizeChange={setAssetPageSize}
                onPageChange={setAssetPage}
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
              (repairRows.length === 0 ? (
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
              <TablePager
                id="admin-docs-repairs"
                total={repairRows.length}
                pageSize={repairPageSize}
                page={repairPaging.safePage}
                onPageSizeChange={setRepairPageSize}
                onPageChange={setRepairPage}
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
              (iarRows.length === 0 ? (
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
              <TablePager
                id="admin-docs-iar"
                total={iarRows.length}
                pageSize={iarPageSize}
                page={iarPaging.safePage}
                onPageSizeChange={setIarPageSize}
                onPageChange={setIarPage}
              />
            ) : null}

            <ReceiptOverlay
              open={selectedIarId !== null}
              title="Inspection and Acceptance Report"
              onClose={() => {
                setSelectedIarId(null);
                setIarDoc(null);
              }}
            >
              {iarDocLoading || !iarDoc ? (
                <div className={styles.emptyState}>
                  <p className={styles.panelSub}>
                    {iarDocLoading
                      ? "Loading IAR report…"
                      : "This IAR record is no longer available."}
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
              (parRows.length === 0 ? (
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
              <TablePager
                id="admin-docs-par"
                total={parRows.length}
                pageSize={parPageSize}
                page={parPaging.safePage}
                onPageSizeChange={setParPageSize}
                onPageChange={setParPage}
              />
            ) : null}

            <ReceiptOverlay
              open={selectedParId !== null}
              title="Property Acknowledgment Receipt"
              onClose={() => {
                setSelectedParId(null);
                setParDoc(null);
              }}
            >
              {parDocLoading || !parDoc ? (
                <div className={styles.emptyState}>
                  <p className={styles.panelSub}>Loading PAR report…</p>
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
              (icsRows.length === 0 ? (
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
              <TablePager
                id="admin-docs-ics"
                total={icsRows.length}
                pageSize={icsPageSize}
                page={icsPaging.safePage}
                onPageSizeChange={setIcsPageSize}
                onPageChange={setIcsPage}
              />
            ) : null}

            <ReceiptOverlay
              open={selectedIcsId !== null}
              title="Inventory Custodian Slip"
              onClose={() => {
                setSelectedIcsId(null);
                setIcsDoc(null);
              }}
            >
              {icsDocLoading || !icsDoc ? (
                <div className={styles.emptyState}>
                  <p className={styles.panelSub}>Loading ICS report…</p>
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
          </>
        )}
      </Card>
    </section>
  );
}
