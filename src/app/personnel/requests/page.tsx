"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Boxes,
  Check,
  CheckCheck,
  Clock,
  Eye,
  Inbox,
  Package,
  Plus,
  Search,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/personnel/PageHeader";
/* Loader2 now provided via ActionButton spinner */
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createRequest,
  getRequestFormOptions,
  getRequestsPage,
  setRequestStatus,
  type AssetOption,
  type EmployeeOption,
  type RequestRow,
} from "./actions";
import { IssuanceEvaluateDialog } from "@/components/personnel/IssuanceDialog";
import { RequestQrButton } from "@/components/personnel/RequestQrButton";
import { ScanTransferDialog } from "@/components/personnel/ScanTransferDialog";
import { useScanPrefill } from "@/hooks/use-scan-prefill";
import type { ScannedAssetPrefill } from "@/lib/scan-actions";
import {
  requestTypeLabel,
  type RequestStatus,
} from "./request-types";
import { formatPeso } from "@/lib/issuance-rules";
import { TablePager, FIXED_PAGE_SIZE } from "@/components/personnel/TablePager";
import { useCachedAction } from "@/hooks/use-cached-action";
import { buildQueryKey, resourcePrefix } from "@/lib/query-keys";
import { CLIENT_CACHE_KEYS, bustClientCache } from "@/lib/client-cache";
import RequestsLoading from "./loading";
import req from "./page.module.css";
import { EmptySearchState } from "@/components/personnel/EmptySearchState";
import { portalFromPathname } from "@/lib/portal-path";

function tone(status: string | null) {
  if (status === "approved") return "info";
  if (status === "completed") return "ok";
  if (status === "rejected") return "bad";
  return "warn"; // pending
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

/** "pending" → "Pending"; null falls back to pending. */
function statusLabel(status: string | null) {
  const value = status ?? "pending";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "completed", label: "Completed" },
] as const;

const TYPE_FILTERS = [
  { value: "all", label: "Type: All" },
  { value: "transfer", label: "Transfer" },
  { value: "new_assignment", label: "New Assignment" },
  { value: "repair", label: "Repair" },
  { value: "stock_replenishment", label: "Stock Replenishment" },
] as const;

/** One read per visit — the queue window is fetched once, then search,
 *  status, type, and paging all run in memory (same as Assets / Documents). */
const FETCH_LIMIT = 100;

interface ReqLine {
  key: number;
  assetId: string;
  itemNeeded: string;
  quantity: string;
}

function blankLine(key: number): ReqLine {
  return { key, assetId: "", itemNeeded: "", quantity: "1" };
}

/** Keep digits only — a quantity field must never hold a sign or exponent. */
function digitsOnly(value: string): string {
  return value.replace(/[^\d]/g, "");
}

/** Clamp a typed quantity into [1, max]; empty stays empty while typing so
 *  the field can be cleared and retyped. */
function clampQuantity(value: string, max: number): string {
  const digits = digitsOnly(value);
  if (digits === "") return "";
  const ceiling = Math.max(1, Math.floor(max));
  const n = Math.min(Math.max(1, Number(digits)), ceiling);
  return String(Number.isFinite(n) ? n : 1);
}

/** Dropdown row for the item pickers — name first, then the catalog facts,
 *  with an availability/shortage pill on the right. */
function ItemOption({ item }: { item: AssetOption }) {
  const isStock = item.kind === "stock";
  const isStockTab = item.tab === "stock";
  const code = item.account_code?.trim() ?? "";
  const name =
    code && item.label.startsWith(`${code} — `)
      ? item.label.slice(code.length + 3)
      : item.label;
  const statusText = (() => {
    const status = (item.status ?? "available").trim();
    return status ? status.charAt(0).toUpperCase() + status.slice(1) : "Available";
  })();
  const badge = item.disabledReason
    ? item.disabledReason
    : isStock
      ? item.quantity != null
        ? `${item.quantity} on hand`
        : "Stock"
      : statusText;
  const tone = item.disabledReason
    ? "bad"
    : isStock
      ? item.quantity == null
        ? "none"
        : item.quantity <= 0
          ? "bad"
          : item.quantity <= 5
            ? "warn"
            : "ok"
      : "ok";

  return (
    <span className={req.itemOption}>
      <span className={req.itemOptionIcon} data-kind={item.tab} aria-hidden="true">
        {isStockTab ? <Boxes size={14} /> : <Package size={14} />}
      </span>
      <span className={req.itemOptionBody}>
        <span className={req.itemOptionTitle}>{name}</span>
        <span className={req.itemOptionMeta}>
          {code ? <span className={req.itemOptionCode}>{code}</span> : null}
          {item.location ? (
            <span className={req.itemOptionMetaText}>{item.location}</span>
          ) : null}
        </span>
      </span>
      <span className={req.itemOptionBadge} data-tone={tone}>
        {badge}
      </span>
    </span>
  );
}

/** Grouped dropdown rows: registered assets first, then delivered stock lots.
 *  Group headers only appear when both kinds are present. */
function ItemChoices({
  items,
  disableUnavailable = false,
}: {
  items: AssetOption[];
  disableUnavailable?: boolean;
}) {
  const groups = [
    { tab: "asset" as const, label: "Registered assets" },
    { tab: "stock" as const, label: "Delivered / stock items" },
  ];
  const rowsByKind = groups.map((group) => ({
    ...group,
    rows: items.filter((item) => item.tab === group.tab),
  }));
  const showLabels = rowsByKind.every((group) => group.rows.length > 0);

  if (items.length === 0) {
    return (
      <p className={req.itemEmpty}>
        No available items in this tab yet. Switch tabs to see other stock.
      </p>
    );
  }

  return (
    <>
      {rowsByKind.map((group) =>
        group.rows.length === 0 ? null : (
          <SelectGroup key={group.tab}>
            {showLabels ? (
              <SelectLabel className={req.itemGroupLabel}>
                {group.label}
              </SelectLabel>
            ) : null}
            {group.rows.map((item) => (
              <SelectItem
                key={item.id}
                value={item.id}
                disabled={disableUnavailable && item.disabledReason != null}
                className={req.itemSelectItem}
              >
                <ItemOption item={item} />
              </SelectItem>
            ))}
          </SelectGroup>
        )
      )}
    </>
  );
}

/** Trigger label for a picked item — keeps the closed select to one clean line. */
function ItemValue({ item }: { item: AssetOption | null }) {
  return item ? (
    <span className={req.itemValue}>{item.label}</span>
  ) : null;
}

/** Selected-item banner — the same "what did I just pick?" summary shown when
 *  logging a delivery: name first, then the catalog facts that identify it. */
