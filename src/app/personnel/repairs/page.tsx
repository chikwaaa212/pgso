"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CircleCheck,
  Clock3,
  LoaderCircle,
  PackageSearch,
  Plus,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/personnel/PageHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/ui/action-button";
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
import { DatePicker } from "@/components/ui/date-picker";
import { TablePager, FIXED_PAGE_SIZE } from "@/components/personnel/TablePager";
import { EmptySearchState } from "@/components/personnel/EmptySearchState";
import { ReceiptLoading } from "@/components/personnel/ReceiptLoading";
import { RepairCreateDialog } from "@/components/personnel/RepairCreateDialog";
import { useScanPrefill } from "@/hooks/use-scan-prefill";
import type { ScannedAssetPrefill } from "@/lib/scan-actions";
import { useCachedAction } from "@/hooks/use-cached-action";
import { useReceipt } from "@/hooks/use-receipt";
import { buildQueryKey, resourcePrefix } from "@/lib/query-keys";
import { CLIENT_CACHE_KEYS, bustClientCache } from "@/lib/client-cache";
import { portalFromPathname } from "@/lib/portal-path";
import { cn } from "@/lib/utils";
import RepairsLoading from "./loading";
import { RepairReceipt } from "./repair-receipt";
import { ReceiptOverlay } from "../documents/receipt-overlay";
import receiptStyles from "../inspections/components/receipt.module.css";
import {
  getRepair,
  getRepairsPage,
  setRepairStatus,
  updateRepair,
  type RepairRow,
} from "./actions";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import styles from "../dashboard/page.module.css";
import air from "../inspections/air-section.module.css";
import stockStyles from "../stocks/page.module.css";
import rep from "./page.module.css";

function tone(status: string | null) {
  if (status === "completed") return "ok";
  if (status === "in_progress") return "info";
  return "warn"; // pending
}

function statusLabel(status: string | null) {
  if (!status) return "—";
  return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");
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

function fmtCost(value: number | null) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(value);
}

