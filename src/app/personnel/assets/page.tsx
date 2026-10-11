"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { PAGE_SIZE, CACHE_TTL } from "@/lib/constants";
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
import { AddAssetDialog, ImportAssetsDialog, type AssetMutationEvent } from "./asset-dialogs";
import { IssuanceEvaluateDialog } from "@/components/personnel/IssuanceDialog";
import { Pagination } from "@/components/ui/pagination";
import { useCachedAction } from "@/hooks/use-cached-action";
import { CLIENT_CACHE_KEYS, bustClientCache, getClientCache, setClientCache } from "@/lib/client-cache";
import { patchRowInPage, prependRowToPage, removeRowFromPage } from "@/lib/list-patch";
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

export default function PersonnelAssetsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const debouncedQuery = useDebouncedValue(query, 300);
  const searching = query.trim() !== debouncedQuery.trim();
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") ?? "all");
  const [sourceFilter, setSourceFilter] = useState(searchParams.get("source") ?? "all");
  const [conditionFilter, setConditionFilter] = useState(searchParams.get("condition") ?? "all");
  const [unitFilter, setUnitFilter] = useState(searchParams.get("unit") ?? "all");
  const [assetTypeFilter, setAssetTypeFilter] = useState(searchParams.get("category") ?? "all");
  const pageSize = PAGE_SIZE;
  const [page, setPage] = useState(Math.max(1, Number(searchParams.get("page")) || 1));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [issuanceOpen, setIssuanceOpen] = useState(false);
  const [presetAssetId, setPresetAssetId] = useState<string | null>(null);
  const [qrRow, setQrRow] = useState<UnifiedAssetRow | null>(null);

  // Server-filtered registry window: search + all 5 filters + page run in
  // the DB layer; QR + custom bags hydrate for the visible 15 only.
  // Back-navigation paints instantly from cache; URL holds page/filters.
  const setUrl = useCallback(
    (next: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(next)) {
        if (v === null || v === "" || v === "all") params.delete(k);
        else params.set(k, v);
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [searchParams, router, pathname]
  );

  useEffect(() => {
    setUrl({
      page: page === 1 ? null : String(page),
      q: debouncedQuery || null,
      status: statusFilter,
      source: sourceFilter,
      condition: conditionFilter,
      unit: unitFilter,
      category: assetTypeFilter,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedQuery, statusFilter, sourceFilter, conditionFilter, unitFilter, assetTypeFilter]);

  const {
    data: paged,
    loading,
    isValidating,
    error,
    refresh: refreshSnapshot,
    mutate: mutatePaged,
  } = useCachedAction(
    `pgso:assets:unified:${page}:${pageSize}:${debouncedQuery}:${statusFilter}:${sourceFilter}:${conditionFilter}:${unitFilter}:${assetTypeFilter}`,
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
    { staleTime: CACHE_TTL.countsMs }
  );
  const rows = useMemo(() => paged?.rows ?? [], [paged]);
  const total = paged?.total ?? 0;

  // Prefetch next page.
  useEffect(() => {
    if (!paged || total <= page * pageSize) return;
    const nextKey = `pgso:assets:unified:${page + 1}:${pageSize}:${debouncedQuery}:${statusFilter}:${sourceFilter}:${conditionFilter}:${unitFilter}:${assetTypeFilter}`;
    if (getClientCache(nextKey)) return;
    const t = setTimeout(() => {
      void getUnifiedAssetsPage({
        page: page + 1,
        q: debouncedQuery,
        status: statusFilter,
        source: sourceFilter,
        condition: conditionFilter,
        unit: unitFilter,
        category: assetTypeFilter,
      }).then((fresh) => setClientCache(nextKey, fresh)).catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [paged, total, page, pageSize, debouncedQuery, statusFilter, sourceFilter, conditionFilter, unitFilter, assetTypeFilter]);
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

  // Claimable position: the new row provably belongs on screen only on
  // unfiltered page 1 (server sort could place it anywhere otherwise).
  const canClaimPosition = page === 1 && !hasActiveFilters;

  /**
   * Optimistic create lifecycle (no refetch): prepend the temp row on
   * submit, reconcile with the server record on success, roll back on
   * failure. Filtered/deep pages fall back to refresh (position unknown).
   */
  const handleAssetCreateEvent = useCallback(
    (e: AssetMutationEvent) => {
      if (e.phase === "start") {
        if (!canClaimPosition) return;
        mutatePaged((prev) => (prev ? prependRowToPage(prev, e.temp) : prev));
        return;
      }
      if (e.phase === "success" && e.record) {
        bustClientCache([
          CLIENT_CACHE_KEYS.dashboard,
          CLIENT_CACHE_KEYS.issuances,
          CLIENT_CACHE_KEYS.logs,
        ]);
        mutatePaged((prev) => {
          if (!prev) return prev;
          const rows = (prev as { rows?: { id: string }[] }).rows ?? [];
          if (rows.some((r) => r.id === e.tempId)) {
            return patchRowInPage(prev, e.tempId, {
              ...e.temp,
              id: e.record!.id,
              account_code: e.record!.account_code ?? e.temp.account_code,
              article: e.record!.article ?? e.temp.article,
            } as Record<string, unknown>);
          }
          if (canClaimPosition) {
            return prependRowToPage(prev, {
              ...e.temp,
              id: e.record!.id,
            } as (typeof rows)[number] & { id: string });
          }
          // Position unknown under filters/deep pages — refetch to reveal.
          refreshSnapshot();
          return prev;
        });
        return;
      }
      // error → roll back the temp row (no-op when never inserted).
      mutatePaged((prev) => (prev ? removeRowFromPage(prev, e.tempId) : prev));
    },
    [canClaimPosition, mutatePaged, refreshSnapshot]
  );

  const bustSiblings = useCallback(() => {
    bustClientCache([
      CLIENT_CACHE_KEYS.dashboard,
      CLIENT_CACHE_KEYS.issuances,
      CLIENT_CACHE_KEYS.logs,
    ]);
  }, []);

  // Server already filtered + paged — visible is the page window.
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const visible = rows;

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
            onSuccess={bustSiblings}
            onMutationEvent={handleAssetCreateEvent}
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

            <Pagination total={total} page={safePage} onPageChange={setPage} id="assets" />
          </>
        )}
        {error && rows.length === 0 && !loading ? (
          <div className={styles.emptyState} role="alert">
            <p className={styles.panelSub}>Failed to load assets. Please try again.</p>
          </div>
        ) : null}
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
