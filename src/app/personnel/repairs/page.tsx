"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Loader2,
  Pencil,
  Play,
  Receipt,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
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
import { ReceiptLoading } from "@/components/personnel/ReceiptLoading";
import { useCachedAction } from "@/hooks/use-cached-action";
import { useReceipt } from "@/hooks/use-receipt";
import { CLIENT_CACHE_KEYS, bustClientCache } from "@/lib/client-cache";
import RepairsLoading from "./loading";
import { RepairReceipt } from "./repair-receipt";
import { ReceiptOverlay } from "../documents/receipt-overlay";
import receiptStyles from "../inspections/components/receipt.module.css";
import {
  createRepair,
  getRepair,
  getRepairFormOptions,
  getRepairsPage,
  setRepairStatus,
  updateRepair,
  type RepairAssetOption,
  type RepairEmployeeOption,
  type RepairRow,
} from "./actions";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import styles from "../dashboard/page.module.css";
import air from "../inspections/air-section.module.css";
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

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
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

export default function PersonnelRepairsPage() {
  const [query, setQuery] = useState("");
  const [statusTab, setStatusTab] =
    useState<(typeof STATUS_TABS)[number]["value"]>("all");
  // Fixed 20 rows/page (no selector) — server pages the DB window.
  const pageSize = FIXED_PAGE_SIZE;
  const [page, setPage] = useState(1);
  const debouncedQuery = useDebouncedValue(query, 250);
  // Server-paged list: search/status/page filter in the DB.
  const cacheKey = `${CLIENT_CACHE_KEYS.repairs}:${page}:${pageSize}:${debouncedQuery}:${statusTab}`;
  const {
    data: pageData,
    loading,
    isValidating,
    refresh: refreshRows,
  } = useCachedAction(
    cacheKey,
    () =>
      getRepairsPage({
        page,
        pageSize,
        q: debouncedQuery,
        status: statusTab,
      }),
    {
      staleTime: 30_000,
    }
  );
  const rows = useMemo(() => pageData?.rows ?? [], [pageData]);
  const total = pageData?.total ?? 0;
  const [actingId, setActingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [assets, setAssets] = useState<RepairAssetOption[]>([]);
  const [employees, setEmployees] = useState<RepairEmployeeOption[]>([]);
  const [assetId, setAssetId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [repairDate, setRepairDate] = useState(todayISO());
  const [description, setDescription] = useState("");
  const [technician, setTechnician] = useState("");
  const [cost, setCost] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<RepairRow | null>(null);  const [editDate, setEditDate] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editTechnician, setEditTechnician] = useState("");
  const [editCost, setEditCost] = useState("");
  const [editStatus, setEditStatus] = useState("pending");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

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
    ]);
    refreshRows();
  };

  useEffect(() => {
    if ((dialogOpen || editOpen) && employees.length === 0) {
      void getRepairFormOptions().then((opts) => {
        setEmployees(opts.employees);
        setAssets(opts.assets);
      });
    }
  }, [dialogOpen, editOpen, employees.length]);

  // Server already filtered + paged.
  const visible = rows;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const searching = query.trim() !== debouncedQuery.trim();

  const stats = useMemo(() => {
    let pending = 0;
    let inProgress = 0;
    let completed = 0;
    for (const r of rows) {
      if (r.status === "completed") completed += 1;
      else if (r.status === "in_progress") inProgress += 1;
      else pending += 1;
    }
    return { total, pending, inProgress, completed };
  }, [rows, total]);

  // Cold start only: background refetches keep stale rows visible with
  // an "updating…" badge instead of flashing the full skeleton.
  if (loading && rows.length === 0) {
    return <RepairsLoading />;
  }

  async function onProgress(id: string, status: string) {
    if (actingId) return;
    setActingId(id);
    setActionError("");
    try {
      const res = await setRepairStatus(id, status);
      if (!res.success) {
        const msg = res.error ?? "Failed to update the repair.";
        setActionError(msg);
        toast.error(msg, { duration: 2000, closeButton: true });
        return;
      }
      reload();
      toast.success("Repair updated successfully.", {
        duration: 2000,
        closeButton: true,
      });
    } catch {
      const msg = "Failed to update the repair. Please try again.";
      setActionError(msg);
      toast.error(msg, { duration: 2000, closeButton: true });
    } finally {
      setActingId(null);
    }
  }

  function resetForm() {
    setAssetId("");
    setEmployeeId("");
    setRepairDate(todayISO());
    setDescription("");
    setTechnician("");
    setCost("");
    setFormError("");
  }

  async function onSubmit() {
    if (saving) return;
    setSaving(true);
    setFormError("");
    try {
      const res = await createRepair({
        assetId,
        employeeId,
        repairDate,
        description,
        technician,
        cost,
      });
      if (!res.success) {
        const msg = res.error ?? "Failed to log the repair.";
        setFormError(msg);
        toast.error(msg, { duration: 2000, closeButton: true });
        return;
      }
      setDialogOpen(false);
      resetForm();
      reload();
      toast.success("Repair logged successfully.", {
        duration: 2000,
        closeButton: true,
      });
    } catch {
      const msg = "Failed to log the repair. Please try again.";
      setFormError(msg);
      toast.error(msg, { duration: 2000, closeButton: true });
    } finally {
      setSaving(false);
    }
  }

  function openEdit(row: RepairRow) {
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
    setEditSaving(true);
    setEditError("");
    try {
      const res = await updateRepair(editing.id, {
        repairDate: editDate,
        description: editDescription,
        technician: editTechnician,
        cost: editCost,
        status: editStatus,
      });
      if (!res.success) {
        const msg = res.error ?? "Failed to update the repair.";
        setEditError(msg);
        toast.error(msg, { duration: 2000, closeButton: true });
        return;
      }
      setEditOpen(false);
      setEditing(null);
      reload();
      const doneLabel =
        editStatus === "completed"
          ? "Repair completed successfully."
          : editStatus === "in_progress"
            ? "Repair started successfully."
            : "Repair updated successfully.";
      toast.success(doneLabel, { duration: 2000, closeButton: true });
    } catch {
      const msg = "Failed to update the repair. Please try again.";
      setEditError(msg);
      toast.error(msg, { duration: 2000, closeButton: true });
    } finally {
      setEditSaving(false);
    }
  }

  const pickedAsset = assets.find((a) => a.id === assetId) ?? null;

  const costNum = cost.trim() === "" ? null : Number(cost);
  const canSubmit =
    assetId !== "" &&
    employeeId !== "" &&
    description.trim() !== "" &&
    repairDate !== "" &&
    (costNum === null || (Number.isFinite(costNum) && costNum >= 0));

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
      <p className={styles.crumb}>Personnel / Repairs</p>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Repairs</h1>
          <p className={styles.subtitle}>
            {total} {total === 1 ? "ticket" : "tickets"} found · only your tickets
            {stats.pending > 0 ? ` · ${stats.pending} pending on this page` : ""}
            {(isValidating || searching) ? " · updating…" : ""}
          </p>
        </div>
        <div className={styles.actions}>
          <Button
            type="button"
            onClick={() => {
              resetForm();
              setDialogOpen(true);
            }}
            className="h-8 gap-2 rounded-[4px] px-3.5 text-xs font-semibold"
          >
            New repair
          </Button>
        </div>
      </div>

      {actionError ? (
        <p className={air.syncMsg} role="alert">
          {actionError}
        </p>
      ) : null}

      <div className={air.stats}>
        <div className={air.stat}>
          <p className={air.statValue}>{stats.total}</p>
          <p className={air.statLabel}>Total tickets</p>
        </div>
        <div className={air.stat}>
          <p className={air.statValue}>{stats.pending}</p>
          <p className={air.statLabel}>Pending</p>
        </div>
        <div className={air.stat}>
          <p className={air.statValue}>{stats.inProgress}</p>
          <p className={air.statLabel}>In progress</p>
        </div>
        <div className={air.stat}>
          <p className={air.statValue}>{stats.completed}</p>
          <p className={air.statLabel}>Completed</p>
        </div>
      </div>

      <Card className={styles.panel}>
        <div className={air.controls}>
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
          <Input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search asset, reporter, technician, issue…"
            className={air.search}
            aria-label="Search repairs"
          />
        </div>

        <div className={rep.legend} aria-label="Row actions legend">
          <span className={rep.legendItem}>
            <span className={rep.legendIcon} aria-hidden="true">
              <Play size={14} />
            </span>
            Start repair
          </span>
          <span className={rep.legendItem}>
            <span className={rep.legendIcon} aria-hidden="true">
              <Check size={14} />
            </span>
            Complete repair
          </span>
          <span className={rep.legendItem}>
            <span className={rep.legendIcon} aria-hidden="true">
              <RotateCcw size={14} />
            </span>
            Reopen repair
          </span>
          <span className={rep.legendItem}>
            <span className={rep.legendIcon} aria-hidden="true">
              <Pencil size={14} />
            </span>
            Edit ticket
          </span>
          <span className={rep.legendItem}>
            <span className={rep.legendIcon} aria-hidden="true">
              <Receipt size={14} />
            </span>
            View receipt
          </span>
        </div>

        {visible.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.panelSub}>
              {total === 0
                ? "No repair tickets recorded yet — log the first one above. Approved repair requests also create tickets here automatically."
                : "No repairs match your search or filters."}
            </p>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Reported by</th>
                  <th>Issue</th>
                  <th>Technician</th>
                  <th>Repair date</th>
                  <th>Cost</th>
                  <th>Progress</th>
                  <th>Logged</th>
                  <th>Receipt</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const status = r.status ?? "pending";
                  const busy = actingId === r.id;
                  return (
                    <tr key={r.id}>
                      <td>{r.asset_label ?? r.asset_id.slice(0, 8)}</td>
                      <td>{r.reporter_name}</td>
                      <td className="whitespace-pre-wrap">{r.description}</td>
                      <td>{r.technician ?? "Unassigned"}</td>
                      <td>{fmt(r.repair_date)}</td>
                      <td>{fmtCost(r.cost)}</td>
                      <td>
                        <span
                          className={styles.status}
                          data-tone={tone(r.status)}
                        >
                          {statusLabel(r.status)}
                        </span>
                      </td>
                      <td>{fmt(r.created_at)}</td>
                      <td>
                        {status === "completed" ? (
                          <button
                            type="button"
                            className={rep.iconBtn}
                            title="View receipt"
                            aria-label={`View receipt for repair ${r.id.slice(0, 8).toUpperCase()}`}
                            onClick={() =>
                              receipt.open(r.id, `repair:${r.id}`, () =>
                                getRepair(r.id)
                              )
                            }
                          >
                            <Receipt size={16} />
                          </button>
                        ) : (
                          <span className={styles.pagerInfo}>—</span>
                        )}
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          {status === "pending" ? (
                            <button
                              type="button"
                              disabled={busy}
                              className={rep.iconBtn}
                              title="Start repair"
                              aria-label={`Start repair ${r.id.slice(0, 8).toUpperCase()}`}
                              onClick={() => openStart(r)}
                            >
                              {busy ? (
                                <Loader2
                                  size={16}
                                  className="animate-spin"
                                  aria-hidden="true"
                                />
                              ) : (
                                <Play size={16} />
                              )}
                            </button>
                          ) : status === "in_progress" ? (
                            <button
                              type="button"
                              disabled={busy}
                              className={rep.iconBtn}
                              title="Complete repair"
                              aria-label={`Complete repair ${r.id.slice(0, 8).toUpperCase()}`}
                              onClick={() => openComplete(r)}
                            >
                              {busy ? (
                                <Loader2
                                  size={16}
                                  className="animate-spin"
                                  aria-hidden="true"
                                />
                              ) : (
                                <Check size={16} />
                              )}
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={busy}
                              className={rep.iconBtn}
                              title="Reopen repair"
                              aria-label={`Reopen repair ${r.id.slice(0, 8).toUpperCase()}`}
                              onClick={() =>
                                void onProgress(r.id, "in_progress")
                              }
                            >
                              {busy ? (
                                <Loader2
                                  size={16}
                                  className="animate-spin"
                                  aria-hidden="true"
                                />
                              ) : (
                                <RotateCcw size={16} />
                              )}
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={busy}
                            className={rep.iconBtn}
                            title="Edit ticket"
                            aria-label={`Edit repair ${r.id.slice(0, 8).toUpperCase()}`}
                            onClick={() => openEdit(r)}
                          >
                            <Pencil size={16} />
                          </button>
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
            id="repairs"
            total={total}
            page={safePage}
            onPageChange={setPage}
          />
        ) : null}
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>New repair ticket</DialogTitle>
            <DialogDescription>
              Log an asset repair. Progress can be moved from pending to in
              progress to completed from the table.
            </DialogDescription>
          </DialogHeader>

          <div className={rep.formGrid}>
            <div className={`${rep.field} ${rep.span2}`}>
              <Label htmlFor="rep-asset">
                Asset <span className="text-red-600">*</span>
              </Label>
              <Select
                value={assetId}
                onValueChange={setAssetId}
              >
                <SelectTrigger id="rep-asset">
                  <SelectValue placeholder="Select asset" />
                </SelectTrigger>
                <SelectContent>
                  {assets.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {pickedAsset ? (
              <div className={`${rep.span2} grid gap-3 rounded-md border bg-zinc-50 px-3 py-2.5 text-sm sm:grid-cols-2`}>
                <div>
                  <p className="text-xs font-medium text-zinc-500">
                    Account code
                  </p>
                  <p>{pickedAsset.account_code ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-zinc-500">
                    Account title
                  </p>
                  <p>{pickedAsset.account_title ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-zinc-500">Asset type</p>
                  <p>{pickedAsset.asset_type ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-zinc-500">Location</p>
                  <p>{pickedAsset.location ?? "—"}</p>
                </div>
              </div>
            ) : null}

            <div className={rep.field}>
              <Label htmlFor="rep-employee">
                Reported by <span className="text-red-600">*</span>
              </Label>
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger id="rep-employee">
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

            <div className={rep.field}>
              <Label htmlFor="rep-date">
                Repair date <span className="text-red-600">*</span>
              </Label>
              <DatePicker
                id="rep-date"
                value={parseISODate(repairDate)}
                onChange={(date) => setRepairDate(formatISODate(date))}
                placeholder="Pick a repair date"
                className="h-9 px-3 text-sm"
              />
            </div>

            <div className={`${rep.field} ${rep.span2}`}>
              <Label htmlFor="rep-desc">
                Issue <span className="text-red-600">*</span>
              </Label>
              <textarea
                id="rep-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the damage or issue…"
                rows={2}
                className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
              />
            </div>

            <div className={rep.field}>
              <Label htmlFor="rep-tech">Technician</Label>
              <Input
                id="rep-tech"
                type="text"
                value={technician}
                onChange={(e) => setTechnician(e.target.value)}
                placeholder="e.g. J. Santos (optional)"
              />
            </div>

            <div className={rep.field}>
              <Label htmlFor="rep-cost">Cost (₱)</Label>
              <Input
                id="rep-cost"
                type="number"
                min={0}
                step="0.01"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                placeholder="Optional"
              />
            </div>
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
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
              className="h-8 rounded-[4px] px-3.5 text-xs font-semibold"
            >
              Cancel
            </Button>
            <ActionButton
              type="button"
              disabled={!canSubmit || saving}
              onClick={() => onSubmit()}
              loadingLabel="Logging…"
              className="h-8 gap-2 rounded-[4px] px-3.5 text-xs font-semibold"
            >
              Log repair
            </ActionButton>
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
              className="h-8 rounded-[4px] px-3.5 text-xs font-semibold"
            >
              Cancel
            </Button>
            <ActionButton
              type="button"
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
              className="h-8 gap-2 rounded-[4px] px-3.5 text-xs font-semibold"
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
