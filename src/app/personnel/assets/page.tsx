"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { Eye, QrCode, Search, Send } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getAssetFilterOptions, getUnifiedAssetsPage, type UnifiedAssetRow } from "./actions";
import { AddColumnDialog } from "./custom-columns";
import { AddAssetDialog, ImportAssetsDialog } from "./asset-dialogs";
import { IssuanceEvaluateDialog } from "@/components/personnel/IssuanceDialog";
import { FIXED_PAGE_SIZE } from "@/components/personnel/TablePager";
import { useCachedAction } from "@/hooks/use-cached-action";
import { CLIENT_CACHE_KEYS, bustClientCache } from "@/lib/client-cache";
import AssetsLoading from "./loading";
import styles from "../dashboard/page.module.css";
import assetStyles from "./page.module.css";

function tone(status: string | null) {
  if (status === "available") return "ok";
  if (status === "retired") return "warn";
  return "info";
}

function label(value: string | null) {
  if (!value) return "—";
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");
}

const STATUS_FILTERS = [
  { value: "all", label: "All statuses" },
  { value: "available", label: "Available" },
  { value: "in use", label: "In use" },
  { value: "maintenance", label: "Maintenance" },
  { value: "retired", label: "Retired" },
] as const;

const SOURCE_FILTERS = [
  { value: "all", label: "All" },
  { value: "asset", label: "Asset" },
  { value: "stock", label: "Stock" },
] as const;

function pageWindow(current: number, total: number) {
  const start = Math.max(1, Math.min(current - 2, total - 4));
  const end = Math.min(total, start + 4);
  const pages: number[] = [];
  for (let p = Math.max(1, end - 4); p <= end; p++) pages.push(p);
  return { pages: pages.filter((p) => p >= start), start };
}

