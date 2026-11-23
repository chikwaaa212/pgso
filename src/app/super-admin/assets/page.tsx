"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { PAGE_SIZE } from "@/lib/constants";
import { assetOptionDisabledReason } from "@/lib/asset-option";
import { classifyCondition } from "@/lib/reporting";
import { Boxes, Eye, Layers3, PackageSearch, QrCode, Send, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/personnel/PageHeader";
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
import {
  getUnifiedAsset,
  getUnifiedAssetsPage,
  type UnifiedAssetRow,
} from "@/app/personnel/assets/actions";
import { AddColumnDialog } from "@/app/personnel/assets/custom-columns";
import {
  AddAssetDialog,
  ImportAssetsDialog,
  type AssetMutationEvent,
} from "@/app/personnel/assets/asset-dialogs";
import {
  IssuanceEvaluateDialog,
  type IssuanceOptimisticLine,
} from "@/components/personnel/IssuanceDialog";
import { Pagination } from "@/components/ui/pagination";
import { EmptySearchState } from "@/components/personnel/EmptySearchState";
import { useCachedAction } from "@/hooks/use-cached-action";
import { buildQueryKey, resourcePrefix } from "@/lib/query-keys";
import { CLIENT_CACHE_KEYS, bustClientCache } from "@/lib/client-cache";
import { patchRowInPage, prependRowToPage, removeRowFromPage } from "@/lib/list-patch";
import AssetsLoading from "./loading";
import styles from "@/app/personnel/dashboard/page.module.css";
import assetStyles from "@/app/personnel/assets/page.module.css";
import stockStyles from "@/app/personnel/stocks/page.module.css";
import air from "@/app/personnel/inspections/air-section.module.css";
import { cn } from "@/lib/utils";

function tone(status: string | null) {
  if (status === "available") return "ok";
  if (status === "retired") return "warn";
  return "info";
}

function label(value: string | null) {
  if (!value) return "—";
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");
}

const NUMBER_FORMAT = new Intl.NumberFormat("en-PH");

function fmtNumber(value: number) {
  return NUMBER_FORMAT.format(value);
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function assigneeDate(value: string | null) {
  if (!value) return "";
  const d = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  });
}

const STATUS_FILTERS = [
  { value: "all", label: "All statuses" },
  { value: "available", label: "Available" },
  { value: "in use", label: "In use" },
  { value: "maintenance", label: "Maintenance" },
  { value: "retired", label: "Retired" },
] as const;

/**
 * The registry has two origins:
 * - `inspected` — asset lots a passed inspection fed into inventory.
 * - `added` — rows registered in the `assets` table (manual add / Excel import).
 * Stock-kind deliveries still live on /super-admin/stocks.
 */
const SOURCE = "asset" as const;

const ORIGIN_TABS = [
  { value: "inspected", label: "From inspected" },
  { value: "added", label: "From added" },
] as const;

type OriginTab = (typeof ORIGIN_TABS)[number]["value"];

/** The whole tab window is loaded once; search/filter/page stay local. */
const FETCH_LIMIT = 1000;

/** Yellow 24px action buttons — same treatment as the personnel page. */
const ACTION_BTN = cn(
  "h-6 gap-1.5 rounded-[4px] border border-yellow-500 bg-yellow-500 px-3 text-xs font-semibold",
  "text-navy-900 opacity-[0.85] transition-colors hover:bg-yellow-400 hover:text-navy-900 hover:opacity-100 disabled:opacity-40"
);

