"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  createRequest,
  getRequestFormOptions,
  getRequests,
  setRequestStatus,
  type AssetOption,
  type EmployeeOption,
  type RequestRow,
} from "./actions";
import { IssuanceEvaluateDialog } from "@/components/personnel/IssuanceDialog";
import { RequestQrButton } from "@/components/personnel/RequestQrButton";
import {
  requestTypeLabel,
  type RequestStatus,
} from "./request-types";
import { formatPeso } from "@/lib/issuance-rules";
import { TablePager } from "@/components/personnel/TablePager";
import { usePageSize } from "@/hooks/use-page-size";
import styles from "../dashboard/page.module.css";
import air from "../inspections/air-section.module.css";

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

interface ReqLine {
  key: number;
  assetId: string;
  itemNeeded: string;
  quantity: string;
}

function blankLine(key: number): ReqLine {
  return { key, assetId: "", itemNeeded: "", quantity: "1" };
}

export default function PersonnelRequestsPage() {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusTab, setStatusTab] =
    useState<(typeof STATUS_TABS)[number]["value"]>("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [pageSize, setPageSize] = usePageSize("pgso:page-size:requests", 10);
  const [page, setPage] = useState(1);
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

  const [dialogOpen, setDialogOpen] = useState(false);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [assets, setAssets] = useState<AssetOption[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [requestType, setRequestType] = useState("transfer");
  const [assetId, setAssetId] = useState("");
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

  const reload = () => {
    setLoading(true);
    void getRequests({ forRecipient: true }).then((data) => {
      setRows(data);
      setLoading(false);
    });
  };

  useEffect(() => {
    void getRequests({ forRecipient: true }).then((data) => {
      setRows(data);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (dialogOpen && employees.length === 0) {
      void getRequestFormOptions().then((opts) => {
        setEmployees(opts.employees);
        setAssets(opts.assets);
      });
    }
  }, [dialogOpen, employees.length]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusTab !== "all" && (r.status ?? "pending") !== statusTab)
        return false;
      if (typeFilter !== "all" && r.request_type !== typeFilter) return false;
      if (q) {
        const haystack = [
          r.employee_name,
          requestTypeLabel(r.request_type),
          r.asset_label,
          r.description,
          r.status,
          ...(r.lines ?? []).map((l) => l.description),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [rows, query, statusTab, typeFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const visible = filtered.slice(
    (safePage - 1) * pageSize,
    (safePage - 1) * pageSize + pageSize
  );

  const pendingCount = rows.filter(
    (r) => (r.status ?? "pending") === "pending"
  ).length;

  function openAction(row: RequestRow, status: RequestStatus) {
    setActionRow(row);
    setActionStatus(status);
    setActionNote("");
    setActionFormError("");
    setActionError("");
    setActionOpen(true);
  }

  async function onActionConfirm() {
    if (!actionRow) return;
    if (actionNote.trim() === "") {
      setActionFormError("Enter remarks for this action.");
      return;
    }
    setActionSaving(true);
    setActionFormError("");
    setActingId(actionRow.id);
    const res = await setRequestStatus(
      actionRow.id,
      actionStatus,
      actionNote
    );
    setActingId(null);
    setActionSaving(false);
    if (!res.success) {
      setActionFormError(res.error ?? "Failed to update the request.");
      return;
    }
    setActionOpen(false);
    setActionRow(null);
    setActionNote("");
    reload();
  }

  function resetForm() {
    setEmployeeId("");
    setRequestType("transfer");
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

  async function onSubmit() {
    setSaving(true);
    setFormError("");
    const transferIsStock =
      requestType === "transfer" &&
      (assets.find((a) => a.id === assetId)?.kind === "stock");
    const effectiveTransferTo =
      transferToMode === "select"
        ? (employees.find((e) => e.id === transferToId)?.full_name ?? "")
        : transferTo;
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
    setSaving(false);
    if (!res.success) {
      setFormError(res.error ?? "Failed to submit the request.");
      return;
    }
    setDialogOpen(false);
    resetForm();
    reload();
  }

  // Every delivered item is an asset; "stock" is just its quantity on hand —
  // so transfer / assignment / repair can all pick either kind.
  const assetChoices =
    requestType === "stock_replenishment"
      ? assets.filter((a) => a.kind === "stock")
      : assets.filter((a) => a.kind === "stock" || a.kind === "asset");

  const pickedAsset = assets.find((a) => a.id === assetId) ?? null;
  const restockQtyNum = Math.floor(Number(restockQty) || 0);
  const transferQtyNum = Math.floor(Number(transferQty) || 0);
  const transferStockMax = pickedAsset?.quantity ?? 0;

  const newAssignmentValid =
    lines.length > 0 &&
    lines.every((l) => {
      if (l.itemNeeded.trim() === "") return false;
      const pick = assets.find((a) => a.id === l.assetId) ?? null;
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
    <section className={styles.section}>
      <p className={styles.crumb}>Personnel / Requests</p>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Requests</h1>
          <p className={styles.subtitle}>
            {filtered.length} of {rows.length}{" "}
            {rows.length === 1 ? "request" : "requests"} shown
            {pendingCount > 0
              ? ` · ${pendingCount} pending`
              : ""}{" "}
            · only requests sent to you
          </p>
        </div>
        <div className={styles.actions}>
          <Button
            type="button"
            onClick={() => {
              resetForm();
              setDialogOpen(true);
            }}
            className="gap-2"
          >
            New request
          </Button>
        </div>
      </div>

      {actionError ? (
        <p className={air.syncMsg} role="alert">
          {actionError}
        </p>
      ) : null}

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
            placeholder="Search employee, asset, description…"
            className={air.search}
            aria-label="Search requests"
          />
          <Select
            value={typeFilter}
            onValueChange={(v) => {
              setTypeFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-44">
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
        </div>

        {loading ? (
          <div className={styles.emptyState}>
            <p className={styles.panelSub}>Loading requests…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.panelSub}>
              {rows.length === 0
                ? "No requests submitted yet — file the first one above."
                : "No requests match your search or filters."}
            </p>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>To</th>
                  <th>Type</th>
                  <th>Asset</th>
                  <th>Description</th>
                  <th>Requested</th>
                  <th>Resolved</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const status = r.status ?? "pending";
                  const busy = actingId === r.id;
                  return (
                    <tr key={r.id}>
                      <td>{r.employee_name}</td>
                      <td>{r.recipient_name ?? "—"}</td>
                      <td>{requestTypeLabel(r.request_type)}</td>
                      <td>{r.asset_label ?? "—"}</td>
                      <td className="whitespace-pre-wrap">
                        {r.description}
                      </td>
                      <td>{fmt(r.date_requested)}</td>
                      <td>{fmt(r.date_resolved)}</td>
                      <td>
                        <span
                          className={styles.status}
                          data-tone={tone(r.status)}
                        >
                          {r.status
                            ? r.status.charAt(0).toUpperCase() +
                              r.status.slice(1)
                            : "—"}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          {status === "pending" ? (
                            <>
                              {r.request_type === "new_assignment" ? (
                                <button
                                  type="button"
                                  disabled={busy}
                                  className={`${styles.inspectLink} cursor-pointer disabled:opacity-50`}
                                  onClick={() => {
                                    setIssuanceRequest(r);
                                    setIssuanceOpen(true);
                                  }}
                                >
                                  {busy ? "…" : "Evaluate & approve"}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={busy}
                                  className={`${styles.inspectLink} cursor-pointer disabled:opacity-50`}
                                  onClick={() => openAction(r, "approved")}
                                >
                                  {busy ? "…" : "Approve"}
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={busy}
                                className={`${styles.inspectLinkSecondary} cursor-pointer disabled:opacity-50`}
                                onClick={() => openAction(r, "rejected")}
                              >
                                {busy ? "…" : "Reject"}
                              </button>
                            </>
                          ) : status === "approved" ? (
                            <button
                              type="button"
                              disabled={busy}
                              className={`${styles.inspectLink} cursor-pointer disabled:opacity-50`}
                              onClick={() => openAction(r, "completed")}
                            >
                              {busy ? "…" : "Complete"}
                            </button>
                          ) : status === "completed" ? (
                            <RequestQrButton requestId={r.id} />
                          ) : (
                            <span className={styles.pagerInfo}>—</span>
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
        {filtered.length > 0 ? (
          <TablePager
            id="requests"
            total={filtered.length}
            pageSize={pageSize}
            page={safePage}
            onPageSizeChange={setPageSize}
            onPageChange={setPage}
          />
        ) : null}
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>New request</DialogTitle>
            <DialogDescription>
              File a transfer, new-asset assignment, or repair request for an
              employee — or a stock replenishment request for the admin to
              restock inventory. Repair approvals create a repair ticket.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-1 sm:grid-cols-2">
            {requestType !== "stock_replenishment" ? (
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="req-employee">
                Requesting employee <span className="text-red-600">*</span>
              </Label>
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger id="req-employee">
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
            <div className="grid gap-1.5 sm:col-span-2">
              <p className="rounded-md border border-dashed border-navy-200 px-3 py-2 text-sm text-navy-700">
                Filed as you — the admin will see your name as the requester.
              </p>
            </div>
            )}

            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="req-type">
                Request type <span className="text-red-600">*</span>
              </Label>
              <Select
                value={requestType}
                onValueChange={(v) => {
                  setRequestType(v);
                  setAssetId("");
                  setTransferQty("1");
                  setTransferToMode("select");
                  setTransferToId("");
                  setLines([blankLine(1)]);
                  setLineSeq(2);
                }}
              >
                <SelectTrigger id="req-type">
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
                    Stock replenishment — request add stock / restock from admin
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {requestType === "stock_replenishment" ? (
              <>
                <div className="grid gap-1.5 sm:col-span-2">
                  <Label htmlFor="req-stock">
                    Stock item <span className="text-red-600">*</span>
                  </Label>
                  <Select value={assetId} onValueChange={setAssetId}>
                    <SelectTrigger id="req-stock">
                      <SelectValue placeholder="Select stock to restock" />
                    </SelectTrigger>
                    <SelectContent>
                      {assetChoices.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.label} ·{" "}
                          {a.quantity != null ? `${a.quantity} on hand` : "Stock"}
                          {a.account_code ? ` · ${a.account_code}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {pickedAsset ? (
                  <div className="grid gap-3 rounded-md border bg-zinc-50 px-3 py-2.5 text-sm sm:col-span-2 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-medium text-zinc-500">
                        On hand
                      </p>
                      <p>
                        {pickedAsset.quantity != null
                          ? pickedAsset.quantity
                          : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-zinc-500">
                        Account code
                      </p>
                      <p>{pickedAsset.account_code ?? "—"}</p>
                    </div>
                  </div>
                ) : null}

                <div className="grid gap-1.5">
                  <Label htmlFor="req-restock-qty">
                    Quantity needed <span className="text-red-600">*</span>
                  </Label>
                  <Input
                    id="req-restock-qty"
                    type="number"
                    min={1}
                    step={1}
                    value={restockQty}
                    onChange={(e) => setRestockQty(e.target.value)}
                    placeholder="e.g. 50"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Where it goes</Label>
                  <p className="rounded-md border border-dashed border-navy-200 px-3 py-2 text-sm text-navy-700">
                    Sent to admin — approval is a status change; actual
                    procurement is logged later as a delivery.
                  </p>
                </div>
              </>
            ) : null}

            {requestType === "new_assignment" ? (
              <div className="grid gap-3 sm:col-span-2">
                <Label>
                  Items requested <span className="text-red-600">*</span>{" "}
                  <span className="text-xs font-normal text-zinc-500">
                    (add one row per item)
                  </span>
                </Label>
                {lines.map((line, idx) => {
                  const pick =
                    assets.find((a) => a.id === line.assetId) ?? null;
                  const isStock = pick?.kind === "stock";
                  const max = pick?.quantity ?? 0;
                  return (
                    <div
                      key={line.key}
                      className="grid gap-3 rounded-md border bg-zinc-50/60 p-3 sm:grid-cols-2"
                    >
                      <div className="grid gap-1.5 sm:col-span-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-zinc-500">
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
                      <div className="grid gap-1.5 sm:col-span-2">
                        <Label>
                          Asset / Stock{" "}
                          <span className="text-xs font-normal text-zinc-500">
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
                          <SelectTrigger>
                            <SelectValue placeholder="Select asset or stock" />
                          </SelectTrigger>
                          <SelectContent>
                            {assetChoices.map((a) => (
                              <SelectItem
                                key={a.id}
                                value={a.id}
                                disabled={a.disabledReason != null}
                              >
                                {a.label} ·{" "}
                                {a.kind === "stock" ? "Stock" : "Asset"}
                                {a.disabledReason
                                  ? ` — ${a.disabledReason}`
                                  : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {pick ? (
                        <p className="text-xs text-zinc-500 sm:col-span-2">
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
                        <div className="grid gap-1.5 sm:col-span-2">
                          <Label>
                            Quantity{" "}
                            <span className="text-red-600">*</span>
                          </Label>
                          <Input
                            type="number"
                            min={1}
                            max={max}
                            step={1}
                            value={line.quantity}
                            onChange={(e) =>
                              updateLine(line.key, {
                                quantity: e.target.value,
                              })
                            }
                            placeholder={`Max ${max} on hand`}
                            aria-label={`Item ${idx + 1} quantity`}
                          />
                          <p className="text-xs text-zinc-500">
                            {max} available — enter 1 to {max}.
                          </p>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                <div>
                  <Button type="button" variant="outline" onClick={addLine}>
                    Add another item
                  </Button>
                </div>
              </div>
            ) : requestType === "stock_replenishment" ? null : (
              <>
                <div className="grid gap-1.5 sm:col-span-2">
                  <Label htmlFor="req-asset">
                    Item (asset / stock) <span className="text-red-600">*</span>
                  </Label>
                  <Select value={assetId} onValueChange={setAssetId}>
                    <SelectTrigger id="req-asset">
                      <SelectValue placeholder="Select item — every delivery is an asset; stock is its quantity" />
                    </SelectTrigger>
                    <SelectContent>
                      {assetChoices.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.label} ·{" "}
                          {a.kind === "stock" ? "Stock" : "Asset"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {pickedAsset ? (
                  <div className="grid gap-3 rounded-md border bg-zinc-50 px-3 py-2.5 text-sm sm:col-span-2 sm:grid-cols-2">
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
                      <p className="text-xs font-medium text-zinc-500">
                        Asset type
                      </p>
                      <p>{pickedAsset.asset_type ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-zinc-500">
                        Stock / quantity on hand
                      </p>
                      <p>
                        {pickedAsset.quantity != null
                          ? pickedAsset.quantity
                          : "—"}
                      </p>
                    </div>
                  </div>
                ) : null}
                {requestType === "transfer" && pickedAsset?.kind === "stock" ? (
                  <div className="grid gap-1.5 sm:col-span-2">
                    <Label htmlFor="req-transfer-qty">
                      Quantity <span className="text-red-600">*</span>
                    </Label>
                    <Input
                      id="req-transfer-qty"
                      type="number"
                      min={1}
                      max={transferStockMax}
                      step={1}
                      value={transferQty}
                      onChange={(e) => setTransferQty(e.target.value)}
                      placeholder={`Max ${transferStockMax} on hand`}
                    />
                    <p className="text-xs text-zinc-500">
                      {transferStockMax} on hand — enter 1 to {transferStockMax}.
                    </p>
                  </div>
                ) : null}
              </>
            )}

            {requestType === "transfer" ? (
              <>
                <div className="grid gap-1.5">
                  <Label htmlFor="req-transfer-to">
                    Transfer to <span className="text-red-600">*</span>
                  </Label>
                  <Select
                    value={
                      transferToMode === "manual" ? "__manual" : transferToId || undefined
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
                    <SelectTrigger id="req-transfer-to">
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
                <div className="grid gap-1.5">
                  <Label htmlFor="req-location">New location</Label>
                  <Input
                    id="req-location"
                    type="text"
                    value={newLocation}
                    onChange={(e) => setNewLocation(e.target.value)}
                    placeholder="e.g. Registrar Office (optional)"
                  />
                </div>
              </>
            ) : null}

            <div className="grid gap-1.5 sm:col-span-2">
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
                rows={2}
                className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
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
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!canSubmit || saving}
              onClick={() => void onSubmit()}
            >
              {saving ? "Submitting…" : "Submit request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={actionOpen} onOpenChange={setActionOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {actionStatus === "approved"
                ? "Approve request"
                : actionStatus === "rejected"
                  ? "Reject request"
                  : "Complete request"}
            </DialogTitle>
            <DialogDescription>
              {actionRow
                ? `${requestTypeLabel(actionRow.request_type)} — ${actionRow.employee_name}. Remarks are required and will be recorded on the request.`
                : "Remarks are required and will be recorded on the request."}
            </DialogDescription>
          </DialogHeader>

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
            <Button
              type="button"
              variant="outline"
              onClick={() => setActionOpen(false)}
              disabled={actionSaving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={actionNote.trim() === "" || actionSaving}
              onClick={() => void onActionConfirm()}
            >
              {actionSaving
                ? "Saving…"
                : actionStatus === "approved"
                  ? "Approve"
                  : actionStatus === "rejected"
                    ? "Reject"
                    : "Complete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