export default function PersonnelAssetsPage() {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 250);
  const searching = query.trim() !== debouncedQuery.trim();
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [conditionFilter, setConditionFilter] = useState("all");
  const [unitFilter, setUnitFilter] = useState("all");
  const [assetTypeFilter, setAssetTypeFilter] = useState("all");
  // Fixed 20 rows/page (no selector) — the server returns only this window.
  const pageSize = FIXED_PAGE_SIZE;
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [issuanceOpen, setIssuanceOpen] = useState(false);
  const [presetAssetId, setPresetAssetId] = useState<string | null>(null);
  const [qrRow, setQrRow] = useState<UnifiedAssetRow | null>(null);

  // Server-filtered registry window: search + all 5 filters + page run in
  // the DB layer; QR + custom bags hydrate for the visible 20 only.
  // Back-navigation still paints instantly from the client SWR cache.
  const {
    data: paged,
    loading,
    isValidating,
    refresh: refreshSnapshot,
  } = useCachedAction(
    `${CLIENT_CACHE_KEYS.assets}:${page}:${debouncedQuery}:${statusFilter}:${sourceFilter}:${conditionFilter}:${unitFilter}:${assetTypeFilter}`,
    () =>
      getUnifiedAssetsPage({
        page,
        q: debouncedQuery,
        status: statusFilter,
        source: sourceFilter,
        condition: conditionFilter,
        unit: unitFilter,
        category: assetTypeFilter,
      }),
    { staleTime: 60_000 }
  );
  const rows = useMemo(() => paged?.rows ?? [], [paged]);
  const total = paged?.total ?? 0;
  // Bounded dropdown options from the server (the page window no longer
  // contains every value).
  const { data: filterOptions } = useCachedAction(
    `${CLIENT_CACHE_KEYS.assets}-filter-options`,
    getAssetFilterOptions,
    { staleTime: 300_000 }
  );
  const categories = useMemo(() => filterOptions?.categories ?? [], [filterOptions]);

  const reload = () => {
    // Own write (add / import / issue / edit) — force fresh rows now and drop
    // the dashboard snapshot (asset + issuance stats) plus the issuances list
    // and activity logs (direct issues create both) so their next visit
    // refetches instead of serving the pre-write payload. Old data stays
    // visible while the refetch runs (no skeleton flash).
    bustClientCache([
      CLIENT_CACHE_KEYS.dashboard,
      CLIENT_CACHE_KEYS.issuances,
      CLIENT_CACHE_KEYS.logs,
    ]);
    refreshSnapshot();
  };

  const resetPage = () => {
    setPage(1);
    setSelectedId(null);
  };

  const conditionOptions = useMemo(
    () => (filterOptions?.conditions ?? []).map((v) => [v.toLowerCase(), v] as [string, string]),
    [filterOptions]
  );
  const unitOptions = useMemo(
    () => (filterOptions?.units ?? []).map((v) => [v.toLowerCase(), v] as [string, string]),
    [filterOptions]
  );
  const assetTypeOptions = useMemo(
    () => (filterOptions?.categories ?? []).map((v) => [v.toLowerCase(), v] as [string, string]),
    [filterOptions]
  );

  const hasActiveFilters =
    query.trim() !== "" ||
    statusFilter !== "all" ||
    sourceFilter !== "all" ||
    conditionFilter !== "all" ||
    unitFilter !== "all" ||
    assetTypeFilter !== "all";

  // Server already filtered + paged — visible is the page window.
  const filtered = rows;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize;
  const visible = filtered;
  const { pages } = pageWindow(safePage, pageCount);

  const selectedRow = rows.find((r) => r.id === selectedId) ?? null;
  const selectedAssignable =
    selectedRow !== null &&
    (selectedRow.status ?? "available").trim().toLowerCase() === "available" &&
    !(typeof selectedRow.quantity === "number" && selectedRow.quantity <= 0) &&
    selectedRow.assigned_to == null;

  // Cold start only: background refetches keep stale rows visible with
  // an "updating…" badge instead of flashing the full skeleton.
  if (loading && rows.length === 0) {
    return <AssetsLoading />;
  }

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Personnel / Assets</p>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Assets</h1>
          <p className={styles.subtitle}>
            {total} {total === 1 ? "asset" : "assets"} found
            {(isValidating || searching) ? " · updating…" : ""}
          </p>
        </div>
        <div className={styles.actions}>
          <Button
            type="button"
            disabled={selectedId !== null && !selectedAssignable}
            title={
              selectedId !== null && !selectedAssignable
                ? "Selected asset is already assigned or out of stock"
                : "Issue the selected asset"
            }
            onClick={() => {
              setPresetAssetId(selectedId);
              setIssuanceOpen(true);
            }}
            className="h-8 gap-2 rounded-[4px] px-3.5 text-xs font-semibold"
          >
            Issue / Assign
          </Button>
          <AddAssetDialog
            categories={categories}
            onSuccess={reload}
            triggerClassName="h-8 gap-2 rounded-[4px] px-3.5 text-xs font-semibold"
          />
          <ImportAssetsDialog
            onSuccess={reload}
            triggerClassName="h-8 gap-2 rounded-[4px] px-3.5 text-xs font-semibold"
          />
          <AddColumnDialog
            onSuccess={reload}
            triggerClassName="h-8 gap-2 rounded-[4px] px-3.5 text-xs font-semibold"
          />
        </div>
      </div>

      <Card className={styles.panel}>
        <div className={assetStyles.controlsRight}>
          <div className={assetStyles.topRow}>
            <div className={assetStyles.searchWrap}>
              <Search className={assetStyles.searchIcon} size={16} />
              <Input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  resetPage();
                }}
                placeholder="Search property no., category, description…"
                className={assetStyles.search}
                aria-label="Search assets"
              />
            </div>
            <div className={assetStyles.filterGroup}>
              <label className={assetStyles.filterLabel} htmlFor="assets-filter-source">
                Type
              </label>
              <Select
                value={sourceFilter}
                onValueChange={(v) => {
                  setSourceFilter(v);
                  resetPage();
                }}
              >
                <SelectTrigger id="assets-filter-source" size="sm" className={assetStyles.filterSelect}>
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_FILTERS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className={assetStyles.filterGroup}>
              <label className={assetStyles.filterLabel} htmlFor="assets-filter-status">
                Status
              </label>
              <Select
                value={statusFilter}
                onValueChange={(v) => {
                  setStatusFilter(v);
                  resetPage();
                }}
              >
                <SelectTrigger id="assets-filter-status" size="sm" className={assetStyles.filterSelect}>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_FILTERS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
              <div className={assetStyles.filterGroup}>
                <label className={assetStyles.filterLabel} htmlFor="assets-filter-type">
                  Asset type
                </label>
                <Select
                  value={assetTypeFilter}
                  onValueChange={(v) => {
                    setAssetTypeFilter(v);
                    resetPage();
                  }}
                >
                  <SelectTrigger id="assets-filter-type" size="sm" className={assetStyles.filterSelect}>
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    {assetTypeOptions.map(([key, display]) => (
                      <SelectItem key={key} value={key}>
                        {label(display)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className={assetStyles.filterGroup}>
                <label className={assetStyles.filterLabel} htmlFor="assets-filter-condition">
                  Condition
                </label>
                <Select
                  value={conditionFilter}
                  onValueChange={(v) => {
                    setConditionFilter(v);
                    resetPage();
                  }}
                >
                  <SelectTrigger id="assets-filter-condition" size="sm" className={assetStyles.filterSelect}>
                    <SelectValue placeholder="All conditions" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All conditions</SelectItem>
                    {conditionOptions.map(([key, display]) => (
                      <SelectItem key={key} value={key}>
                        {label(display)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className={assetStyles.filterGroup}>
                <label className={assetStyles.filterLabel} htmlFor="assets-filter-unit">
                  Unit
                </label>
                <Select
                  value={unitFilter}
                  onValueChange={(v) => {
                    setUnitFilter(v);
                    resetPage();
                  }}
                >
                  <SelectTrigger id="assets-filter-unit" size="sm" className={assetStyles.filterSelect}>
                    <SelectValue placeholder="All units" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All units</SelectItem>
                    {unitOptions.map(([key, display]) => (
                      <SelectItem key={key} value={key}>
                        {label(display)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {hasActiveFilters && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={assetStyles.filterBtn}
                  onClick={() => {
                    setQuery("");
                    setStatusFilter("all");
                    setSourceFilter("all");
                    setConditionFilter("all");
                    setUnitFilter("all");
                    setAssetTypeFilter("all");
                    resetPage();
                  }}
                >
                  Clear all
                </Button>
              )}
          </div>
        </div>

        <div className={assetStyles.legend} aria-label="Row actions legend">
          <span className={assetStyles.legendItem}>
            <span className={assetStyles.legendIcon} aria-hidden="true">
              <Eye size={14} />
            </span>
            View details
          </span>
          <span className={assetStyles.legendItem}>
            <span className={assetStyles.legendIcon} aria-hidden="true">
              <Send size={14} />
            </span>
            Issue asset
          </span>
          <span className={assetStyles.legendItem}>
            <span className={assetStyles.legendIcon} aria-hidden="true">
              <QrCode size={14} />
            </span>
            Show QR code
          </span>
        </div>

        {visible.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.panelSub}>
              {total === 0
                ? "No assets have been registered yet. Use Add asset or Import Excel to get started."
                : "No assets match your search or filters."}
            </p>
          </div>
        ) : (
          <>
            <div className={`${styles.tableWrap} ${assetStyles.tableAuto} ${assetStyles.tableLean}`}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={assetStyles.colLeanDetails}>Details</th>
                    <th className={assetStyles.colLeanCode}>Account Code</th>
                    <th className={assetStyles.colLeanType}>Account Title</th>
                    <th className={assetStyles.colLeanType}>Account Name</th>
                    <th className={assetStyles.colLeanProp}>Property No.</th>
                    <th className={assetStyles.colLeanItem}>Item</th>
                    <th className={assetStyles.colLeanQty}>Qty Available</th>
                    <th className={assetStyles.colLeanLoc}>Location</th>
                    <th className={assetStyles.colLeanStatus}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((a) => {
                    const isSelected = selectedId === a.id;
                    const statusKey = (a.status ?? "available")
                      .trim()
                      .toLowerCase();
                    const outOfStock =
                      typeof a.quantity === "number" && a.quantity <= 0;
                    const alreadyAssigned = a.assigned_to != null;
                    const assignable =
                      statusKey === "available" &&
                      !outOfStock &&
                      !alreadyAssigned;
                    const issueBlockReason = alreadyAssigned
                      ? "Already assigned"
                      : outOfStock
                        ? "Out of stock"
                        : statusKey !== "available"
                          ? label(a.status)
                          : null;
                    return (
                      <tr
                        key={a.id}
                        className={
                          isSelected
                            ? assetStyles.selectedRow
                            : alreadyAssigned
                              ? assetStyles.issuedRow
                              : assetStyles.selectableRow
                        }
                        data-selected={isSelected ? "true" : undefined}
                        aria-selected={isSelected}
                        tabIndex={0}
                        onClick={() =>
                          setSelectedId((prev) => (prev === a.id ? null : a.id))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedId((prev) =>
                              prev === a.id ? null : a.id
                            );
                          }
                        }}
                      >
                        <td
                          className={`${assetStyles.detailsCell} ${assetStyles.colLeanDetails}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="inline-flex items-center gap-1.5">
                            <Link
                              href={`/personnel/assets/${a.id}`}
                              className={assetStyles.iconBtn}
                              title="See details"
                              aria-label={`See details of ${a.article ?? a.account_code ?? "asset"}`}
                            >
                              <Eye size={16} />
                            </Link>
                            <button
                              type="button"
                              className={assetStyles.iconBtn}
                              disabled={!assignable}
                              title={
                                issueBlockReason
                                  ? `Cannot issue — ${issueBlockReason.toLowerCase()}`
                                  : "Issue this asset"
                              }
                              aria-label="Issue this asset"
                              onClick={() => {
                                setPresetAssetId(a.id);
                                setIssuanceOpen(true);
                              }}
                            >
                              <Send size={16} />
                            </button>
                            <button
                              type="button"
                              className={assetStyles.iconBtn}
                              title="Show QR code"
                              aria-label={`Show QR code of ${a.article ?? a.account_code ?? "asset"}`}
                              onClick={() => setQrRow(a)}
                            >
                              <QrCode size={16} />
                            </button>
                          </span>
                        </td>
                        <td className={assetStyles.colLeanCode} title={a.account_code ?? undefined}>
                          {a.account_code ?? "—"}
                        </td>
                        <td className={assetStyles.colLeanType} title={a.account_title ?? undefined}>
                          {label(a.account_title)}
                        </td>
                        <td className={assetStyles.colLeanType} title={a.account_name ?? undefined}>
                          {label(a.account_name)}
                        </td>
                        <td className={assetStyles.colLeanProp} title={a.qr_code ?? undefined}>
                          {a.qr_code ?? "—"}
                        </td>
                        <td
                          className={assetStyles.colLeanItem}
                          title={`${a.article ?? ""} — ${a.description ?? ""}`}
                        >
                          <span className={assetStyles.cellMain}>
                            {label(a.article)}
                          </span>
                          <span className={assetStyles.itemDesc}>
                            {a.description ?? "—"}
                          </span>
                        </td>
                        <td className={assetStyles.colLeanQty}>
                          <span className={assetStyles.qtyInline}>
                            {a.quantity ?? "—"}
                            {a.unit ? ` ${label(a.unit)}` : ""}
                          </span>
                        </td>
                        <td className={assetStyles.colLeanLoc} title={a.location ?? undefined}>
                          {a.location ?? "—"}
                        </td>
                        <td className={assetStyles.colLeanStatus}>
                          <span
                            className={styles.status}
                            data-tone={
                              outOfStock
                                ? "bad"
                                : tone(
                                    alreadyAssigned && statusKey === "available"
                                      ? "in use"
                                      : a.status
                                  )
                            }
                          >
                            {outOfStock
                              ? "Out of stock"
                              : alreadyAssigned && statusKey === "available"
                                ? "Assigned"
                                : label(a.status)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className={styles.pager}>
              <span className={styles.pagerInfo}>
                Showing {total === 0 ? 0 : start + 1}–
                {Math.min(start + pageSize, total)} of{" "}
                {total}
              </span>
              <div className={styles.pagerControls}>
                <button
                  type="button"
                  className={styles.pageBtn}
                  disabled={safePage === 1}
                  onClick={() => setPage(safePage - 1)}
                  aria-label="Previous page"
                >
                  ‹
                </button>
                {pages.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={styles.pageBtn}
                    data-active={p === safePage}
                    onClick={() => setPage(p)}
                    aria-label={`Page ${p}`}
                    aria-current={p === safePage ? "page" : undefined}
                  >
                    {p}
                  </button>
                ))}
                <button
                  type="button"
                  className={styles.pageBtn}
                  disabled={safePage === pageCount}
                  onClick={() => setPage(safePage + 1)}
                  aria-label="Next page"
                >
                  ›
                </button>
              </div>
            </div>
          </>
        )}
      </Card>

      <Dialog
        open={qrRow !== null}
        onOpenChange={(v) => {
          if (!v) setQrRow(null);
        }}
      >
        <DialogContent className="bg-white sm:max-w-xs dark:bg-white">
          <DialogHeader>
            <DialogTitle>QR code</DialogTitle>
            <DialogDescription>
              {qrRow
                ? `${qrRow.source === "stock" ? "Stock" : "Asset"} — ${qrRow.article ?? qrRow.account_code ?? "—"}`
                : "—"}
            </DialogDescription>
          </DialogHeader>
          <div className={assetStyles.qrOverlayBody}>
            {qrRow?.qr_data_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrRow.qr_data_url}
                alt={`QR code for ${qrRow.qr_code ?? qrRow.account_code ?? "asset"}`}
                className={assetStyles.qrOverlayImg}
              />
            ) : (
              <span className={assetStyles.qrPlaceholder}>No QR code</span>
            )}
            <p className={assetStyles.qrValue}>
              {qrRow?.qr_code ?? qrRow?.account_code ?? "—"}
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setQrRow(null)}
              className="h-8 rounded-[4px] px-3.5 text-xs font-semibold"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {issuanceOpen ? (
        <IssuanceEvaluateDialog
          key={presetAssetId ?? "direct"}
          open={issuanceOpen}
          onOpenChange={(v) => {
            setIssuanceOpen(v);
            if (!v) setPresetAssetId(null);
          }}
          mode="direct"
          presetAssetId={presetAssetId}
          onSuccess={() => {
            setIssuanceOpen(false);
            setPresetAssetId(null);
            reload();
          }}
        />
      ) : null}
    </section>
  );
}