function PickedItemCard({ item }: { item: AssetOption }) {
  // `kind` says how it is tracked (a lot carries a quantity); `tab` says how
  // the registry files it (asset register / inspected asset-kind lot vs stock).
  const quantityTracked = item.kind === "stock";
  const isStock = item.tab === "stock";
  const facts = [
    { label: isStock ? "Stock code" : "Account code", value: item.account_code },
    {
      label: isStock ? "Stock title" : "Account title",
      value: item.account_title,
    },
    { label: isStock ? "Stock type" : "Asset type", value: item.asset_type },
    quantityTracked
      ? {
          label: "Quantity on hand",
          value: item.quantity != null ? String(item.quantity) : null,
        }
      : { label: "Status", value: item.status },
  ];

  return (
    <div className={req.itemBanner}>
      <div className={req.itemBannerHead}>
        <span className={req.itemBannerIcon} aria-hidden="true">
          <Package size={16} />
        </span>
        <div className={req.itemBannerText}>
          <p className={req.itemBannerTitle}>{item.label}</p>
          <p className={req.itemBannerSub}>
            {isStock ? "Stock item" : "Registered asset"}
            {item.location ? ` · ${item.location}` : ""}
          </p>
        </div>
        <span className={req.itemKind} data-kind={item.tab}>
          {isStock ? "Stock" : "Asset"}
        </span>
      </div>
      <dl className={req.itemFacts}>
        {facts.map((fact) => (
          <div key={fact.label}>
            <dt>{fact.label}</dt>
            <dd data-empty={!fact.value ? "true" : undefined}>
              {fact.value ?? "Not set"}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function PersonnelRequestsPage() {
  return (
    <Suspense fallback={<RequestsLoading />}>
      <PersonnelRequestsContent />
    </Suspense>
  );
}

function PersonnelRequestsContent() {
  // Super Admin reuses this page (same UI + actions). Personnel only see the
  // requests sent to them; the admin sees the whole queue so they can act on
  // requests sent to any personnel, exactly like their own.
  const isAdminPortal = portalFromPathname(usePathname()) === "super-admin";
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [statusTab, setStatusTab] =
    useState<(typeof STATUS_TABS)[number]["value"]>("all");
  const [typeFilter, setTypeFilter] = useState("all");
  // Fixed 10 rows/page (no selector) — paging runs locally over the loaded
  // queue window, so changing page or typing never triggers a read.
  const pageSize = FIXED_PAGE_SIZE;
  const [page, setPage] = useState(1);
  // One read for the whole queue window. Search, status, type, and paging
  // then filter in memory on the same keystroke — no fetch, no stale page.
  const cacheKey = buildQueryKey({
    module: 'personnel',
    resource: 'requests',
    page: 1,
    pageSize: FETCH_LIMIT,
    filters: {},
  });
  const {
    data: snapshot,
    loading,
    refresh: refreshRows,
  } = useCachedAction(
    cacheKey,
    () =>
      getRequestsPage(
        isAdminPortal
          ? { page: 1, pageSize: FETCH_LIMIT }
          : { forRecipient: true, page: 1, pageSize: FETCH_LIMIT }
      ),
    {
      staleTime: 30_000,
    }
  );
  const baseRows = useMemo(() => snapshot?.rows ?? [], [snapshot]);
  // Server total for the whole queue (the loaded window may be shorter).
  const queueTotal = snapshot?.total ?? 0;
  // Local optimistic copy — takes over display while an approve / reject /
  // complete write confirms in the background. Cleared whenever fresh
  // server rows arrive so server truth always wins.
  const [rowsState, setRowsState] = useState<RequestRow[] | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fresh server rows replace optimistic rows
    setRowsState(null);
  }, [snapshot]);
  const rows = rowsState ?? baseRows;
  const [actingId, setActingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [actionOpen, setActionOpen] = useState(false);
  const [actionRow, setActionRow] = useState<RequestRow | null>(null);
  const [actionStatus, setActionStatus] = useState<RequestStatus>("approved");
  const [actionNote, setActionNote] = useState("");
  const [actionSaving, setActionSaving] = useState(false);
  const [actionFormError, setActionFormError] = useState("");
  const [issuanceOpen, setIssuanceOpen] = useState(false);
  const [issuanceRequest, setIssuanceRequest] = useState<RequestRow | null>(null);
  const [detailRow, setDetailRow] = useState<RequestRow | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  // Full pick-list (registered assets + stock lots), loaded once per dialog.
  const [assets, setAssets] = useState<AssetOption[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [requestType, setRequestType] = useState("transfer");
  const [assetId, setAssetId] = useState("");
  // Item details starts by picking the kind (asset vs stock) with a tab banner;
  // search and the item picker then only show that kind.
  const [itemKind, setItemKind] = useState<"asset" | "stock">("asset");
  const [restockQty, setRestockQty] = useState("10");
  const [transferQty, setTransferQty] = useState("1");
  const [transferTo, setTransferTo] = useState("");
  // Transfer target defaults to picking an existing employee; manual typing
  // stays available for names outside the system (offices, guests).
  const [transferToMode, setTransferToMode] = useState<"select" | "manual">(
    "select"
  );
  const [transferToId, setTransferToId] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [reason, setReason] = useState("");
  // Multi-item lines for new_assignment (transfer/repair stay single-item,
  // which may be an assets-table row or an inventory stock lot).
  const [lines, setLines] = useState<ReqLine[]>([blankLine(1)]);
  const [lineSeq, setLineSeq] = useState(2);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Scan deep link (`?asset=…&scan=transfer|replenish`): compact dialog,
  // separate from the multi-type filing dialog above.
  const [scanPrefill, setScanPrefill] = useState<ScannedAssetPrefill | null>(null);
  const [scanIntent, setScanIntent] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  useScanPrefill(
    useCallback((prefill: ScannedAssetPrefill, scan: string | null) => {
      setScanPrefill(prefill);
      setScanIntent(scan);
      setScanOpen(true);
    }, [])
  );

  const reload = () => {
    // Own write (file / approve / reject / complete / issue) — force fresh
    // rows now and drop sibling snapshots (dashboard counts, stocks, assets,
    // inspections, documents, issues, issuances, logs) so their next visit refetches instead
    // of serving the pre-write payload. Old rows stay visible while the
    // refetch runs (no skeleton flash).
    bustClientCache([
      CLIENT_CACHE_KEYS.dashboard,
      CLIENT_CACHE_KEYS.deliveries,
      CLIENT_CACHE_KEYS.inspections,
      CLIENT_CACHE_KEYS.inventory,
      CLIENT_CACHE_KEYS.assets,
      CLIENT_CACHE_KEYS.documents,
      CLIENT_CACHE_KEYS.issues,
      CLIENT_CACHE_KEYS.issuances,
      CLIENT_CACHE_KEYS.logs,
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
      resourcePrefix("personnel", "issuances"),
      resourcePrefix("personnel", "logs"),
      resourcePrefix("personnel", "logs-modules"),
    ]);
    refreshRows();
  };

  useEffect(() => {
    if (!dialogOpen) return;
    // Dropdown-only picker: load the full available list each open so newly
    // delivered or added items appear without a search step.
    let live = true;
    void getRequestFormOptions({}).then((opts) => {
      if (!live) return;
      setEmployees(opts.employees);
      setAssets(opts.assets);
    });
    return () => {
      live = false;
    };
  }, [dialogOpen]);

  const visiblePool = assets;
  const lookupPool = assets;

  // Local filtering + paging over the loaded queue window (server order).
  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((r) => {
      const status = r.status ?? "pending";
      if (statusTab !== "all" && status !== statusTab) return false;
      if (typeFilter !== "all" && r.request_type !== typeFilter) return false;
      if (!needle) return true;
      return [
        r.employee_name,
        r.recipient_name,
        r.asset_label,
        r.description,
        r.request_type,
        r.status,
        r.account_code,
      ].some(
        (value) =>
          value != null && String(value).toLowerCase().includes(needle)
      );
    });
  }, [rows, query, statusTab, typeFilter]);

  const total = filteredRows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const visible = filteredRows.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize
  );

  // Deep link from a Recommendation ("Open request"): jump to the request's
  // page and flash its row so the reader does not have to search the queue.
  const [locatedId, setLocatedId] = useState<string | null>(null);
  const highlightHandled = useRef<string | null>(null);
  useEffect(() => {
    const highlightId = searchParams.get("highlight");
    if (!highlightId || loading) return;
    const index = filteredRows.findIndex((r) => r.id === highlightId);
    if (index < 0) return;
    if (highlightHandled.current === highlightId) return;
    highlightHandled.current = highlightId;
    setPage(Math.floor(index / pageSize) + 1);
    setLocatedId(highlightId);
    const scroll = window.setTimeout(() => {
      document
        .querySelector(`tr[data-highlight-id="${highlightId}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
    const clear = window.setTimeout(() => setLocatedId(null), 5000);
    return () => {
      window.clearTimeout(scroll);
      window.clearTimeout(clear);
    };
  }, [filteredRows, loading, pageSize, searchParams]);

  const pendingCount = rows.filter(
    (r) => (r.status ?? "pending") === "pending"
  ).length;
  const approvedCount = rows.filter((r) => r.status === "approved").length;
  const completedCount = rows.filter((r) => r.status === "completed").length;
  const hasFilters =
    query.trim() !== "" || statusTab !== "all" || typeFilter !== "all";

  // Cold start only: background refetches keep the loaded rows visible
  // instead of flashing the skeleton (no stale stack on every keystroke).
  if (loading && baseRows.length === 0) {
    return <RequestsLoading />;
  }

  function openAction(row: RequestRow, status: RequestStatus) {
    setActionRow(row);
    setActionStatus(status);
    setActionNote("");
    setActionFormError("");
    setActionError("");
    setActionOpen(true);
  }

  async function onActionConfirm() {
    if (!actionRow || actionSaving) return;
    if (actionNote.trim() === "") {
      setActionFormError("Enter remarks for this action.");
      return;
    }
    const target = actionRow;
    const status = actionStatus;
    const note = actionNote;
    const prevRows = rows;
    const nowIso = new Date().toISOString();
    // Approving closes transfer / repair / stock-replenishment requests out in
    // one step on the server, so paint "completed" optimistically to match
    // (new assignments are evaluated through the issuance dialog instead).
    const optimisticStatus: RequestStatus =
      status === "approved" && target.request_type !== "new_assignment"
        ? "completed"
        : status;
    const copy =
      status === "approved"
        ? {
            done:
              optimisticStatus === "completed"
                ? "Request approved and completed."
                : "Request approved. The employee can see the update now.",
            fail: "We couldn't approve this request.",
          }
        : status === "rejected"
          ? {
              done: "Request rejected. Your remarks have been saved.",
              fail: "We couldn't reject this request.",
            }
          : {
              done: "Request completed. Everything is wrapped up.",
              fail: "We couldn't complete this request.",
            };
    // Optimistic + instant: paint the new status and close the modal right
    // away, then let the write confirm in the background. Failures roll the
    // row back and explain what happened in a toast.
    setActionSaving(true);
    setActionFormError("");
    setActingId(target.id);
    setRowsState((cur) =>
      (cur ?? baseRows).map((r) =>
        r.id === target.id
          ? {
              ...r,
              status: optimisticStatus,
              date_resolved:
                optimisticStatus === "completed" ? nowIso : r.date_resolved,
            }
          : r
      )
    );
    setActionOpen(false);
    setActionRow(null);
    setActionNote("");
    try {
      const res = await setRequestStatus(target.id, status, note);
      if (!res.success) {
        setRowsState(prevRows);
        toast.error(copy.fail, {
          description: res.error ?? "Please try again in a moment.",
          duration: 3500,
          closeButton: true,
        });
        return;
      }
      toast.success(copy.done, { duration: 2500, closeButton: true });
      reload();
    } catch {
      setRowsState(prevRows);
      toast.error(copy.fail, {
        description: "Check your connection, then try again.",
        duration: 3500,
        closeButton: true,
      });
    } finally {
      setActionSaving(false);
      setActingId(null);
    }
  }

  function resetForm() {
    setEmployeeId("");
    setRequestType("transfer");
    setItemKind("asset");
    setAssetId("");
    setRestockQty("10");
    setTransferQty("1");
    setTransferTo("");
    setTransferToMode("select");
    setTransferToId("");
    setNewLocation("");
    setReason("");
    setLines([blankLine(1)]);
    setLineSeq(2);
    setFormError("");
  }

  function updateLine(key: number, patch: Partial<ReqLine>) {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l))
    );
  }

  function addLine() {
    setLines((prev) => [...prev, blankLine(lineSeq)]);
    setLineSeq((s) => s + 1);
  }

  function removeLine(key: number) {
    setLines((prev) =>
      prev.length > 1 ? prev.filter((l) => l.key !== key) : prev
    );
  }

  // Picking a different item resets the quantity to 1 so a value that was
  // valid for the previous item's on-hand can never carry over.
  function pickPrimaryAsset(id: string) {
    setAssetId(id);
    setTransferQty("1");
  }

  // Switching the kind tab clears the current pick so an asset can never leak
  // into a stock request (or vice versa). Each tab reads its own pool.
  function changeItemKind(kind: "asset" | "stock") {
    if (kind === itemKind) return;
    setItemKind(kind);
    setAssetId("");
    setLines((prev) =>
      prev.map((l) => ({ ...l, assetId: "", quantity: "1" }))
    );
  }

  async function onSubmit() {
    if (saving) return;
    // Optimistic + instant: close the dialog and paint the request as pending
    // right away, then let the write confirm in the background. A failure
    // removes the temp row and explains what happened in a toast.
    const picked = lookupPool.find((a) => a.id === assetId) ?? null;
    const transferIsStock =
      requestType === "transfer" && picked?.kind === "stock";
    const effectiveTransferTo =
      transferToMode === "select"
        ? (employees.find((e) => e.id === transferToId)?.full_name ?? "")
        : transferTo;
    const requesterName =
      requestType === "stock_replenishment"
        ? "You"
        : (employees.find((e) => e.id === employeeId)?.full_name ?? "—");
    const optimisticDescription =
      requestType === "new_assignment"
        ? lines
            .map((l) =>
              l.quantity !== "" && Number(l.quantity) > 1
                ? `${l.itemNeeded} (Qty: ${l.quantity})`
                : l.itemNeeded
            )
            .filter(Boolean)
            .join("\n") || reason
        : reason;
    const tempId = `temp-${Date.now()}`;
    const optimisticRow: RequestRow = {
      id: tempId,
      request_type: requestType,
      description: optimisticDescription,
      status: "pending",
      date_requested: new Date().toISOString(),
      date_resolved: null,
      employee_id: employeeId,
      employee_name: requesterName,
      recipient_id: null,
      recipient_name: null,
      asset_id: assetId || null,
      asset_label: picked?.label ?? null,
      account_code: picked?.account_code ?? null,
      lines:
        requestType === "new_assignment"
          ? lines.map((l) => {
              const linePick =
                lookupPool.find((a) => a.id === l.assetId) ?? null;
              return {
                id: `temp-line-${l.key}`,
                asset_id: l.assetId || null,
                description: l.itemNeeded,
                quantity: Number(l.quantity) || 1,
                unit_cost: linePick?.unit_cost ?? null,
              };
            })
          : [],
      item_count: requestType === "new_assignment" ? lines.length : 1,
    };
    setSaving(true);
    setFormError("");
    setRowsState((cur) => [optimisticRow, ...(cur ?? baseRows)]);
    setDialogOpen(false);
    try {
      const res = await createRequest({
        employeeId,
        requestType,
        assetId: assetId === "" ? undefined : assetId,
        quantity:
          requestType === "stock_replenishment"
            ? Number(restockQty)
            : transferIsStock
              ? Number(transferQty)
              : undefined,
        transferTo: effectiveTransferTo,
        newLocation,
        reason,
        ...(requestType === "new_assignment"
          ? {
              items: lines.map((l) => ({
                assetId: l.assetId === "" ? undefined : l.assetId,
                description: l.itemNeeded,
                quantity: Number(l.quantity),
              })),
            }
          : {}),
      });
      if (!res.success) {
        setRowsState((cur) =>
          (cur ?? baseRows).filter((r) => r.id !== tempId)
        );
        const msg = res.error ?? "Please try again in a moment.";
        setFormError(msg);
        toast.error("Request not submitted", {
          description: msg,
          duration: 4000,
          closeButton: true,
        });
        return;
      }
      resetForm();
      reload();
      toast.success("Request submitted. It now appears in your queue.", {
        duration: 2500,
        closeButton: true,
      });
    } catch {
      setRowsState((cur) => (cur ?? baseRows).filter((r) => r.id !== tempId));
      const msg = "Check your connection, then try again.";
      setFormError(msg);
      toast.error("Request not submitted", {
        description: msg,
        duration: 4000,
        closeButton: true,
      });
    } finally {
      setSaving(false);
    }
  }

  // Tabs follow the Assets page origins: the Asset tab lists the asset
  // register plus asset-kind lots stocked by a passed inspection (shown as
  // "From inspected" on /personnel/assets); Stock lists consumable lots.
  // Out-of-stock entries never reach the dropdown.
  const assetChoices = visiblePool.filter(
    (a) => a.tab === itemKind && a.disabledReason !== "Out of stock"
  );
  // Stock replenishment targets inventory rows of both origins.
  const restockChoices = visiblePool.filter(
    (a) => a.kind === "stock" && a.disabledReason !== "Out of stock"
  );

  const pickedAsset = lookupPool.find((a) => a.id === assetId) ?? null;
  // Keep the open details view in sync with optimistic/server updates.
  const detail = detailRow
    ? (rows.find((r) => r.id === detailRow.id) ?? detailRow)
    : null;
  const restockQtyNum = Math.floor(Number(restockQty) || 0);
  const transferQtyNum = Math.floor(Number(transferQty) || 0);
  const transferStockMax = pickedAsset?.quantity ?? 0;

  const newAssignmentValid =
    lines.length > 0 &&
    lines.every((l) => {
      if (l.itemNeeded.trim() === "") return false;
      const pick = lookupPool.find((a) => a.id === l.assetId) ?? null;
      if (pick?.disabledReason) return false;
      if (pick?.kind === "stock") {
        const q = Number(l.quantity);
        const max = pick.quantity ?? 0;
        return Number.isInteger(q) && q >= 1 && q <= max;
      }
      return true;
    });

  const canSubmit =
    reason.trim() !== "" &&
    (requestType === "stock_replenishment"
      ? assetId !== "" &&
        Number.isInteger(restockQtyNum) &&
        restockQtyNum >= 1
      : employeeId !== "" &&
        (requestType === "transfer"
          ? assetId !== "" &&
            (transferToMode === "select"
              ? transferToId !== ""
              : transferTo.trim() !== "") &&
            (pickedAsset?.kind !== "stock" ||
              (Number.isInteger(transferQtyNum) &&
                transferQtyNum >= 1 &&
                transferQtyNum <= transferStockMax))
          : requestType === "repair"
            ? assetId !== ""
            : newAssignmentValid));

  return (
    <section className={req.section}>
      <PageHeader
        eyebrow="Request queue"
        title="Requests"
        subtitle="Review requests sent to you, then approve, reject, or complete them. Use ‘New request’ to file one for an employee."
        meta={`${queueTotal.toLocaleString("en-PH")} request${
          queueTotal === 1 ? "" : "s"
        } ${isAdminPortal ? "across all employees" : "in your queue"}`}
        actions={
          <div className={req.headerActions}>
            <Button
              type="button"
              variant="warning"
              onClick={() => {
                resetForm();
                setDialogOpen(true);
              }}
              className="h-6 gap-1.5 rounded-[4px] px-3 text-xs font-semibold"
            >
              <Plus size={14} aria-hidden="true" />
              New request
            </Button>
          </div>
        }
      />

      <div className={req.summary}>
        <article className={req.summaryCard} data-tone="info">
          <span className={req.summaryIcon}>
            <Inbox size={16} aria-hidden="true" />
          </span>
          <div className={req.summaryBody}>
            <p className={req.summaryLabel}>
              {isAdminPortal ? "All requests" : "In your queue"}
            </p>
            <p className={req.summaryValue}>{queueTotal}</p>
            <p className={req.summaryMeta}>
              {isAdminPortal
                ? "Filed by employees and personnel"
                : "All statuses sent to you"}
            </p>
          </div>
        </article>

        <article className={req.summaryCard} data-tone="warn">
          <span className={req.summaryIcon}>
            <Clock size={16} aria-hidden="true" />
          </span>
          <div className={req.summaryBody}>
            <p className={req.summaryLabel}>Pending in queue</p>
            <p className={req.summaryValue}>{pendingCount}</p>
            <p className={req.summaryMeta}>Needs your decision</p>
          </div>
        </article>

        <article className={req.summaryCard} data-tone="ok">
          <span className={req.summaryIcon}>
            <CheckCheck size={16} aria-hidden="true" />
          </span>
          <div className={req.summaryBody}>
            <p className={req.summaryLabel}>Approved in queue</p>
            <p className={req.summaryValue}>{approvedCount}</p>
            <p className={req.summaryMeta}>
              {completedCount} completed · ready to close out
            </p>
          </div>
        </article>
      </div>

      {actionError ? (
        <p className={req.errorBanner} role="alert">
          {actionError}
        </p>
      ) : null}

      <Card className={req.panel}>
        <div className={req.toolbar}>
          <div className={req.tabs} role="tablist" aria-label="Filter by status">
            {STATUS_TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={statusTab === t.value}
                className={req.tab}
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

          <div className={req.filters}>
            <div className={req.searchWrap}>
              <Search size={14} aria-hidden="true" className={req.searchIcon} />
              <Input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search employee, item, reason…"
                className={req.search}
                aria-label="Search requests"
              />
            </div>
            <Select
              value={typeFilter}
              onValueChange={(v) => {
                setTypeFilter(v);
                setPage(1);
              }}
            >
              <SelectTrigger className={req.typeSelect}>
                <SelectValue placeholder="Request type" />
              </SelectTrigger>
              <SelectContent>
                {TYPE_FILTERS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasFilters ? (
              <button
                type="button"
                className={req.clearButton}
                onClick={() => {
                  setQuery("");
                  setStatusTab("all");
                  setTypeFilter("all");
                  setPage(1);
                }}
              >
                Clear filters
              </button>
            ) : null}
          </div>
        </div>

        {visible.length === 0 ? (
          hasFilters ? (
            <EmptySearchState
              description="Try a different search term, status, or request type."
              onClear={() => {
                setQuery("");
                setStatusTab("all");
                setTypeFilter("all");
                setPage(1);
              }}
            />
          ) : (
            <div className={req.empty}>
              <span className={req.emptyIcon}>
                <Inbox size={20} aria-hidden="true" />
              </span>
              <p className={req.emptyTitle}>No requests yet</p>
              <p className={req.emptyText}>
                File the first request and it will appear here with its
                approval status.
              </p>
              <Button
                type="button"
                variant="warning"
                onClick={() => {
                  resetForm();
                  setDialogOpen(true);
                }}
                className="mt-1 h-6 gap-1.5 rounded-[4px] px-3 text-xs font-semibold"
              >
                <Plus size={14} aria-hidden="true" />
                New request
              </Button>
            </div>
          )
        ) : (
          <div className={req.tableWrap}>
            <table className={req.table}>
              <thead>
                <tr>
                  <th>Requester</th>
                  <th>Item</th>
                  <th>Requested</th>
                  <th>Status</th>
                  <th className={req.actionsHead}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const status = r.status ?? "pending";
                  const busy = actingId === r.id;
                  const openDetails = () => setDetailRow(r);
                  return (
                    <tr
                      key={r.id}
                      data-highlight-id={r.id}
                      className={
                        locatedId === r.id ? `${req.row} ${req.rowLocated}` : req.row
                      }
                      tabIndex={0}
                      onClick={openDetails}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openDetails();
                        }
                      }}
                    >
                      <td>
                        <span className={req.requesterCell}>
                          <span className={req.personCell}>
                            {r.employee_name}
                          </span>
                          <span
                            className={req.typeBadge}
                            data-type={r.request_type}
                          >
                            {requestTypeLabel(r.request_type)}
                          </span>
                        </span>
                      </td>
                      <td>
                        <span className={req.itemCell}>
                          <span className={req.itemMain}>
                            {r.asset_label ?? "—"}
                          </span>
                          <span className={req.itemSub}>
                            {r.account_code ?? r.description ?? "—"}
                          </span>
                        </span>
                      </td>
                      <td className={req.dateCell}>
                        {fmt(r.date_requested)}
                      </td>
                      <td>
                        <span
                          className={req.status}
                          data-tone={tone(r.status)}
                        >
                          {statusLabel(r.status)}
                        </span>
                      </td>
                      <td
                        className={req.actionsCell}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className={req.rowActions}>
                          <button
                            type="button"
                            className={req.rowActionMuted}
                            title="Open request details"
                            onClick={openDetails}
                          >
                            <Eye size={13} aria-hidden="true" />
                            View
                          </button>
                          {status === "pending" ? (
                            r.request_type === "new_assignment" ? (
                              <button
                                type="button"
                                disabled={busy}
                                className={req.rowAction}
                                title="Review the items and issue them to the employee"
                                onClick={() => {
                                  setIssuanceRequest(r);
                                  setIssuanceOpen(true);
                                }}
                              >
                                <Check size={13} aria-hidden="true" />
                                {busy ? "Working…" : "Evaluate"}
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={busy}
                                className={req.rowAction}
                                title="Approve this request and complete it in one step"
                                onClick={() => openAction(r, "approved")}
                              >
                                <Check size={13} aria-hidden="true" />
                                {busy ? "Working…" : "Approve"}
                              </button>
                            )
                          ) : status === "approved" ? (
                            <button
                              type="button"
                              disabled={busy}
                              className={req.rowAction}
                              title="Mark this request as completed"
                              onClick={() => openAction(r, "completed")}
                            >
                              <CheckCheck size={13} aria-hidden="true" />
                              {busy ? "Working…" : "Complete"}
                            </button>
                          ) : status === "completed" ? (
                            <RequestQrButton requestId={r.id} />
                          ) : (
                            <span className={req.muted}>No action</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {total > 0 ? (
          <TablePager
            id="requests"
            total={total}
            page={safePage}
            onPageChange={setPage}
          />
        ) : null}
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          className={`${req.dialogScroll} max-h-[90vh] overflow-x-hidden overflow-y-auto sm:max-w-4xl`}
        >
          <DialogHeader>
            <DialogTitle>New request</DialogTitle>
            <DialogDescription>
              File a transfer, new-asset assignment, or repair request for an
              employee — or a stock replenishment request for the admin to
              restock inventory. Repair approvals create a repair ticket.
            </DialogDescription>
          </DialogHeader>

          <div className={req.form}>
            {/* 1 — Request */}
            <section className={req.formSection}>
              <div className={req.formSectionHead}>
                <span className={req.formStep} aria-hidden="true">
                  1
                </span>
                <div>
                  <h3 className={req.formSectionTitle}>Request</h3>
                  <p className={req.formSectionHint}>
                    Choose who the request is for and the kind of help needed.
                  </p>
                </div>
              </div>
              <div className={req.formGrid}>
                {requestType !== "stock_replenishment" ? (
                  <div className={req.formField}>
                    <Label htmlFor="req-employee">
                      Requesting employee{" "}
                      <span className="text-red-600">*</span>
                    </Label>
                    <Select value={employeeId} onValueChange={setEmployeeId}>
                      <SelectTrigger id="req-employee" className="w-full">
                        <SelectValue placeholder="Select employee" />
                      </SelectTrigger>
                      <SelectContent>
                        {employees.map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.full_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <p className={req.formNote}>
                    Filed as you — the admin will see your name as the
                    requester.
                  </p>
                )}

                <div className={req.formField}>
                  <Label htmlFor="req-type">
                    Request type <span className="text-red-600">*</span>
                  </Label>
                  <Select
                    value={requestType}
                    onValueChange={(v) => {
                      setRequestType(v);
                      setItemKind(v === "stock_replenishment" ? "stock" : "asset");
                      setAssetId("");
                      setTransferQty("1");
                      setTransferToMode("select");
                      setTransferToId("");
                      setLines([blankLine(1)]);
                      setLineSeq(2);
                    }}
                  >
                    <SelectTrigger id="req-type" className="w-full">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="transfer">
                        Transfer — move an asset to someone else
                      </SelectItem>
                      <SelectItem value="new_assignment">
                        New assignment — assign an asset to the employee
                      </SelectItem>
                      <SelectItem value="repair">
                        Repair — report an asset for repair
                      </SelectItem>
                      <SelectItem value="stock_replenishment">
                        Stock replenishment — request add stock / restock from
                        admin
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>

            {/* 2 — Item details */}
            <section className={req.formSection}>
              <div className={req.formSectionHead}>
                <span className={req.formStep} aria-hidden="true">
                  2
                </span>
                <div>
                  <h3 className={req.formSectionTitle}>Item details</h3>
                  <p className={req.formSectionHint}>
                    {requestType === "stock_replenishment"
                      ? "Choose the stock item to restock from the dropdown, then enter the quantity needed."
                      : itemKind === "stock"
                        ? "Choose the stock item from the dropdown, then set how many units this request covers."
                        : "Choose the registered asset from the dropdown, or switch to the Stock tab for delivered quantities."}
                  </p>
                </div>
              </div>
              <div className={req.formGrid}>
                {requestType !== "stock_replenishment" ? (
                  <div
                    className={req.itemTabs}
                    role="tablist"
                    aria-label="Choose item kind"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={itemKind === "asset"}
                      data-active={itemKind === "asset"}
                      className={req.itemTab}
                      onClick={() => changeItemKind("asset")}
                    >
                      <span className={req.itemTabIcon} aria-hidden="true">
                        <Package size={15} />
                      </span>
                      <span className={req.itemTabText}>
                        <span className={req.itemTabTitle}>Asset</span>
                        <span className={req.itemTabHint}>
                          Registered assets — transfer, assign, or repair
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={itemKind === "stock"}
                      data-active={itemKind === "stock"}
                      className={req.itemTab}
                      onClick={() => changeItemKind("stock")}
                    >
                      <span className={req.itemTabIcon} aria-hidden="true">
                        <Boxes size={15} />
                      </span>
                      <span className={req.itemTabText}>
                        <span className={req.itemTabTitle}>Stock</span>
                        <span className={req.itemTabHint}>
                          Quantity on hand — restock or issue multiple units
                        </span>
                      </span>
                    </button>
                  </div>
                ) : null}

                {requestType === "stock_replenishment" ? (
                  <>
                    <div className={req.formFieldWide}>
                      <Label htmlFor="req-stock">
                        Stock item <span className="text-red-600">*</span>
                      </Label>
                      <Select value={assetId} onValueChange={setAssetId}>
                        <SelectTrigger id="req-stock" className="w-full">
                          <SelectValue placeholder="Choose a stock item">
                            <ItemValue item={pickedAsset} />
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent className={req.itemSelectContent}>
                          <ItemChoices items={restockChoices} />
                        </SelectContent>
                      </Select>
                    </div>

                    {pickedAsset ? <PickedItemCard item={pickedAsset} /> : null}

                    <div className={req.formField}>
                      <Label htmlFor="req-restock-qty">
                        Quantity needed{" "}
                        <span className="text-red-600">*</span>
                      </Label>
                      <Input
                        id="req-restock-qty"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        step={1}
                        value={restockQty}
                        onChange={(e) =>
                          // No on-hand ceiling for a restock, but still never
                          // negative or fractional: digits only, capped length.
                          setRestockQty(digitsOnly(e.target.value).slice(0, 9))
                        }
                        placeholder="e.g. 50"
                      />
                    </div>
                    <div className={req.formField}>
                      <Label>Where it goes</Label>
                      <p className={req.formNote}>
                        Sent to admin — approval is a status change; actual
                        procurement is logged later as a delivery.
                      </p>
                    </div>
                  </>
                ) : null}

                {requestType === "new_assignment" ? (
                  <div className={`${req.formFieldWide} ${req.formLines}`}>
                    <Label>
                      Items requested <span className="text-red-600">*</span>{" "}
                      <span className={req.formHelperInline}>
                        (add one row per item)
                      </span>
                    </Label>
                    {lines.map((line, idx) => {
                      const pick =
                        lookupPool.find((a) => a.id === line.assetId) ?? null;
                      const isStock = pick?.kind === "stock";
                      const max = pick?.quantity ?? 0;
                      return (
                        <div key={line.key} className={req.formLine}>
                          <div className="flex items-center justify-between">
                            <span className={req.formLineLabel}>
                              Item {idx + 1}
                            </span>
                            {lines.length > 1 ? (
                              <button
                                type="button"
                                className="cursor-pointer text-xs font-medium text-red-700 hover:underline"
                                onClick={() => removeLine(line.key)}
                              >
                                Remove
                              </button>
                            ) : null}
                          </div>
                          <div className={req.formGrid}>
                            <div className={req.formFieldWide}>
                              <Input
                                type="text"
                                value={line.itemNeeded}
                                onChange={(e) =>
                                  updateLine(line.key, {
                                    itemNeeded: e.target.value,
                                  })
                                }
                                placeholder="e.g. Laptop for new hire"
                                aria-label={`Item ${idx + 1} description`}
                              />
                            </div>
                            <div className={req.formFieldWide}>
                              <Label>
                                {itemKind === "stock" ? "Stock item" : "Asset"}{" "}
                                <span className={req.formHelperInline}>
                                  (optional — specific item to assign)
                                </span>
                              </Label>
                              <Select
                                value={line.assetId}
                                onValueChange={(v) =>
                                  updateLine(line.key, {
                                    assetId: v,
                                    quantity: "1",
                                  })
                                }
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue
                                    placeholder={
                                      itemKind === "stock"
                                        ? "Choose a stock item"
                                        : "Choose an asset"
                                    }
                                  >
                                    <ItemValue item={pick} />
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent className={req.itemSelectContent}>
                                  <ItemChoices
                                    items={assetChoices}
                                    disableUnavailable
                                  />
                                </SelectContent>
                              </Select>
                            </div>
                            {pick ? (
                              <p className={`${req.formHelper} sm:col-span-2`}>
                                {pick.account_code
                                  ? `${pick.account_code} · `
                                  : ""}
                                {pick.disabledReason ? (
                                  <span className="font-medium text-red-700">
                                    {pick.disabledReason}
                                  </span>
                                ) : isStock ? (
                                  `${max} on hand`
                                ) : (
                                  (pick.status ?? "available")
                                )}
                                {pick.unit_cost != null
                                  ? ` · Unit cost ${formatPeso(pick.unit_cost)}`
                                  : " · No unit cost on record"}
                              </p>
                            ) : null}
                            {isStock ? (
                              <div className={req.formFieldWide}>
                                <Label>
                                  Quantity{" "}
                                  <span className="text-red-600">*</span>
                                </Label>
                                <Input
                                  type="number"
                                  inputMode="numeric"
                                  min={1}
                                  max={max}
                                  step={1}
                                  value={line.quantity}
                                  onChange={(e) =>
                                    updateLine(line.key, {
                                      // Never above on hand, never negative.
                                      quantity: clampQuantity(e.target.value, max),
                                    })
                                  }
                                  placeholder={`Max ${max} on hand`}
                                  aria-label={`Item ${idx + 1} quantity`}
                                />
                                <p className={req.formHelper}>
                                  {max} available — enter 1 to {max}.
                                </p>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                    <div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={addLine}
                        className="h-6 rounded-[4px] px-3 text-xs font-semibold"
                      >
                        Add another item
                      </Button>
                    </div>
                  </div>
                ) : requestType === "stock_replenishment" ? null : (
                  <>
                    <div className={req.formFieldWide}>
                      <Label htmlFor="req-asset">
                        {itemKind === "stock" ? "Stock item" : "Asset"}{" "}
                        <span className="text-red-600">*</span>
                      </Label>
                      <Select value={assetId} onValueChange={pickPrimaryAsset}>
                        <SelectTrigger id="req-asset" className="w-full">
                          <SelectValue
                            placeholder={
                              itemKind === "stock"
                                ? "Choose a stock item"
                                : "Choose an asset"
                            }
                          >
                            <ItemValue item={pickedAsset} />
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent className={req.itemSelectContent}>
                          <ItemChoices items={assetChoices} />
                        </SelectContent>
                      </Select>
                    </div>

                    {pickedAsset ? <PickedItemCard item={pickedAsset} /> : null}
                    {requestType === "transfer" &&
                    pickedAsset?.kind === "stock" ? (
                      <div className={req.formField}>
                        <Label htmlFor="req-transfer-qty">
                          Quantity <span className="text-red-600">*</span>
                        </Label>
                        <Input
                          id="req-transfer-qty"
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={transferStockMax}
                          step={1}
                          value={transferQty}
                          onChange={(e) =>
                            // Never above on hand, never negative.
                            setTransferQty(
                              clampQuantity(e.target.value, transferStockMax)
                            )
                          }
                          placeholder={`Max ${transferStockMax} on hand`}
                        />
                        <p className={req.formHelper}>
                          {transferStockMax} on hand — enter 1 to{" "}
                          {transferStockMax}.
                        </p>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </section>

            {/* 3 — Destination (transfer only) */}
            {requestType === "transfer" ? (
              <section className={req.formSection}>
                <div className={req.formSectionHead}>
                  <span className={req.formStep} aria-hidden="true">
                    3
                  </span>
                  <div>
                    <h3 className={req.formSectionTitle}>Destination</h3>
                    <p className={req.formSectionHint}>
                      Where the item is going, and where it will be kept.
                    </p>
                  </div>
                </div>
                <div className={req.formGrid}>
                  <div className={req.formField}>
                    <Label htmlFor="req-transfer-to">
                      Transfer to <span className="text-red-600">*</span>
                    </Label>
                    <Select
                      value={
                        transferToMode === "manual"
                          ? "__manual"
                          : transferToId || undefined
                      }
                      onValueChange={(v) => {
                        if (v === "__manual") {
                          setTransferToMode("manual");
                          setTransferToId("");
                        } else {
                          setTransferToMode("select");
                          setTransferToId(v);
                        }
                      }}
                    >
                      <SelectTrigger id="req-transfer-to" className="w-full">
                        <SelectValue placeholder="Select employee" />
                      </SelectTrigger>
                      <SelectContent>
                        {employees.map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.full_name}
                          </SelectItem>
                        ))}
                        <SelectItem value="__manual">
                          Type name manually…
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {transferToMode === "manual" ? (
                      <Input
                        type="text"
                        value={transferTo}
                        onChange={(e) => setTransferTo(e.target.value)}
                        placeholder="e.g. Juan Dela Cruz — Accounting"
                        aria-label="Transfer to (manual name)"
                      />
                    ) : null}
                  </div>
                  <div className={req.formField}>
                    <Label htmlFor="req-location">New location</Label>
                    <Input
                      id="req-location"
                      type="text"
                      value={newLocation}
                      onChange={(e) => setNewLocation(e.target.value)}
                      placeholder="e.g. Registrar Office (optional)"
                    />
                  </div>
                </div>
              </section>
            ) : null}

            {/* Reason */}
            <section className={req.formSection}>
              <div className={req.formSectionHead}>
                <span className={req.formStep} aria-hidden="true">
                  {requestType === "transfer" ? "4" : "3"}
                </span>
                <div>
                  <h3 className={req.formSectionTitle}>
                    {requestType === "repair" ? "Issue details" : "Reason"}
                  </h3>
                  <p className={req.formSectionHint}>
                    A short note helps whoever reviews this request act faster.
                  </p>
                </div>
              </div>
              <div className={req.formGrid}>
                <div className={req.formFieldWide}>
                  <Label htmlFor="req-reason">
                    {requestType === "repair"
                      ? "Issue description"
                      : requestType === "stock_replenishment"
                        ? "Justification"
                        : "Reason"}{" "}
                    <span className="text-red-600">*</span>
                  </Label>
                  <textarea
                    id="req-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={
                      requestType === "repair"
                        ? "Describe the damage or issue — e.g. Screen flickering, won't power on…"
                        : requestType === "stock_replenishment"
                          ? "Why is restocking needed? e.g. Only 5 reams left, classes start next week…"
                          : "Why is this request needed?"
                    }
                    rows={3}
                    className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
                  />
                </div>
              </div>
            </section>
          </div>

          {formError ? (
            <p
              role="alert"
              className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
            >
              {formError}
            </p>
          ) : null}

          <DialogFooter>
            <ActionButton
              type="button"
              variant="warning"
              disabled={!canSubmit || saving}
              onClick={() => onSubmit()}
              loadingLabel="Submitting…"
              className="h-6 rounded-[4px] px-3 text-xs font-semibold"
            >
              Submit request
            </ActionButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={detail !== null}
        onOpenChange={(v) => {
          if (!v) setDetailRow(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Request details</DialogTitle>
            <DialogDescription>
              {detail
                ? `${requestTypeLabel(detail.request_type)} — filed by ${detail.employee_name}.`
                : "Review the request, then take the next step."}
            </DialogDescription>
          </DialogHeader>

          {detail ? (
            <>
              <div className={req.banner} data-tone={tone(detail.status)}>
                <span className={req.bannerIcon} aria-hidden="true">
                  {detail.status === "completed" ? (
                    <CheckCheck size={16} />
                  ) : detail.status === "rejected" ? (
                    <X size={16} />
                  ) : detail.status === "approved" ? (
                    <Check size={16} />
                  ) : (
                    <Clock size={16} />
                  )}
                </span>
                <div className={req.bannerBody}>
                  <p className={req.bannerTitle}>
                    {requestTypeLabel(detail.request_type)}
                  </p>
                  <p className={req.bannerMeta}>
                    {detail.employee_name} · requested{" "}
                    {fmt(detail.date_requested)}
                    {detail.date_resolved
                      ? ` · resolved ${fmt(detail.date_resolved)}`
                      : ""}
                  </p>
                </div>
                <span className={req.status} data-tone={tone(detail.status)}>
                  {statusLabel(detail.status)}
                </span>
              </div>

              <dl className={req.factGrid}>
                {(
                  [
                    ["Employee", detail.employee_name],
                    ["Type", requestTypeLabel(detail.request_type)],
                    ["Item", detail.asset_label ?? "—"],
                    [
                      "Assigned to",
                      detail.recipient_name ?? "Unassigned",
                    ],
                    ["Requested", fmt(detail.date_requested)],
                    ["Resolved", fmt(detail.date_resolved)],
                  ] as const
                ).map(([term, value]) => (
                  <div key={term} className={req.factCard}>
                    <dt>{term}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>

              <div className={req.detailCard}>
                <span className={req.detailLabel}>Details</span>
                <p className={req.detailText}>
                  {detail.description || "No additional details recorded."}
                </p>
              </div>

              {detail.lines.length > 1 ? (
                <div className={req.detailCard}>
                  <span className={req.detailLabel}>
                    Items requested ({detail.lines.length})
                  </span>
                  <ul className={req.lineList}>
                    {detail.lines.map((line) => (
                      <li key={line.id}>
                        <span>{line.description}</span>
                        <span className={req.lineQty}>
                          {line.quantity > 1 ? `×${line.quantity}` : "×1"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : null}

          <DialogFooter>
            {detail && (detail.status ?? "pending") === "pending" ? (
              <>
                <button
                  type="button"
                  className={req.rowActionMuted}
                  onClick={() => {
                    const row = detail;
                    setDetailRow(null);
                    openAction(row, "rejected");
                  }}
                >
                  <X size={13} aria-hidden="true" />
                  Reject
                </button>
                {detail.request_type === "new_assignment" ? (
                  <button
                    type="button"
                    className={req.rowAction}
                    onClick={() => {
                      setIssuanceRequest(detail);
                      setIssuanceOpen(true);
                      setDetailRow(null);
                    }}
                  >
                    <Check size={13} aria-hidden="true" />
                    Evaluate &amp; issue
                  </button>
                ) : (
                  <button
                    type="button"
                    className={req.rowAction}
                    onClick={() => {
                      const row = detail;
                      setDetailRow(null);
                      openAction(row, "approved");
                    }}
                  >
                    <Check size={13} aria-hidden="true" />
                    Approve &amp; complete
                  </button>
                )}
              </>
            ) : detail && detail.status === "approved" ? (
              <button
                type="button"
                className={req.rowAction}
                onClick={() => {
                  const row = detail;
                  setDetailRow(null);
                  openAction(row, "completed");
                }}
              >
                <CheckCheck size={13} aria-hidden="true" />
                Complete request
              </button>
            ) : detail && detail.status === "completed" ? (
              <RequestQrButton requestId={detail.id} />
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={actionOpen} onOpenChange={setActionOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {actionStatus === "approved"
                ? actionRow && actionRow.request_type !== "new_assignment"
                  ? "Approve & complete request"
                  : "Approve request"
                : actionStatus === "rejected"
                  ? "Reject request"
                  : "Complete request"}
            </DialogTitle>
            <DialogDescription>
              {actionRow
                ? `${requestTypeLabel(actionRow.request_type)} — ${actionRow.employee_name}. Add remarks to record your decision.`
                : "Remarks are required and will be recorded on the request."}
            </DialogDescription>
          </DialogHeader>

          {actionRow ? (
            <>
              <div className={req.banner} data-tone={tone(actionStatus)}>
                <span className={req.bannerIcon} aria-hidden="true">
                  {actionStatus === "approved" ? (
                    <Check size={16} />
                  ) : actionStatus === "rejected" ? (
                    <X size={16} />
                  ) : (
                    <CheckCheck size={16} />
                  )}
                </span>
                <div className={req.bannerBody}>
                  <p className={req.bannerTitle}>
                    {actionStatus === "approved"
                      ? "Ready to approve"
                      : actionStatus === "rejected"
                        ? "Ready to reject"
                        : "Ready to complete"}
                  </p>
                  <p className={req.bannerMeta}>
                    {requestTypeLabel(actionRow.request_type)} ·{" "}
                    {actionRow.employee_name} · requested{" "}
                    {fmt(actionRow.date_requested)}
                  </p>
                </div>
                <span className={req.status} data-tone={tone(actionRow.status)}>
                  {statusLabel(actionRow.status)}
                </span>
              </div>

              <dl className={req.factGrid}>
                {(
                  [
                    ["Employee", actionRow.employee_name],
                    ["Type", requestTypeLabel(actionRow.request_type)],
                    ["Item", actionRow.asset_label ?? "—"],
                    ["Requested", fmt(actionRow.date_requested)],
                  ] as const
                ).map(([term, value]) => (
                  <div key={term} className={req.factCard}>
                    <dt>{term}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>

              <div className={req.detailCard}>
                <span className={req.detailLabel}>Details</span>
                <p className={req.detailText}>
                  {actionRow.description || "No additional details recorded."}
                </p>
              </div>
            </>
          ) : null}

          <div className="grid gap-1.5 py-1">
            <Label htmlFor="req-action-note">
              Remarks <span className="text-red-600">*</span>
            </Label>
            <textarea
              id="req-action-note"
              value={actionNote}
              onChange={(e) => setActionNote(e.target.value)}
              placeholder={
                actionStatus === "rejected"
                  ? "e.g. Reason for rejection…"
                  : actionStatus === "completed"
                    ? "e.g. Handover details, condition on completion…"
                    : "e.g. Approval remarks, pickup instructions…"
              }
              rows={3}
              className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
            />
          </div>

          {actionFormError ? (
            <p
              role="alert"
              className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
            >
              {actionFormError}
            </p>
          ) : null}

          <DialogFooter>
            <ActionButton
              type="button"
              variant="warning"
              disabled={actionNote.trim() === "" || actionSaving}
              onClick={() => onActionConfirm()}
              loadingLabel={
                actionStatus === "approved"
                  ? "Approving…"
                  : actionStatus === "rejected"
                    ? "Rejecting…"
                    : "Completing…"
              }
              className="h-6 gap-1.5 rounded-[4px] px-3 text-xs font-semibold"
            >
              {actionStatus === "approved"
                ? actionRow && actionRow.request_type !== "new_assignment"
                  ? "Approve & complete"
                  : "Approve"
                : actionStatus === "rejected"
                  ? "Reject"
                  : "Complete"}
            </ActionButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {scanOpen && scanPrefill ? (
        <ScanTransferDialog
          open={scanOpen}
          onOpenChange={(next) => {
            setScanOpen(next);
            if (!next) setScanPrefill(null);
          }}
          prefill={scanPrefill}
          scan={scanIntent}
          onCreated={reload}
        />
      ) : null}

      {issuanceOpen ? (
        <IssuanceEvaluateDialog
          key={issuanceRequest?.id ?? "new"}
          open={issuanceOpen}
          onOpenChange={setIssuanceOpen}
          mode="approve-request"
          request={
            issuanceRequest
              ? {
                  id: issuanceRequest.id,
                  employee_id: issuanceRequest.employee_id,
                  employee_name: issuanceRequest.employee_name,
                  asset_id: issuanceRequest.asset_id,
                  lines: (issuanceRequest.lines ?? []).map((l) => ({
                    asset_id: l.asset_id,
                    quantity: l.quantity,
                    unit_cost: l.unit_cost,
                    description: l.description,
                  })),
                }
              : null
          }
          onSuccess={() => {
            setIssuanceOpen(false);
            setIssuanceRequest(null);
            reload();
          }}
        />
      ) : null}
    </section>
  );
}