function parseISODate(s: string): Date | undefined {
  if (!s) return undefined;
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function formatISODate(d: Date | undefined): string {
  if (!d) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
] as const;

type StatusTab = (typeof STATUS_TABS)[number]["value"];

/** Yellow 24px action buttons — same treatment as Assets / Stocks. */
const ACTION_BTN = cn(
  "h-6 shrink-0 gap-1.5 whitespace-nowrap rounded-[4px] border border-yellow-500 bg-yellow-500 px-3 text-xs font-semibold",
  "text-navy-900 opacity-[0.85] transition-colors hover:bg-yellow-400 hover:text-navy-900 hover:opacity-100 disabled:opacity-40"
);

/** Neutral 24px details button — label only, no icon. */
const DETAIL_BTN = cn(
  "h-6 shrink-0 whitespace-nowrap rounded-[4px] border border-navy-200 bg-white px-3 text-xs font-semibold",
  "text-navy-700 transition-colors hover:border-navy-300 hover:bg-navy-50"
);

/** The whole ticket window is loaded once; search/status/page stay local. */
const FETCH_LIMIT = 1000;

const NUMBER = new Intl.NumberFormat("en-PH");

function fmtNumber(value: number) {
  return NUMBER.format(value);
}

export default function PersonnelRepairsPage() {
  return (
    <Suspense fallback={<RepairsLoading />}>
      <PersonnelRepairsContent />
    </Suspense>
  );
}

function PersonnelRepairsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  // Super Admin reuses this page (same list, actions, dialogs and receipts).
  // Personnel see the tickets they logged; admins see every ticket and can
  // log new ones directly.
  const isAdminPortal = portalFromPathname(pathname) === "super-admin";
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [statusTab, setStatusTab] = useState<StatusTab>(() => {
    const fromUrl = searchParams.get("status");
    return STATUS_TABS.some((t) => t.value === fromUrl)
      ? (fromUrl as StatusTab)
      : "all";
  });
  // Fixed 10 rows/page (no selector) — paging runs in memory.
  const pageSize = FIXED_PAGE_SIZE;
  const [page, setPage] = useState(
    Math.max(1, Number(searchParams.get("page")) || 1)
  );
  // Only the URL write is debounced — the table reads `query` directly so
  // typing filters on the same keystroke, with no fetch involved.
  const debouncedQuery = useDebouncedValue(query, 300);
  const [actingId, setActingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  // URL persistence: page/search/status survive reload + back-navigation.
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
      status: statusTab,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedQuery, statusTab]);

  // One read for the whole own-ticket window. Search, status, and paging
  // then run in memory so results are instant and never re-fetch or show a
  // stale page while typing.
  const cacheKey = buildQueryKey({
    module: 'personnel',
    resource: 'repairs',
    page: 1,
    pageSize: FETCH_LIMIT,
    filters: { scope: "all" },
  });
  const {
    data: pageData,
    loading,
    error: pageError,
    refresh: refreshRows,
    mutate,
  } = useCachedAction(
    cacheKey,
    () => getRepairsPage({ page: 1, pageSize: FETCH_LIMIT }),
    {
      staleTime: 30_000,
    }
  );
  const rows = useMemo(() => pageData?.rows ?? [], [pageData]);

  // Optimistic create: the new pending ticket paints instantly at the top of
  // the list while `createRepair` is still running. Success replaces it with
  // the server row via `reload`; failure removes it.
  const handleOptimisticCreate = useCallback(
    (row: RepairRow) => {
      // Jump to the first page + "All" tab so the new pending ticket is
      // actually visible instead of being hidden by the active filter.
      setPage(1);
      setStatusTab("all");
      mutate((prev) =>
        prev
          ? { rows: [row, ...prev.rows], total: prev.total + 1 }
          : { rows: [row], total: 1 }
      );
    },
    [mutate]
  );

  const handleOptimisticRemove = useCallback(
    (id: string) => {
      mutate((prev) =>
        prev
          ? {
              rows: prev.rows.filter((row) => row.id !== id),
              total: Math.max(0, prev.total - 1),
            }
          : prev
      );
    },
    [mutate]
  );

  /** Patch one row in place — used by optimistic start/complete/edit writes. */
  const patchRow = useCallback(
    (row: RepairRow) => {
      mutate((prev) =>
        prev
          ? {
              ...prev,
              rows: prev.rows.map((current) =>
                current.id === row.id ? row : current
              ),
            }
          : prev
      );
    },
    [mutate]
  );

  // Create-repair dialog (shared with the super-admin portal). A scanned
  // asset tag opens it with the asset + current holder prefilled.
  const [dialogOpen, setDialogOpen] = useState(false);
  const [scanPrefill, setScanPrefill] = useState<ScannedAssetPrefill | null>(null);
  useScanPrefill(
    useCallback((prefill: ScannedAssetPrefill) => {
      setScanPrefill(prefill);
      setDialogOpen(true);
    }, [])
  );

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<RepairRow | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editTechnician, setEditTechnician] = useState("");
  const [editCost, setEditCost] = useState("");
  const [editStatus, setEditStatus] = useState("pending");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  // Read-only details overlay — keeps the table to the essential columns.
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<RepairRow | null>(null);
  const openDetails = (row: RepairRow) => {
    setDetailRow(row);
    setDetailOpen(true);
  };

  // Receipt viewer — modal-only (no dedicated page). First open fetches
  // with a spinner; repeats paint instantly from memory/sessionStorage
  // (fresh <5min skips the network, stale revalidates silently).
  const receipt = useReceipt<RepairRow | null>();
  const reload = () => {
    // Own write (log / start / complete / reopen / edit) — force fresh
    // rows now and drop sibling snapshots (dashboard counts, deliveries,
    // inspections, stocks, assets, documents, issues, requests, issuances,
    // logs) so their next visit refetches instead of serving the pre-write
    // payload. Old rows stay visible while the refetch runs (no flash).
    bustClientCache([
      CLIENT_CACHE_KEYS.dashboard,
      CLIENT_CACHE_KEYS.deliveries,
      CLIENT_CACHE_KEYS.inspections,
      CLIENT_CACHE_KEYS.inventory,
      CLIENT_CACHE_KEYS.assets,
      CLIENT_CACHE_KEYS.documents,
      CLIENT_CACHE_KEYS.issues,
      CLIENT_CACHE_KEYS.requests,
      CLIENT_CACHE_KEYS.issuances,
      CLIENT_CACHE_KEYS.logs,
      // Cached receipt overlays — a status/edit write must not leave a
      // stale receipt painting instantly on next open.
      "pgso:client:receipt",
      resourcePrefix("personnel", "dashboard"),
      resourcePrefix("personnel", "deliveries"),
      resourcePrefix("personnel", "inspections"),
      resourcePrefix("personnel", "inspections-air"),
      resourcePrefix("personnel", "inspections-counts"),
      resourcePrefix("personnel", "inventory"),
      resourcePrefix("personnel", "inventory-stats"),
      resourcePrefix("personnel", "assets"),
      resourcePrefix("personnel", "documents"),
      resourcePrefix("personnel", "documents-counts"),
      resourcePrefix("personnel", "documents-viewed"),
      resourcePrefix("personnel", "issues"),
      resourcePrefix("personnel", "issues-type-options"),
      resourcePrefix("personnel", "issues-completed"),
      resourcePrefix("personnel", "requests"),
      resourcePrefix("personnel", "issuances"),
      resourcePrefix("personnel", "logs"),
      resourcePrefix("personnel", "logs-modules"),
    ]);
    refreshRows();
  };

  // Local filtering + paging over the loaded ticket window.
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      const status = row.status ?? "pending";
      if (statusTab !== "all" && status !== statusTab) return false;
      if (!needle) return true;
      return [
        row.asset_label,
        row.account_code,
        row.account_title,
        row.asset_type,
        row.reporter_name,
        row.description,
        row.technician,
        statusLabel(row.status),
        fmt(row.repair_date),
        fmt(row.created_at),
        fmtCost(row.cost),
      ].some(
        (value) => value != null && value.toLowerCase().includes(needle)
      );
    });
  }, [rows, query, statusTab]);

  const total = filtered.length;
  const hasFilters = query.trim() !== "" || statusTab !== "all";
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const visible = filtered.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize
  );

  const stats = useMemo(() => {
    let pending = 0;
    let inProgress = 0;
    let completed = 0;
    for (const r of rows) {
      if (r.status === "completed") completed += 1;
      else if (r.status === "in_progress") inProgress += 1;
      else pending += 1;
    }
    return { total: rows.length, pending, inProgress, completed };
  }, [rows]);

  const clearFilters = () => {
    setQuery("");
    setStatusTab("all");
    setPage(1);
  };

  // Cold start only: background refetches keep stale rows visible instead of
  // flashing the full skeleton.
  if (loading && rows.length === 0) {
    return <RepairsLoading />;
  }

  async function onProgress(id: string, status: string) {
    if (actingId) return;
    const previous = rows.find((row) => row.id === id) ?? null;
    setActingId(id);
    setActionError("");
    // Paint the new status immediately; the server write runs behind it.
    if (previous) patchRow({ ...previous, status });
    try {
      const res = await setRepairStatus(id, status);
      if (!res.success) {
        if (previous) patchRow(previous);
        const msg = res.error ?? "Failed to update the repair.";
        setActionError(msg);
        toast.error(msg, { duration: 2000, closeButton: true });
        return;
      }
      reload();
      toast.success(
        status === "completed"
          ? "Repair completed."
          : status === "in_progress"
            ? "Repair started."
            : "Repair updated.",
        { duration: 2000, closeButton: true }
      );
    } catch {
      if (previous) patchRow(previous);
      const msg = "Failed to update the repair. Please try again.";
      setActionError(msg);
      toast.error(msg, { duration: 2000, closeButton: true });
    } finally {
      setActingId(null);
    }
  }

  function openEdit(row: RepairRow) {
    setDetailOpen(false);
    setEditing(row);
    setEditDate(row.repair_date.slice(0, 10));
    setEditDescription(row.description);
    setEditTechnician(row.technician ?? "");
    setEditCost(row.cost != null ? String(row.cost) : "");
    setEditStatus(row.status ?? "pending");
    setEditError("");
    setEditOpen(true);
  }

  function openStart(row: RepairRow) {
    // Starting a repair requires the full info — open the form with
    // progress preset to in_progress instead of flipping status directly.
    setDetailOpen(false);
    setEditing(row);
    setEditDate(row.repair_date.slice(0, 10));
    setEditDescription(row.description);
    setEditTechnician(row.technician ?? "");
    setEditCost(row.cost != null ? String(row.cost) : "");
    setEditStatus("in_progress");
    setEditError("");
    setEditOpen(true);
  }

  function openComplete(row: RepairRow) {
    // Completing requires the final info (technician + cost) — collect it
    // in the form instead of flipping status directly.
    setDetailOpen(false);
    setEditing(row);
    setEditDate(row.repair_date.slice(0, 10));
    setEditDescription(row.description);
    setEditTechnician(row.technician ?? "");
    setEditCost(row.cost != null ? String(row.cost) : "");
    setEditStatus("completed");
    setEditError("");
    setEditOpen(true);
  }

  async function onEditSave() {
    if (!editing || editSaving) return;
    const target = editing;
    const optimistic: RepairRow = {
      ...target,
      repair_date: editDate,
      description: editDescription.trim(),
      technician: editTechnician.trim() || null,
      cost: editCostNum,
      status: editStatus,
    };
    setEditSaving(true);
    setEditError("");
    // Instant close + instant row patch; the write runs in the background.
    setEditOpen(false);
    patchRow(optimistic);
    try {
      const res = await updateRepair(target.id, {
        repairDate: editDate,
        description: editDescription,
        technician: editTechnician,
        cost: editCost,
        status: editStatus,
      });
      if (!res.success) {
        patchRow(target);
        const msg = res.error ?? "Failed to update the repair.";
        setEditError(msg);
        toast.error(msg, { duration: 2000, closeButton: true });
        return;
      }
      setEditing(null);
      reload();
      const doneLabel =
        editStatus === "completed"
          ? "Repair completed."
          : editStatus === "in_progress"
            ? "Repair started."
            : "Repair updated.";
      toast.success(doneLabel, { duration: 2000, closeButton: true });
    } catch {
      patchRow(target);
      const msg = "Failed to update the repair. Please try again.";
      setEditError(msg);
      toast.error(msg, { duration: 2000, closeButton: true });
    } finally {
      setEditSaving(false);
    }
  }

  const editCostNum = editCost.trim() === "" ? null : Number(editCost);
  const canEditSave =
    editing !== null &&
    editDescription.trim() !== "" &&
    editDate !== "" &&
    (editCostNum === null ||
      (Number.isFinite(editCostNum) && editCostNum >= 0)) &&
    // Starting or finishing requires the full info.
    ((editStatus !== "in_progress" && editStatus !== "completed") ||
      editTechnician.trim() !== "") &&
    (editStatus !== "completed" || editCostNum !== null);

  return (
    <section className={styles.section}>
      <PageHeader
        eyebrow="Maintenance"
        title="Repairs"
        subtitle={
          isAdminPortal
            ? "Every repair ticket across all personnel — from pending drop-offs to completed receipts."
            : "Only the repair tickets you logged, in one place — from pending drop-offs to completed receipts."
        }
        meta={`${pageData ? fmtNumber(stats.total) : "—"} ticket${
          stats.total === 1 ? "" : "s"
        } ${isAdminPortal ? "across all personnel" : "in your queue"}`}
        actions={
          <div className={styles.actions}>
            <Button
              type="button"
              onClick={() => {
                setScanPrefill(null);
                setDialogOpen(true);
              }}
              className={ACTION_BTN}
            >
              <Plus size={13} aria-hidden="true" />
              New repair
            </Button>
          </div>
        }
      />

      {actionError ? (
        <p className={air.syncMsg} role="alert">
          {actionError}
        </p>
      ) : null}

      <div className={rep.summary}>
        <div className={stockStyles.summaryCard}>
          <span className={stockStyles.summaryIcon}>
            <Wrench size={16} aria-hidden="true" />
          </span>
          <div className={stockStyles.summaryBody}>
            <p className={stockStyles.summaryLabel}>Total tickets</p>
            <p className={stockStyles.summaryValue}>
              {pageData ? fmtNumber(stats.total) : "—"}
            </p>
            <p className={stockStyles.summaryMeta}>
              {isAdminPortal
                ? "All repair tickets across personnel"
                : "Repair tickets you logged"}
            </p>
          </div>
        </div>

        <div
          className={stockStyles.summaryCard}
          data-tone={stats.pending > 0 ? "warn" : undefined}
        >
          <span className={stockStyles.summaryIcon}>
            <Clock3 size={16} aria-hidden="true" />
          </span>
          <div className={stockStyles.summaryBody}>
            <p className={stockStyles.summaryLabel}>Pending</p>
            <p className={stockStyles.summaryValue}>
              {pageData ? fmtNumber(stats.pending) : "—"}
            </p>
            <p className={stockStyles.summaryMeta}>
              {stats.pending > 0
                ? "Waiting to be started"
                : "Nothing waiting to start"}
            </p>
          </div>
        </div>

        <div
          className={stockStyles.summaryCard}
          data-tone={stats.inProgress > 0 ? "info" : undefined}
        >
          <span className={stockStyles.summaryIcon}>
            <LoaderCircle size={16} aria-hidden="true" />
          </span>
          <div className={stockStyles.summaryBody}>
            <p className={stockStyles.summaryLabel}>In progress</p>
            <p className={stockStyles.summaryValue}>
              {pageData ? fmtNumber(stats.inProgress) : "—"}
            </p>
            <p className={stockStyles.summaryMeta}>
              Currently being repaired
            </p>
          </div>
        </div>

        <div className={stockStyles.summaryCard}>
          <span className={stockStyles.summaryIcon}>
            <CircleCheck size={16} aria-hidden="true" />
          </span>
          <div className={stockStyles.summaryBody}>
            <p className={stockStyles.summaryLabel}>Completed</p>
            <p className={stockStyles.summaryValue}>
              {pageData ? fmtNumber(stats.completed) : "—"}
            </p>
            <p className={stockStyles.summaryMeta}>
              Closed with a receipt
            </p>
          </div>
        </div>
      </div>

      <div className={rep.tabsRow}>
        <div className={air.tabs} role="tablist" aria-label="Filter by status">
          {STATUS_TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={statusTab === t.value}
              className={air.tab}
              data-active={statusTab === t.value}
              onClick={() => {
                setStatusTab(t.value);
                setPage(1);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <Card className={stockStyles.panel}>
        <div className={stockStyles.toolbar}>
          <p className={stockStyles.toolbarInfo} aria-live="polite">
            {!pageData ? (
              "Loading repair tickets…"
            ) : hasFilters ? (
              <>
                Showing <strong>{fmtNumber(total)}</strong> of{" "}
                {fmtNumber(rows.length)} ticket
                {rows.length !== 1 ? "s" : ""}
              </>
            ) : (
              <>
                <strong>{fmtNumber(rows.length)}</strong> ticket
                {rows.length !== 1 ? "s" : ""} in repairs
              </>
            )}
            {pageData && pageData.total > rows.length
              ? ` · first ${fmtNumber(rows.length)} loaded`
              : ""}
          </p>

          <div className={stockStyles.filters}>
            <Input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search asset, reporter, technician, issue…"
              className={stockStyles.search}
              aria-label="Search repairs"
            />
          </div>
        </div>

        {pageError && rows.length === 0 && !loading ? (
          <div className={stockStyles.empty} role="alert">
            <span className={stockStyles.emptyIcon}>
              <PackageSearch size={20} aria-hidden="true" />
            </span>
            <p className={stockStyles.emptyTitle}>
              Could not load repair tickets
            </p>
            <p className={stockStyles.emptyText}>
              The repairs service did not respond. Refresh the page to try
              again.
            </p>
          </div>
        ) : visible.length === 0 ? (
          hasFilters ? (
            <EmptySearchState
              description="Try a different search term, asset, reporter, technician, or status."
              onClear={clearFilters}
            />
          ) : (
            <div className={stockStyles.empty}>
              <span className={stockStyles.emptyIcon}>
                <PackageSearch size={20} aria-hidden="true" />
              </span>
              <p className={stockStyles.emptyTitle}>No repair tickets yet</p>
              <p className={stockStyles.emptyText}>
                Log the first ticket to start tracking repairs. Approved repair
                requests also create tickets here automatically.
              </p>
              <div className={stockStyles.emptyActions}>
                <button
                  type="button"
                  className={ACTION_BTN}
                  onClick={() => {
                    setScanPrefill(null);
                    setDialogOpen(true);
                  }}
                >
                  <Plus size={13} aria-hidden="true" />
                  Log the first repair
                </button>
              </div>
            </div>
          )
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Reported by</th>
                  <th>Issue</th>
                  <th>Cost</th>
                  <th>Progress</th>
                  <th>Details</th>
                  <th className={rep.actionHeader}>Action</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const status = r.status ?? "pending";
                  const isOptimistic = r.id.startsWith("temp-");
                  const busy = actingId === r.id || isOptimistic;
                  const actionLabel =
                    status === "pending"
                      ? "Start repair"
                      : status === "in_progress"
                        ? "Complete repair"
                        : "Reopen repair";
                  return (
                    <tr key={r.id}>
                      <td
                        className={rep.assetCell}
                        title={r.asset_label ?? undefined}
                      >
                        <span className={rep.assetTitle}>
                          {r.asset_label ?? r.asset_id.slice(0, 8)}
                        </span>
                      </td>
                      <td>{r.reporter_name}</td>
                      <td className={rep.issueCell}>
                        <span
                          className={rep.issueText}
                          title={r.description ?? undefined}
                        >
                          {r.description}
                        </span>
                      </td>
                      <td className={rep.costCell}>{fmtCost(r.cost)}</td>
                      <td>
                        {isOptimistic ? (
                          <span
                            className={rep.statusBadge}
                            data-tone="none"
                            aria-live="polite"
                          >
                            Saving…
                          </span>
                        ) : (
                          <span
                            className={rep.statusBadge}
                            data-tone={tone(r.status)}
                          >
                            {statusLabel(r.status)}
                          </span>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className={DETAIL_BTN}
                          disabled={isOptimistic}
                          onClick={() => openDetails(r)}
                        >
                          View details
                        </button>
                      </td>
                      <td className={rep.actionCell}>
                        <button
                          type="button"
                          className={ACTION_BTN}
                          disabled={busy}
                          onClick={() => {
                            if (status === "pending") openStart(r);
                            else if (status === "in_progress") openComplete(r);
                            else void onProgress(r.id, "in_progress");
                          }}
                        >
                          {busy ? "Saving…" : actionLabel}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {total > 0 ? (
          <div className={stockStyles.footer}>
            {total > pageSize ? (
              <TablePager
                id="repairs"
                total={total}
                page={safePage}
                pageSize={pageSize}
                onPageChange={setPage}
              />
            ) : (
              <span className={stockStyles.footerInfo}>
                Showing all {fmtNumber(total)} ticket
                {total !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        ) : null}
      </Card>

      <RepairCreateDialog
        open={dialogOpen}
        onOpenChange={(next) => {
          setDialogOpen(next);
          if (!next) setScanPrefill(null);
        }}
        prefill={scanPrefill}
        onCreated={reload}
        onOptimisticCreate={handleOptimisticCreate}
        onOptimisticRemove={handleOptimisticRemove}
      />

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Repair details</DialogTitle>
            <DialogDescription>
              {detailRow?.asset_label ?? "Repair ticket"}
            </DialogDescription>
          </DialogHeader>

          {detailRow ? (
            <div className={rep.detailBody}>
              <div className={rep.detailHead}>
                <span
                  className={rep.statusBadge}
                  data-tone={tone(detailRow.status)}
                >
                  {statusLabel(detailRow.status)}
                </span>
                <span className={rep.detailCost}>
                  {fmtCost(detailRow.cost)}
                </span>
              </div>

              <dl className={rep.detailGrid}>
                <div>
                  <dt>Asset</dt>
                  <dd>{detailRow.asset_label ?? "Repair ticket"}</dd>
                </div>
                <div>
                  <dt>Reported by</dt>
                  <dd>{detailRow.reporter_name}</dd>
                </div>
                <div>
                  <dt>Account code</dt>
                  <dd>{detailRow.account_code ?? "Not set"}</dd>
                </div>
                <div>
                  <dt>Account title</dt>
                  <dd>{detailRow.account_title ?? "Not set"}</dd>
                </div>
                <div>
                  <dt>Asset type</dt>
                  <dd>{detailRow.asset_type ?? "Not set"}</dd>
                </div>
                <div>
                  <dt>Repair date</dt>
                  <dd>{fmt(detailRow.repair_date)}</dd>
                </div>
                <div>
                  <dt>Technician</dt>
                  <dd>{detailRow.technician ?? "Unassigned"}</dd>
                </div>
                <div>
                  <dt>Logged</dt>
                  <dd>{fmt(detailRow.created_at)}</dd>
                </div>
              </dl>

              <div>
                <p className={rep.detailLabel}>Issue</p>
                <p className={rep.detailIssue}>{detailRow.description}</p>
              </div>
            </div>
          ) : null}

          <DialogFooter className="items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDetailOpen(false)}
              className={`${DETAIL_BTN} bg-white`}
            >
              Close
            </Button>
            {detailRow?.status === "completed" ? (
              <Button
                type="button"
                variant="outline"
                className={`${DETAIL_BTN} bg-white`}
                onClick={() => {
                  const row = detailRow;
                  setDetailOpen(false);
                  receipt.open(row.id, `repair:${row.id}`, () =>
                    getRepair(row.id)
                  );
                }}
              >
                View receipt
              </Button>
            ) : null}
            <Button
              type="button"
              variant="warning"
              className={`${ACTION_BTN} bg-yellow-500`}
              onClick={() => detailRow && openEdit(detailRow)}
            >
              Edit ticket
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editStatus === "completed" &&
              editing?.status !== "completed"
                ? "Complete repair"
                : editing?.status === "pending" &&
                    editStatus === "in_progress"
                  ? "Start repair"
                  : "Update repair"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? `Editing ticket for ${editing.asset_label ?? "asset"}.`
                : "Update the repair ticket."}{" "}
              {editStatus === "in_progress"
                ? "Starting requires a technician, repair date, and issue."
                : editStatus === "completed"
                  ? "Completing requires a technician and the final cost."
                  : null}
            </DialogDescription>
          </DialogHeader>

          <div className={rep.formGrid}>
            <div className={rep.field}>
              <Label htmlFor="rep-edit-status">Progress</Label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger id="rep-edit-status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_progress">In progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className={rep.field}>
              <Label htmlFor="rep-edit-date">
                Repair date <span className="text-red-600">*</span>
              </Label>
              <DatePicker
                id="rep-edit-date"
                value={parseISODate(editDate)}
                onChange={(date) => setEditDate(formatISODate(date))}
                placeholder="Pick a repair date"
                className="h-9 px-3 text-sm"
              />
            </div>

            <div className={`${rep.field} ${rep.span2}`}>
              <Label htmlFor="rep-edit-desc">
                Issue <span className="text-red-600">*</span>
              </Label>
              <textarea
                id="rep-edit-desc"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={2}
                className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
              />
            </div>

            <div className={rep.field}>
              <Label htmlFor="rep-edit-tech">
                Technician{" "}
                {editStatus === "in_progress" ||
                editStatus === "completed" ? (
                  <span className="text-red-600">*</span>
                ) : (
                  <span className="text-xs font-normal text-zinc-500">
                    (optional)
                  </span>
                )}
              </Label>
              <Input
                id="rep-edit-tech"
                type="text"
                value={editTechnician}
                onChange={(e) => setEditTechnician(e.target.value)}
                placeholder="e.g. J. Santos"
              />
              {editStatus === "in_progress" ||
              editStatus === "completed" ? (
                <p className="text-xs text-zinc-500">
                  Required to {editStatus === "completed" ? "complete" : "start"} the repair.
                </p>
              ) : null}
            </div>

            <div className={rep.field}>
              <Label htmlFor="rep-edit-cost">
                Cost (₱){" "}
                {editStatus === "completed" ? (
                  <span className="text-red-600">*</span>
                ) : (
                  <span className="text-xs font-normal text-zinc-500">
                    (optional)
                  </span>
                )}
              </Label>
              <Input
                id="rep-edit-cost"
                type="number"
                min={0}
                step="0.01"
                value={editCost}
                onChange={(e) => setEditCost(e.target.value)}
                placeholder={
                  editStatus === "completed"
                    ? "Required to complete"
                    : "Optional"
                }
              />
              {editStatus === "completed" ? (
                <p className="text-xs text-zinc-500">
                  Final cost is required to complete the repair.
                </p>
              ) : null}
            </div>
          </div>

          {editError ? (
            <p
              role="alert"
              className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
            >
              {editError}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditOpen(false)}
              disabled={editSaving}
              className="h-6 rounded-[4px] px-3 text-xs font-semibold"
            >
              Cancel
            </Button>
            <ActionButton
              type="button"
              variant="warning"
              disabled={!canEditSave || editSaving}
              onClick={() => onEditSave()}
              loadingLabel={
                editStatus === "completed" && editing?.status !== "completed"
                  ? "Completing…"
                  : editing?.status === "pending" &&
                      editStatus === "in_progress"
                    ? "Starting…"
                    : "Saving…"
              }
              className="h-6 gap-2 rounded-[4px] border border-yellow-500 bg-yellow-500 px-3 text-xs font-semibold text-navy-900 hover:bg-yellow-400"
            >
              {editStatus === "completed" && editing?.status !== "completed"
                ? "Complete repair"
                : editing?.status === "pending" &&
                    editStatus === "in_progress"
                  ? "Start repair"
                  : "Save changes"}
            </ActionButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReceiptOverlay
        open={receipt.selectedId !== null}
        title="Repair receipt"
        onClose={receipt.close}
      >
        {receipt.docLoading ||
        (receipt.selectedId !== null && !receipt.doc) ? (
          <ReceiptLoading label="Loading receipt…" />
        ) : receipt.doc ? (
          <div
            className={receiptStyles.receiptStack}
            style={{ maxWidth: "none" }}
          >
            <RepairReceipt repair={receipt.doc} />
            <p className={styles.panelSub} style={{ textAlign: "center" }}>
              <Button
                type="button"
                variant="outline"
                onClick={() => window.print()}
                className="h-8 rounded-[4px] px-3.5 text-xs font-semibold"
              >
                Print / Save PDF
              </Button>
            </p>
          </div>
        ) : (
          <div className={styles.emptyState}>
            <p className={styles.panelSub}>
              This record is no longer available.
            </p>
          </div>
        )}
      </ReceiptOverlay>
    </section>
  );
}