export default function SuperAdminAssetsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [tab, setTab] = useState<OriginTab>(
    searchParams.get("tab") === "added" ? "added" : "inspected"
  );
  const origin = tab;
  const isInspected = tab === "inspected";
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  // Only the URL write is debounced — the table reads `query` directly so
  // typing filters results on the same keystroke, with no fetch involved.
  const debouncedQuery = useDebouncedValue(query, 300);
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") ?? "all");
  const [conditionFilter, setConditionFilter] = useState(searchParams.get("condition") ?? "all");
  const [unitFilter, setUnitFilter] = useState(searchParams.get("unit") ?? "all");
  const pageSize = PAGE_SIZE;
  const [page, setPage] = useState(Math.max(1, Number(searchParams.get("page")) || 1));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [issuanceOpen, setIssuanceOpen] = useState(false);
  const [presetAssetId, setPresetAssetId] = useState<string | null>(null);
  const [qrRow, setQrRow] = useState<UnifiedAssetRow | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [assigneeRow, setAssigneeRow] = useState<UnifiedAssetRow | null>(null);

  // Inspected lots are inventory rows: they carry no status/condition of their
  // own, so those filters are ignored (and hidden) on that tab.
  const effectiveStatus = isInspected ? "all" : statusFilter;
  const effectiveCondition = isInspected ? "all" : conditionFilter;

  const switchTab = useCallback(
    (next: OriginTab) => {
      if (next === tab) return;
      setTab(next);
      setPage(1);
      setSelectedId(null);
      if (next === "inspected") {
        setStatusFilter("all");
        setConditionFilter("all");
      }
    },
    [tab]
  );

  // URL persistence: page/search/filters survive reload + back-navigation.
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
      tab: tab === "inspected" ? null : tab,
      page: page === 1 ? null : String(page),
      q: debouncedQuery || null,
      status: effectiveStatus,
      condition: effectiveCondition,
      unit: unitFilter,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, page, debouncedQuery, effectiveStatus, effectiveCondition, unitFilter]);

  // One read per tab (slim = no QR hydration). Search, filters, and paging
  // then run in memory so results are instant and never flash a stale page.
  const {
    data: registryData,
    loading,
    error,
    refresh: refreshSnapshot,
    mutate: mutateSnapshot,
  } = useCachedAction(
    buildQueryKey({
      module: "super-admin",
      resource: "assets",
      page: 1,
      pageSize: FETCH_LIMIT,
      filters: { origin },
    }),
    () =>
      getUnifiedAssetsPage({
        page: 1,
        pageSize: FETCH_LIMIT,
        source: SOURCE,
        origin,
        slim: true,
      }),
    { staleTime: 60_000 }
  );
  const rows = useMemo(() => registryData?.rows ?? [], [registryData]);

  const reload = useCallback(() => {
    // Own write (add / import / issue / edit): drop the dashboard snapshot and
    // issuance/log caches too, then refetch this tab's window.
    bustClientCache([
      CLIENT_CACHE_KEYS.dashboard,
      CLIENT_CACHE_KEYS.issuances,
      CLIENT_CACHE_KEYS.logs,
      resourcePrefix("personnel", "dashboard"),
      resourcePrefix("personnel", "issuances"),
      resourcePrefix("personnel", "logs"),
      resourcePrefix("super-admin", "issuances"),
      // Assignment changes registry counts — drop the cached report tabs too.
      resourcePrefix("personnel", "reports-"),
      resourcePrefix("super-admin", "reports-"),
    ]);
    refreshSnapshot();
  }, [refreshSnapshot]);

  const resetPage = () => {
    setPage(1);
    setSelectedId(null);
  };

  // Dropdown options come from the loaded window itself — same values the
  // local filter compares against, so nothing can go missing.
  const uniqueValues = useCallback(
    (pick: (row: UnifiedAssetRow) => string | null) =>
      [...new Set(rows.map(pick).filter((v): v is string => !!v && v.trim() !== ""))]
        .map((v) => [v.toLowerCase(), v] as [string, string])
        .sort((a, b) => a[1].localeCompare(b[1])),
    [rows]
  );
  const conditionOptions = useMemo(() => uniqueValues((r) => r.condition), [uniqueValues]);
  const unitOptions = useMemo(() => uniqueValues((r) => r.unit), [uniqueValues]);

  const hasActiveFilters =
    query.trim() !== "" ||
    effectiveStatus !== "all" ||
    effectiveCondition !== "all" ||
    unitFilter !== "all";

  // Local filtering + paging over the loaded tab window (server order).
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (effectiveStatus !== "all" && (row.status ?? "available").trim().toLowerCase() !== effectiveStatus)
        return false;
      if (effectiveCondition !== "all" && (row.condition ?? "").trim().toLowerCase() !== effectiveCondition)
        return false;
      if (unitFilter !== "all" && (row.unit ?? "").trim().toLowerCase() !== unitFilter) return false;
      if (!needle) return true;
      return [
        row.account_code,
        row.qr_code,
        row.category,
        row.account_title,
        row.account_name,
        row.identifier,
        row.article,
        row.description,
        row.location,
        row.remarks,
        row.brand,
        row.unit,
        row.status,
        row.condition,
        row.dv_tracking_number,
        row.supplier_payee,
        row.account_number,
        row.obr_number,
        row.dv_number,
      ].some((value) => value != null && value.toLowerCase().includes(needle));
    });
  }, [rows, query, effectiveStatus, effectiveCondition, unitFilter]);

  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  // Deep link from a Recommendation ("Open asset"): select the referenced row,
  // move to its page and scroll it into view so the reader never has to search
  // for the property number again.
  const highlightId = searchParams.get("highlight");
  const highlightHandled = useRef<string | null>(null);
  const highlightTabTried = useRef(false);
  useEffect(() => {
    if (!highlightId || loading || rows.length === 0) return;
    if (rows.some((r) => r.id === highlightId)) return;
    // Recommendation rows come from the `assets` table ("From added"); a
    // hand-edited URL could still land on the other tab, so try it once.
    if (highlightTabTried.current) return;
    highlightTabTried.current = true;
    switchTab(isInspected ? "added" : "inspected");
  }, [highlightId, loading, rows, isInspected, switchTab]);

  useEffect(() => {
    if (!highlightId || loading) return;
    const index = filtered.findIndex((r) => r.id === highlightId);
    if (index < 0) return;
    if (highlightHandled.current === highlightId) return;
    highlightHandled.current = highlightId;
    setSelectedId(highlightId);
    setPage(Math.floor(index / pageSize) + 1);
    const timer = window.setTimeout(() => {
      document
        .querySelector(`tr[data-highlight-id="${highlightId}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [highlightId, filtered, loading, pageSize]);

  // Ledger-style summary, computed over the loaded tab window — same cards as
  // the personnel registry so both portals read the same way.
  const stats = useMemo(() => {
    let units = 0;
    let assigned = 0;
    for (const row of rows) {
      if (typeof row.quantity === "number") units += row.quantity;
      if (row.assigned_to || (row.assignees?.length ?? 0) > 0) assigned += 1;
    }
    return {
      items: rows.length,
      units,
      assigned,
      available: rows.length - assigned,
    };
  }, [rows]);

  const clearFilters = () => {
    setQuery("");
    setStatusFilter("all");
    setConditionFilter("all");
    setUnitFilter("all");
    setPage(1);
    setSelectedId(null);
  };

  const handleAssetCreateEvent = useCallback(
    (e: AssetMutationEvent) => {
      if (e.phase === "start") {
        // Only the "added" tab can claim a brand-new registry row.
        if (origin !== "added") return;
        mutateSnapshot((prev) => (prev ? prependRowToPage(prev, e.temp) : prev));
        return;
      }
      if (e.phase === "success" && e.record) {
        mutateSnapshot((prev) =>
          prev
            ? patchRowInPage(prev, e.tempId, {
                id: e.record!.id,
                account_code: e.record!.account_code ?? e.temp.account_code,
                article: e.record!.article ?? e.temp.article,
              })
            : prev
        );
        return;
      }
      // Failure — roll the optimistic row back out of the window.
      mutateSnapshot((prev) => (prev ? removeRowFromPage(prev, e.tempId) : prev));
    },
    [mutateSnapshot, origin]
  );

  /**
   * Instant paint after confirming an issuance: decrement stock quantities /
   * mark assets assigned before the server answers. A failure triggers a
   * refresh so the list snaps back to server truth.
   */
  const applyIssuanceOptimistic = useCallback(
    (lines: IssuanceOptimisticLine[]) => {
      const byId = new Map(lines.map((l) => [l.itemId, l]));
      const patchRow = (row: UnifiedAssetRow): UnifiedAssetRow => {
        const line = byId.get(row.id);
        if (!line) return row;
        if (line.kind === "stock") {
          return {
            ...row,
            quantity: Math.max(0, (row.quantity ?? 0) - line.quantity),
          };
        }
        return {
          ...row,
          assigned_to: line.employeeId,
          status: "in use",
          assignees: [
            {
              id: line.employeeId,
              name: line.employeeName ?? "New assignee",
              doc_type: null,
              doc_no: null,
              date: null,
              current: true,
            },
            ...(row.assignees ?? [])
              .filter((p) => p.id !== line.employeeId)
              .map((p) => ({ ...p, current: false })),
          ],
        };
      };
      mutateSnapshot((prev) =>
        prev
          ? {
              ...prev,
              rows: prev.rows.map(patchRow),
              data: prev.data.map(patchRow),
            }
          : prev
      );
    },
    [mutateSnapshot]
  );

  const selectedRow = rows.find((r) => r.id === selectedId) ?? null;
  // One shared availability rule (lib/asset-option) — the picker, the row
  // action and the server action must agree on what "assignable" means.
  const selectedAssignReason = selectedRow
    ? assetOptionDisabledReason({
        source: selectedRow.source === "stock" ? "stock" : "asset",
        status: selectedRow.status,
        quantity: selectedRow.quantity,
        assigned_to: selectedRow.assigned_to,
        condition: selectedRow.condition,
      })
    : null;
  const selectedAssignable = selectedRow !== null && selectedAssignReason === null;

  // QR is generated on demand for the one row you click — the list window
  // never carries 1000 data URLs.
  const openQr = useCallback(async (row: UnifiedAssetRow) => {
    setQrRow(row);
    if (row.qr_data_url) return;
    setQrLoading(true);
    try {
      const fresh = await getUnifiedAsset(row.id);
      if (fresh?.qr_data_url) {
        setQrRow((prev) => (prev && prev.id === row.id ? { ...prev, qr_data_url: fresh.qr_data_url } : prev));
      }
    } catch {
      /* keep the placeholder */
    } finally {
      setQrLoading(false);
    }
  }, []);

  // Cold start only: background refetches keep stale rows visible instead of
  // flashing the full skeleton.
  if (loading && rows.length === 0) {
    return <AssetsLoading />;
  }

  return (
    <section className={styles.section}>
      <PageHeader
        eyebrow="Asset registry"
        title="Assets"
        subtitle={
          isInspected
            ? "Assets received from passed inspections."
            : "Assets added to the registry."
        }
        meta="Select a row to issue it, or open a record for its full history."
        actions={
          <div className={styles.actions}>
            <Button
              type="button"
              disabled={selectedId !== null && !selectedAssignable}
              title={
                selectedId !== null && !selectedAssignable
                  ? `Cannot assign — ${(selectedAssignReason ?? "unavailable").toLowerCase()}`
                  : "Issue the selected asset"
              }
              onClick={() => {
                setPresetAssetId(selectedId);
                setIssuanceOpen(true);
              }}
              className={ACTION_BTN}
            >
              <Send size={13} aria-hidden="true" />
              Issue / Assign
            </Button>
            {!isInspected ? (
              <>
                <AddAssetDialog
                  onSuccess={reload}
                  onMutationEvent={handleAssetCreateEvent}
                  triggerClassName={ACTION_BTN}
                />
                <ImportAssetsDialog onSuccess={reload} triggerClassName={ACTION_BTN} />
                <AddColumnDialog onSuccess={reload} triggerClassName={ACTION_BTN} />
              </>
            ) : null}
          </div>
        }
      />

      <div className={assetStyles.originTabsRow}>
        <div className={air.tabs} role="tablist" aria-label="Asset origin">
          {ORIGIN_TABS.map((t) => (
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

      <div className={stockStyles.summary}>
        <div className={stockStyles.summaryCard}>
          <span className={stockStyles.summaryIcon}>
            <Boxes size={16} aria-hidden="true" />
          </span>
          <div className={stockStyles.summaryBody}>
            <p className={stockStyles.summaryLabel}>Items in the registry</p>
            <p className={stockStyles.summaryValue}>{fmtNumber(stats.items)}</p>
            <p className={stockStyles.summaryMeta}>
              {isInspected
                ? "Received from passed inspections"
                : "Registered asset records"}
            </p>
          </div>
        </div>

        <div className={stockStyles.summaryCard}>
          <span className={stockStyles.summaryIcon}>
            <Layers3 size={16} aria-hidden="true" />
          </span>
          <div className={stockStyles.summaryBody}>
            <p className={stockStyles.summaryLabel}>Units on hand</p>
            <p className={stockStyles.summaryValue}>{fmtNumber(stats.units)}</p>
            <p className={stockStyles.summaryMeta}>
              Total quantity across all items
            </p>
          </div>
        </div>

        <div
          className={stockStyles.summaryCard}
          data-tone={stats.assigned > 0 ? "info" : undefined}
        >
          <span className={stockStyles.summaryIcon}>
            <Users size={16} aria-hidden="true" />
          </span>
          <div className={stockStyles.summaryBody}>
            <p className={stockStyles.summaryLabel}>Assigned to employees</p>
            <p className={stockStyles.summaryValue}>{fmtNumber(stats.assigned)}</p>
            <p className={stockStyles.summaryMeta}>
              {stats.items === 0
                ? "No asset records yet"
                : `${fmtNumber(stats.available)} available to issue`}
            </p>
          </div>
        </div>
      </div>

      <Card className={stockStyles.panel}>
        <div className={stockStyles.toolbar}>
          <p className={stockStyles.toolbarInfo} aria-live="polite">
            {!registryData ? (
              "Loading assets…"
            ) : hasActiveFilters ? (
              <>
                Showing <strong>{total}</strong> of {rows.length} asset
                {rows.length !== 1 ? "s" : ""}
              </>
            ) : (
              <>
                <strong>{rows.length}</strong> asset{rows.length !== 1 ? "s" : ""} in the registry
              </>
            )}
            {registryData && registryData.total > rows.length
              ? ` · first ${rows.length} loaded`
              : ""}
          </p>

          <div className={stockStyles.filters}>
            <Input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                resetPage();
              }}
              placeholder="Search code, property no., item…"
              className={stockStyles.search}
              aria-label="Search assets"
            />
            {!isInspected ? (
              <Select
                value={statusFilter}
                onValueChange={(v) => {
                  setStatusFilter(v);
                  resetPage();
                }}
              >
                <SelectTrigger className={stockStyles.accountSelect} aria-label="Filter by status">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_FILTERS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            {!isInspected ? (
              <Select
                value={conditionFilter}
                onValueChange={(v) => {
                  setConditionFilter(v);
                  resetPage();
                }}
              >
                <SelectTrigger className={stockStyles.levelSelect} aria-label="Filter by condition">
                  <SelectValue placeholder="Condition" />
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
            ) : null}
            <Select
              value={unitFilter}
              onValueChange={(v) => {
                setUnitFilter(v);
                resetPage();
              }}
            >
              <SelectTrigger className={stockStyles.accountSelect} aria-label="Filter by unit">
                <SelectValue placeholder="Unit" />
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
            {hasActiveFilters ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 rounded-[4px] px-3 text-xs font-semibold"
                onClick={clearFilters}
              >
                Clear all
              </Button>
            ) : null}
          </div>
        </div>

        {error && rows.length === 0 && !loading ? (
          <div className={stockStyles.empty} role="alert">
            <p className={stockStyles.emptyTitle}>Could not load assets</p>
            <p className={stockStyles.emptyText}>
              The registry did not respond. Refresh the page to try again.
            </p>
          </div>
        ) : visible.length === 0 ? (
          hasActiveFilters ? (
            <EmptySearchState
              description="Try a different search term, asset type, condition, or unit."
              onClear={clearFilters}
            />
          ) : (
            <div className={stockStyles.empty}>
              <span className={stockStyles.emptyIcon}>
                <PackageSearch size={20} aria-hidden="true" />
              </span>
              <p className={stockStyles.emptyTitle}>
                {isInspected ? "No inspected assets yet" : "No assets registered yet"}
              </p>
              <p className={stockStyles.emptyText}>
                {isInspected
                  ? "Assets appear here automatically once an asset delivery passes inspection."
                  : "Use Add asset or Import Excel to start the registry."}
              </p>
              {isInspected ? (
                <div className={stockStyles.emptyActions}>
                  <Link href="/super-admin/inspections" className={stockStyles.emptyPrimary}>
                    Go to Inspections
                  </Link>
                </div>
              ) : null}
            </div>
          )
        ) : (
          <>
            <div className={`${assetStyles.tableFit} ${assetStyles.tableLean}`}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={assetStyles.cCode}>Account Code</th>
                    <th className={assetStyles.cType}>Type</th>
                    <th className={assetStyles.cTitle}>Asset Title</th>
                    <th className={assetStyles.cQty}>Qty Available</th>
                    <th className={assetStyles.cAvailability}>Condition</th>
                    <th className={assetStyles.cAssignee}>Assigned to</th>
                    <th className={assetStyles.cStatus}>Status</th>
                    <th className={assetStyles.cActions}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((a) => {
                    const isSelected = selectedId === a.id;
                    const statusKey = (a.status ?? "available").trim().toLowerCase();
                    const conditionClass = classifyCondition(a.condition);
                    // Unserviceable equipment cannot be Available. Show it as
                    // Not available even if legacy data still stores "available".
                    const unserviceable = conditionClass === "unserviceable";
                    const displayStatus =
                      unserviceable && statusKey === "available"
                        ? "maintenance"
                        : a.status;
                    const outOfStock = typeof a.quantity === "number" && a.quantity <= 0;
                    // A holder on the asset record or on a PAR/ICS line makes
                    // the lot "Assigned"; an exhausted lot with no holder is
                    // simply out of stock (matches the Reports bucket).
                    const alreadyAssigned =
                      a.assigned_to != null || (a.assignees?.length ?? 0) > 0;
                    // Shared rule: exhausted / already-held lots are blocked,
                    // a lot with units still on hand stays assignable.
                    const assignBlockReason = assetOptionDisabledReason({
                      source: a.source === "stock" ? "stock" : "asset",
                      status: a.status,
                      quantity: a.quantity,
                      assigned_to: a.assigned_to,
                      condition: a.condition,
                    });
                    const assignable = assignBlockReason === null;
                    return (
                      <tr
                        key={a.id}
                        data-highlight-id={a.id}
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
                        onClick={() => setSelectedId((prev) => (prev === a.id ? null : a.id))}
                        onDoubleClick={() => router.push(`/super-admin/assets/${a.id}`)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedId((prev) => (prev === a.id ? null : a.id));
                          }
                        }}
                      >
                        <td className={assetStyles.cCode} title={a.account_code ?? undefined}>
                          {a.account_code ?? "—"}
                        </td>
                        <td className={assetStyles.cType} title={a.category ?? undefined}>
                          {label(a.category)}
                        </td>
                        <td
                          className={assetStyles.cTitle}
                          title={`${a.article ?? ""} — ${a.description ?? ""}`}
                        >
                          <span className={assetStyles.titleCell}>
                            <span className={assetStyles.titleMain}>{label(a.article)}</span>
                            <span className={assetStyles.titleDesc}>{a.description ?? "—"}</span>
                          </span>
                        </td>
                        <td className={assetStyles.cQty}>
                          <span className={assetStyles.qtyInline}>
                            {a.quantity ?? "—"}
                            {a.unit ? ` ${label(a.unit)}` : ""}
                          </span>
                        </td>
                        <td className={assetStyles.cAvailability}>
                          {/* Condition drives assignability: an unserviceable
                              unit is never available and cannot be issued. */}
                          {a.condition ? (
                            <span
                              className={styles.status}
                              data-tone={
                                unserviceable
                                  ? "bad"
                                  : conditionClass === "serviceable"
                                    ? "ok"
                                    : "warn"
                              }
                              title={
                                unserviceable
                                  ? "Unserviceable — cannot be assigned until it is marked serviceable."
                                  : undefined
                              }
                            >
                              {label(a.condition)}
                            </span>
                          ) : (
                            <span className={assetStyles.assigneeEmpty}>—</span>
                          )}
                        </td>
                        <td className={assetStyles.cAssignee}>
                          {(() => {
                            const people = a.assignees ?? [];
                            return people.length === 0 ? (
                              <span className={assetStyles.assigneeEmpty}>—</span>
                            ) : (
                              <button
                                type="button"
                                className={assetStyles.assigneeBtn}
                                title={people.map((p) => p.name).join(", ")}
                                aria-label={`Show ${people.length} assigned employee${people.length === 1 ? "" : "s"}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setAssigneeRow({ ...a, assignees: people });
                                }}
                              >
                                <span className={assetStyles.assigneeName}>
                                  {people[0].name}
                                </span>
                                {people.length > 1 ? (
                                  <span className={assetStyles.assigneeMore}>
                                    +{people.length - 1}
                                  </span>
                                ) : null}
                              </button>
                            );
                          })()}
                        </td>
                        <td className={assetStyles.cStatus}>
                          <span className={assetStyles.statusStack}>
                            <span
                              className={styles.status}
                              data-tone={
                                unserviceable
                                  ? "bad"
                                  : outOfStock
                                    ? "bad"
                                    : tone(
                                        alreadyAssigned && statusKey === "available"
                                          ? "in use"
                                          : displayStatus
                                      )
                              }
                            >
                              {unserviceable
                                ? "Not available"
                                : outOfStock
                                  ? "Out of stock"
                                  : alreadyAssigned && statusKey === "available"
                                    ? "Assigned"
                                    : label(displayStatus)}
                            </span>
                          </span>
                        </td>
                        <td className={assetStyles.cActions} onClick={(e) => e.stopPropagation()}>
                          <span className={assetStyles.actionsCell}>
                            <Link
                              href={`/super-admin/assets/${a.id}`}
                              className={assetStyles.rowActionMuted}
                              title="See details"
                              aria-label={`See details of ${a.article ?? a.account_code ?? "asset"}`}
                            >
                              <Eye size={14} aria-hidden="true" />
                              View
                            </Link>
                            <button
                              type="button"
                              className={assetStyles.rowAction}
                              disabled={!assignable}
                              title={
                                assignBlockReason
                                  ? `Cannot assign — ${assignBlockReason.toLowerCase()}`
                                  : "Assign this asset"
                              }
                              onClick={() => {
                                setPresetAssetId(a.id);
                                setIssuanceOpen(true);
                              }}
                            >
                              <Send size={14} aria-hidden="true" />
                              Assign
                            </button>
                            <button
                              type="button"
                              className={assetStyles.rowIconAction}
                              title="Show QR code"
                              aria-label={`Show QR code of ${a.article ?? a.account_code ?? "asset"}`}
                              onClick={() => void openQr(a)}
                            >
                              <QrCode size={14} />
                            </button>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className={stockStyles.footer}>
              {total > pageSize ? (
                <Pagination
                  total={total}
                  page={safePage}
                  onPageChange={setPage}
                  id="admin-assets"
                />
              ) : (
                <span className={stockStyles.footerInfo}>
                  Showing all {total} asset{total !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </>
        )}
      </Card>

      <Dialog
        open={assigneeRow !== null}
        onOpenChange={(v) => {
          if (!v) setAssigneeRow(null);
        }}
      >
        <DialogContent className="bg-white sm:max-w-md dark:bg-white">
          <DialogHeader>
            <DialogTitle>Assigned employees</DialogTitle>
            <DialogDescription>
              {assigneeRow
                ? `${assigneeRow.article ?? assigneeRow.account_code ?? "Asset"} · ${assigneeRow.assignees?.length ?? 0} assignment${(assigneeRow.assignees?.length ?? 0) === 1 ? "" : "s"}`
                : "—"}
            </DialogDescription>
          </DialogHeader>
          <ul className={assetStyles.assigneeList}>
            {(assigneeRow?.assignees ?? []).map((person, i) => (
              <li
                key={`${person.id ?? person.name}-${i}`}
                className={assetStyles.assigneeItem}
              >
                <span className={assetStyles.assigneeAvatar} aria-hidden="true">
                  {initials(person.name) || <Users size={14} />}
                </span>
                <span className={assetStyles.assigneeInfo}>
                  <span className={assetStyles.assigneeItemName}>
                    {person.name}
                    {person.current ? (
                      <span className={assetStyles.assigneeCurrent}>
                        Current holder
                      </span>
                    ) : null}
                  </span>
                  <span className={assetStyles.assigneeItemMeta}>
                    {person.doc_type
                      ? `${person.doc_type}${person.doc_no ? ` · ${person.doc_no}` : ""}`
                      : "Holder on record"}
                    {person.date ? ` · ${assigneeDate(person.date)}` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAssigneeRow(null)}
              className="h-8 rounded-[4px] px-3.5 text-xs font-semibold"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={qrRow !== null}
        onOpenChange={(v) => {
          if (!v) {
            setQrRow(null);
            setQrLoading(false);
          }
        }}
      >
        <DialogContent className="bg-white sm:max-w-xs dark:bg-white">
          <DialogHeader>
            <DialogTitle>QR code</DialogTitle>
            <DialogDescription>
              {qrRow ? `Asset — ${qrRow.article ?? qrRow.account_code ?? "—"}` : "—"}
            </DialogDescription>
          </DialogHeader>
          <div className={assetStyles.qrOverlayBody}>
            {qrRow?.qr_data_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrRow.qr_data_url}
                alt={`QR code for ${qrRow.qr_code ?? qrRow.account_code ?? "asset"}`}
                className={assetStyles.qrOverlayImg}
                width={96}
                height={96}
                loading="lazy"
                decoding="async"
              />
            ) : (
              <span className={assetStyles.qrPlaceholder}>
                {qrLoading ? "Generating QR code…" : "No QR code"}
              </span>
            )}
            <p className={assetStyles.qrValue}>{qrRow?.qr_code ?? qrRow?.account_code ?? "—"}</p>
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
          onOptimisticSubmit={applyIssuanceOptimistic}
          onFailure={refreshSnapshot}
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
