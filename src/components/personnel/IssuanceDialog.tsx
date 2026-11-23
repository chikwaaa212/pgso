"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  approveRequestWithIssuance,
  createDirectIssuance,
  getIssuanceFormOptions,
  updateEmployeePosting,
  type EvaluateLineInput,
  type IssuanceAssetOption,
  type IssuanceEmployeeOption,
} from "@/app/personnel/issuances/actions";
import {
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileText,
  PackageOpen,
  UserRound,
  AlertTriangle,
} from "lucide-react";
import {
  ISSUANCE_THRESHOLD,
  formatPeso,
  resolveDocType,
} from "@/lib/issuance-rules";
import { cn } from "@/lib/utils";

function Field({
  label,
  required,
  className,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <Label className="text-xs font-semibold text-navy-800">
        {label}
        {required ? (
          <span className="text-red-600" aria-hidden="true">
            {" "}
            *
          </span>
        ) : null}
      </Label>
      {children}
      {hint ? (
        <p className="text-[11px] leading-snug text-navy-500">{hint}</p>
      ) : null}
    </div>
  );
}

/** Compact section header: numbered chip + icon + title + one-line hint. */
function SectionHead({
  step,
  icon,
  title,
  hint,
}: {
  step: number;
  icon: React.ReactNode;
  title: string;
  hint?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-px inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-navy-100 text-[11px] font-bold text-navy-700">
        {step}
      </span>
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-navy-700">
          {icon}
          {title}
        </p>
        {hint ? (
          <p className="mt-0.5 text-[11px] leading-snug text-navy-500">{hint}</p>
        ) : null}
      </div>
    </div>
  );
}

/** Small read-only metric used inside the issuance banner. */
function Stat({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        "min-w-[92px] rounded-lg bg-white/90 px-2.5 py-1.5 ring-1 ring-inset",
        emphasis ? "ring-amber-300" : "ring-navy-200/70"
      )}
    >
      <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-navy-500">
        {label}
      </p>
      <p
        className={cn(
          "text-sm font-semibold tabular-nums",
          emphasis ? "text-amber-700" : "text-navy-900"
        )}
      >
        {value}
      </p>
    </div>
  );
}

/** "3 available" / "5 pcs on hand" — shown next to every pick-list entry. */
function availabilityLabel(a: IssuanceAssetOption): string {
  if (a.disabledReason) return a.disabledReason;
  if (a.kind === "stock")
    return `${a.quantity ?? 0}${a.unit ? ` ${a.unit}` : ""} on hand`;
  if (typeof a.quantity !== "number") return "Single unit";
  return a.quantity > 0 ? `${a.quantity} available` : "No units left";
}

function toIso(d: Date | undefined) {
  return d ? d.toISOString().slice(0, 10) : "";
}

/** Local YYYY-MM-DD (no UTC shift — toISOString would move the day back). */
function formatLocalDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Parse a YYYY-MM-DD string as a local date (no UTC shift). */
function parseLocalDate(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return undefined;
  const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Keep digits only so number fields cannot hold a negative value. */
function digitsOnly(value: string): string {
  return value.replace(/[^\d]/g, "");
}

/** Clamp a typed quantity into [1, max]; empty stays empty while typing. */
function clampQuantity(value: string, max: number): string {
  const digits = digitsOnly(value);
  if (digits === "") return "";
  const n = Math.min(Math.max(1, Number(digits)), Math.max(1, max));
  return String(Number.isFinite(n) ? n : 1);
}

export interface IssuanceRequestLinePrefill {
  asset_id: string | null;
  quantity: number;
  unit_cost: number | null;
  description: string;
}

export interface IssuanceRequestPrefill {
  id: string;
  employee_id: string;
  employee_name: string;
  asset_id: string | null;
  lines?: IssuanceRequestLinePrefill[];
}

interface EvalRow {
  key: number;
  itemId: string;
  quantity: string;
  override: string;
  lineDesc: string;
  /** Snapshot from the request line — used when the item is no longer in the
   *  assignable options list (e.g. an unavailable asset or a depleted stock). */
  snapshotUnitCost: number | null;
}

function initialRows(
  request: IssuanceRequestPrefill | null | undefined,
  presetAssetId: string | null | undefined
): EvalRow[] {
  if (request?.lines && request.lines.length > 0) {
    return request.lines.map((l, i) => ({
      key: i + 1,
      itemId: l.asset_id ?? "",
      quantity: String(Math.max(1, Math.floor(Number(l.quantity) || 1))),
      override: "",
      lineDesc: l.description ?? "",
      snapshotUnitCost: l.unit_cost ?? null,
    }));
  }
  return [
    {
      key: 1,
      itemId: request?.asset_id ?? presetAssetId ?? "",
      quantity: "1",
      override: "",
      lineDesc: "",
      snapshotUnitCost: null,
    },
  ];
}

/**
 * Shared evaluation dialog (steps 2–4). Used by BOTH entry paths:
 * - approve-request: employee-initiated new_assignment → approval runs the
 *   same issuance check → ₱50k PAR/ICS → sign → assign as direct issues.
 *   Multi-line requests produce ONE consolidated document per approval:
 *   line totals are summed to a grand total and a single PAR (over ₱50k)
 *   or ICS (₱50k or less) is issued for all lines together.
 * - direct: personnel-initiated assignment with no request at all (1 row).
 */
/** What the dialog is about to change — lets lists paint optimistically. */
export interface IssuanceOptimisticLine {
  itemId: string;
  kind: "asset" | "stock";
  quantity: number;
  employeeId: string;
  /** Recipient name, so lists can paint the assignee immediately. */
  employeeName?: string;
}

export function IssuanceEvaluateDialog({
  open,
  onOpenChange,
  mode,
  request,
  presetAssetId,
  onSuccess,
  onOptimisticSubmit,
  onFailure,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: "approve-request" | "direct";
  request?: IssuanceRequestPrefill | null;
  /** Pre-select this asset/stock (e.g. from the Assets row). */
  presetAssetId?: string | null;
  onSuccess?: () => void;
  /**
   * Fired the moment the user confirms (before the server answers) so the
   * owning list can decrement quantities / mark the row assigned instantly.
   * `onFailure` tells the list to roll back to server truth.
   */
  onOptimisticSubmit?: (lines: IssuanceOptimisticLine[]) => void;
  onFailure?: () => void;
}) {
  const now = new Date();
  const today = formatLocalDate(now);
  const [employees, setEmployees] = useState<IssuanceEmployeeOption[]>([]);
  const [items, setItems] = useState<IssuanceAssetOption[]>([]);
  const [optionsError, setOptionsError] = useState("");

  // Fresh mount per opening (parents render conditionally with a key), so
  // prop-derived initializers below run with the correct request/preset.
  const [employeeId, setEmployeeId] = useState(request?.employee_id ?? "");
  // Multi-line approval rows (direct mode always keeps exactly one).
  const [rows, setRows] = useState<EvalRow[]>(() =>
    initialRows(request, presetAssetId)
  );
  const [rowSeq, setRowSeq] = useState(
    () => initialRows(request, presetAssetId).length + 1
  );
  const [isForIssuance, setIsForIssuance] = useState(true);
  const [entity, setEntity] = useState("");
  const [fundCluster, setFundCluster] = useState("");
  const [docNo, setDocNo] = useState("");
  const [docDate, setDocDate] = useState(today);
  const [description, setDescription] = useState("");
  const [propertyNo, setPropertyNo] = useState("");
  const [inventoryItemNo, setInventoryItemNo] = useState("");
  const [estUsefulLife, setEstUsefulLife] = useState("");
  const [fromName, setFromName] = useState("");
  const [fromPosition, setFromPosition] = useState("");
  const [toPosition, setToPosition] = useState("");
  const [positionDirty, setPositionDirty] = useState(false);
  const [savePosting, setSavePosting] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const multi = mode === "approve-request" && rows.length > 1;

  const loadOptions = useCallback(() => {
    // Kick off asynchronously so the effect body never calls setState
    // synchronously (avoids a cascading render on open).
    void Promise.resolve()
      .then(() => {
        setOptionsError("");
        return getIssuanceFormOptions();
      })
      .then((opts) => {
        setEmployees(opts.employees);
        // Guard against duplicate ids from any source list: duplicate select
        // keys/values are unsupported and can drop or double rows.
        const seenIds = new Set<string>();
        setItems(
          opts.items.filter((it) => {
            if (seenIds.has(it.id)) return false;
            seenIds.add(it.id);
            return true;
          })
        );
        if (opts.items.length === 0) {
          setOptionsError(
            "No assignable items loaded — close and reopen the evaluation. If this persists, check that deliveries were inspected and stocked."
          );
        }
      })
      .catch((e) => {
        console.error("Failed to load issuance form options:", e);
        setOptionsError(
          "Failed to load employees and items — close and reopen the evaluation."
        );
      });
  }, []);

  // Load options when the modal opens
  useEffect(() => {
    loadOptions();
  }, [open, loadOptions]);

  const selectedEmployee =
    employees.find((e) => e.id === employeeId) ?? null;
  const postingGuess = [
    selectedEmployee?.position,
    selectedEmployee?.office,
  ]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(", ");
  const displayedToPosition = positionDirty ? toPosition : postingGuess;

  function selectEmployee(id: string) {
    const selected = employees.find((e) => e.id === id) ?? null;
    const guess = [selected?.position, selected?.office]
      .map((s) => (s ?? "").trim())
      .filter(Boolean)
      .join(", ");
    setEmployeeId(id);
    setPositionDirty(false);
    setToPosition(guess);
  }

  function updateRow(key: number, patch: Partial<EvalRow>) {
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, ...patch } : r))
    );
  }

  function addRow() {
    setRows((prev) => [
      ...prev,
      { key: rowSeq, itemId: "", quantity: "1", override: "", lineDesc: "", snapshotUnitCost: null },
    ]);
    setRowSeq((s) => s + 1);
  }

  function removeRow(key: number) {
    setRows((prev) =>
      prev.length > 1 ? prev.filter((r) => r.key !== key) : prev
    );
  }

  interface RowCalc {
    picked: IssuanceAssetOption | null;
    kind: "asset" | "stock" | null;
    qty: number;
    onHand: number;
    recordedTotal: number | null;
    recordedUnit: number | null;
    overrideNum: number | null;
    /** Effective unit cost: on-record wins, override fills the gap. */
    effUnit: number | null;
    needsOverride: boolean;
    lineTotal: number;
    docType: "PAR" | "ICS";
    qtyValid: boolean;
    costValid: boolean;
    /** False when the picked item is already assigned / out of stock. */
    assignable: boolean;
    disabledReason: string | null;
  }

  const calcs: RowCalc[] = useMemo(
    () =>
      rows.map((row) => {
        const picked = items.find((i) => i.id === row.itemId) ?? null;
        const kind = picked?.kind ?? null;
        const qty = Math.max(1, Math.floor(Number(row.quantity) || 1));
        const onHand = picked?.quantity ?? 0;
        const recordedTotal =
          kind === "asset" ? (picked?.total_cost ?? null) : null;
        const recordedUnit = picked?.unit_cost ?? null;
        const o = Number(row.override);
        const overrideNum =
          row.override.trim() !== "" && Number.isFinite(o) && o >= 0
            ? o
            : null;
        /** Fall back to the cost stored on the request line when the
         *  item is no longer in the assignable options list. */
        const fallbackUnit = row.snapshotUnitCost;
        const effUnit = recordedUnit ?? overrideNum ?? fallbackUnit;
        /** Show the override field only when the cost is truly missing:
         *  - For stock items, override is needed if there's no unit_cost.
         *  - For asset items, total_cost on record is sufficient; override is
         *    only required when both unit_cost and total_cost are absent. */
        const needsOverride =
          recordedUnit === null && overrideNum === null && (kind === "stock" || recordedTotal === null);
        const lineTotal =
          kind === "asset"
            ? recordedTotal ?? (effUnit !== null ? effUnit * 1 : null) ?? 0
            : kind === "stock"
              ? effUnit !== null
                ? effUnit * qty
                : 0
              : 0;
        const disabledReason = picked?.disabledReason ?? null;
        return {
          picked,
          kind,
          qty,
          onHand,
          recordedTotal,
          recordedUnit,
          overrideNum,
          effUnit,
          needsOverride,
          lineTotal,
          docType: resolveDocType(lineTotal),
          qtyValid:
            picked !== null &&
            (kind !== "stock" ||
              (Number.isInteger(qty) && qty >= 1 && qty <= onHand)),
          costValid: picked !== null && (kind !== "stock" || effUnit !== null),
          assignable: picked !== null && disabledReason == null,
          disabledReason,
        };
      }),
    [rows, items]
  );

  /** Quantity / override sit on the SAME row as the picker when shown. */
  const showQuantity = !multi && calcs[0]?.kind === "stock";
  const showOverride = !multi && !!calcs[0]?.needsOverride;
  const grandTotal = calcs.reduce((s, c) => s + c.lineTotal, 0);
  // ONE document per approval: grand total decides PAR vs ICS (never per line).
  const headerDocType = resolveDocType(grandTotal) as "PAR" | "ICS";

  // Single-line (legacy) total for the direct path + old single UI.
  const picked = !multi ? (calcs[0]?.picked ?? null) : null;
  const singleSelected = !multi
    ? (items.find((i) => i.id === (rows[0]?.itemId ?? "")) ?? null)
    : null;
  const pickedQty = calcs[0]?.onHand ?? 0;
  const qty = calcs[0]?.qty ?? 1;
  const total = grandTotal;
  const docType = headerDocType;

  const employeeName =
    employees.find((e) => e.id === employeeId)?.full_name ??
    request?.employee_name ??
    "";

  const rowsValid = calcs.every(
    (c) => c.qtyValid && c.costValid && c.assignable
  );

  const canSubmit =
    employeeId !== "" &&
    (isForIssuance
      ? entity.trim() !== "" &&
        docNo.trim() !== "" &&
        docDate !== "" &&
        fromName.trim() !== "" &&
        rowsValid &&
        (mode === "direct" || remarks.trim() !== "")
      : mode === "direct" || remarks.trim() !== "");

  // Footer summary — tells the operator exactly what the next click does.
  const footerHint = !employeeId
    ? "Select the receiving employee to continue."
    : !multi && !singleSelected
      ? "Select an asset or stock lot to issue."
      : !rowsValid
        ? (calcs.find((c) => c.disabledReason)?.disabledReason
            ? `${calcs.find((c) => c.disabledReason)?.disabledReason} — pick a substitute item.`
            : "Complete the item details to continue.")
        : !isForIssuance
          ? "Item stays in stock — no document, no assignment."
          : mode === "approve-request" && remarks.trim() === ""
            ? "Add approval remarks to finish."
            : `${rows.length} item${rows.length > 1 ? "s" : ""} · ${docType} ${formatPeso(grandTotal)} → ${employeeName || "employee"}`;

  async function submit() {
    if (!canSubmit || saving) return;
    setSaving(true);
    setError("");

    // Optimistic UX: close the dialog and paint the list right away, then
    // report the outcome with a single toast when the server answers.
    if (isForIssuance) {
      const lines: IssuanceOptimisticLine[] = [];
      rows.forEach((row, i) => {
        const kind = calcs[i]?.kind;
        if (!kind || !row.itemId) return;
        lines.push({
          itemId: row.itemId,
          kind,
          quantity: calcs[i].qty,
          employeeId,
          employeeName: employeeName || undefined,
        });
      });
      if (lines.length > 0) onOptimisticSubmit?.(lines);
    }

    const toastId = toast.loading(
      mode === "approve-request"
        ? "Approving the request…"
        : isForIssuance
          ? "Assigning the item…"
          : "Saving the item…",
      { closeButton: false }
    );
    onOpenChange(false);

    const fail = (message?: string) => {
      setError(message ?? "Failed to save the issuance.");
      // Put the list back to server truth after an optimistic paint.
      onFailure?.();
      toast.error("Couldn't complete this assignment", {
        id: toastId,
        description:
          message ?? "Something went wrong while saving. Please try again.",
        duration: 5000,
        closeButton: true,
      });
    };

    try {
      // Optionally persist a hand-typed posting back to the employee profile
      // so the next evaluation auto-fills it. "Position, Office" round-trips
      // through the same join used for the guess above.
      if (savePosting && displayedToPosition.trim() !== "" && employeeId !== "") {
        const [pos, ...rest] = displayedToPosition.split(",");
        const res = await updateEmployeePosting(
          employeeId,
          (pos ?? "").trim(),
          rest.join(",").trim()
        );
        if (!res.success) {
          fail(res.error ?? "We couldn't save the employee's position/office.");
          return;
        }
        setSavePosting(false);
      }

      if (mode === "approve-request" && request) {
        const lines: EvaluateLineInput[] = rows.map((row, i) => ({
          assetId:
            calcs[i].kind === "asset" ? row.itemId || undefined : undefined,
          inventoryId:
            calcs[i].kind === "stock" ? row.itemId || undefined : undefined,
          quantity: calcs[i].qty,
          unitCostOverride:
            row.override.trim() === ""
              ? (row.snapshotUnitCost ?? null)
              : Number(row.override),
          lineDescription: row.lineDesc.trim() || undefined,
        }));
        const res = await approveRequestWithIssuance(
          request.id,
          {
            employeeId,
            quantity: qty,
            lines,
            isForIssuance,
            entity: entity.trim(),
            fundCluster: fundCluster.trim(),
            docNo: docNo.trim(),
            docDate,
            description: description.trim(),
            propertyNo: propertyNo.trim(),
            inventoryItemNo: inventoryItemNo.trim(),
            estUsefulLife: estUsefulLife.trim(),
            fromName: fromName.trim(),
            fromPosition: fromPosition.trim(),
            toName: employeeName,
            toPosition: displayedToPosition.trim(),
          },
          remarks
        );
        if (!res.success) {
          fail(res.error);
          return;
        }
        onSuccess?.();
        toast.success(
          isForIssuance
            ? "Request approved — the item is now assigned."
            : "Request approved — the item stays in stock.",
          { id: toastId, duration: 2500, closeButton: true }
        );
        return;
      }

      // Direct (single-item) path.
      const [assetId, inventoryId] =
        picked?.kind === "asset"
          ? [rows[0]?.itemId, undefined]
          : picked?.kind === "stock"
            ? [undefined, rows[0]?.itemId]
            : [undefined, undefined];
      const input = {
        employeeId,
        assetId,
        inventoryId,
        quantity: qty,
        isForIssuance,
        entity: entity.trim(),
        fundCluster: fundCluster.trim(),
        docNo: docNo.trim(),
        docDate,
        description: description.trim() || picked?.label || "",
        propertyNo: propertyNo.trim(),
        inventoryItemNo: inventoryItemNo.trim(),
        estUsefulLife: estUsefulLife.trim(),
        fromName: fromName.trim(),
        fromPosition: fromPosition.trim(),
        toName: employeeName,
        toPosition: displayedToPosition.trim(),
      };
      const res = await createDirectIssuance(input);
      if (!res.success) {
        fail(res.error);
        return;
      }
      onSuccess?.();
      toast.success(
        isForIssuance ? "Item assigned successfully." : "Item saved to stock.",
        { id: toastId, duration: 2500, closeButton: true }
      );
    } catch {
      fail();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="pgso-no-scrollbar flex max-h-[94vh] w-[min(1400px,calc(100vw-1.5rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(1400px,calc(100vw-1.5rem))]">
        {/* Header band: title, path badge and the four-step rail. */}
        <div className="shrink-0 border-b border-navy-100 bg-gradient-to-r from-white via-white to-amber-50/70 px-5 py-4 sm:px-6">
          <DialogHeader className="gap-1.5 pr-10 text-left">
            <DialogTitle className="flex flex-wrap items-center gap-2.5 text-base">
              <span className="inline-flex size-8 items-center justify-center rounded-lg bg-yellow-500 text-navy-900 shadow-sm">
                <PackageOpen size={16} aria-hidden="true" />
              </span>
              <span>
                {mode === "approve-request"
                  ? "Approve with issuance evaluation"
                  : "Assign / issue item"}
              </span>
              <span className="rounded-full border border-navy-200 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-navy-600">
                {mode === "approve-request"
                  ? "Request approval"
                  : "Direct assignment"}
              </span>
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed">
              {mode === "approve-request" && request
                ? `Shared evaluation for ${request.employee_name}: issuance check → value-based document → sign → assign. Denials still use Reject and end with no assignment.`
                : "Personnel-initiated path — no request needed. Same evaluation: issuance check → value-based document → sign → assign."}
            </DialogDescription>
          </DialogHeader>
          <ol className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] font-semibold text-navy-500">
            {["Receiving", "Issuance check", "Document", "Assign"].map(
              (step, i) => (
                <li key={step} className="flex items-center gap-1.5">
                  <span className="inline-flex size-4 items-center justify-center rounded-full bg-navy-100 text-[9px] font-bold text-navy-700">
                    {i + 1}
                  </span>
                  {step}
                  {i < 3 ? (
                    <ChevronRight
                      className="size-3 text-navy-300"
                      aria-hidden="true"
                    />
                  ) : null}
                </li>
              )
            )}
          </ol>
        </div>

        {/* Scroll body — header and footer stay pinned. */}
        <div className="pgso-no-scrollbar flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
          {optionsError ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
            >
              <AlertTriangle
                className="mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
              <span>{optionsError}</span>
            </p>
          ) : null}

          {error ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
            >
              <AlertTriangle
                className="mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
              <span>{error}</span>
            </p>
          ) : null}

          <section className="rounded-xl border border-navy-100 bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
            <SectionHead
              step={1}
              icon={<UserRound size={12} aria-hidden="true" />}
              title="Receiving & item"
              hint="Pick who receives it and which lot leaves the shelf."
            />
            <div className="mt-3 grid gap-3 md:grid-cols-6 xl:grid-cols-12">
              <Field
                label="Receiving employee"
                required
                className="md:col-span-2 xl:col-span-3"
              >
                <Select value={employeeId} onValueChange={selectEmployee}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent className="pgso-no-scrollbar">
                    {employees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              {multi ? (
                <div className="flex items-end md:col-span-3 xl:col-span-8">
                  <p className="text-xs font-semibold text-navy-700">
                    Requested items ({rows.length})
                    <span className="ml-2 font-normal text-navy-500">
                      Each line is re-checked against live availability.
                    </span>
                  </p>
                </div>
              ) : (
                <Field
                  label="Asset / Stock"
                  required
                  className={
                    showQuantity
                      ? showOverride
                        ? "md:col-span-2 xl:col-span-4"
                        : "md:col-span-2 xl:col-span-6"
                      : showOverride
                        ? "md:col-span-2 xl:col-span-5"
                        : "md:col-span-4 xl:col-span-9"
                  }
                >
                  <Select
                    value={rows[0]?.itemId ?? ""}
                    onValueChange={(v) => {
                      if (rows[0]) {
                        updateRow(rows[0].key, {
                          itemId: v,
                          quantity: "1",
                          override: "",
                        });
                      }
                    }}
                  >
                    <SelectTrigger className="w-full">
                      {singleSelected ? (
                        <span className="flex min-w-0 flex-1 items-center gap-2 text-left">
                          <span className="truncate">
                            {singleSelected.account_code ?? singleSelected.label}
                          </span>
                          <span
                            className={cn(
                              "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset",
                              calcs[0]?.disabledReason
                                ? "bg-red-50 text-red-700 ring-red-200"
                                : "bg-navy-50 text-navy-600 ring-navy-200"
                            )}
                          >
                            {singleSelected.kind === "stock" ? "Stock" : "Asset"}
                            {" · "}
                            {availabilityLabel(singleSelected)}
                          </span>
                        </span>
                      ) : (
                        <SelectValue placeholder="Select item to issue" />
                      )}
                    </SelectTrigger>
                    <SelectContent className="pgso-no-scrollbar">
                      {items.map((a) => (
                        <SelectItem
                          key={a.id}
                          value={a.id}
                          disabled={a.disabledReason != null}
                        >
                          <span className="flex w-full items-center justify-between gap-4">
                            <span className="truncate">{a.label}</span>
                            <span
                              className={cn(
                                "shrink-0 text-[10px] font-semibold uppercase tracking-wide",
                                a.disabledReason
                                  ? "text-red-600"
                                  : "text-navy-500"
                              )}
                            >
                              {a.kind === "stock" ? "Stock" : "Asset"}
                              {" · "}
                              {availabilityLabel(a)}
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}

              {multi ? (
                <div className="grid gap-3 md:col-span-6 xl:col-span-12">
                  {rows.map((row, i) => (
                    <ItemRowEditor
                      key={row.key}
                      index={i}
                      row={row}
                      calc={calcs[i]}
                      items={items}
                      removable={false}
                      onChange={updateRow}
                      onRemove={removeRow}
                    />
                  ))}
                </div>
              ) : null}

              {mode === "approve-request" ? (
                <div className="md:col-span-6 xl:col-span-12">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addRow}
                    className="h-8 rounded-[4px] px-3.5 text-xs font-semibold"
                  >
                    Add another item
                  </Button>
                </div>
              ) : null}

              {showQuantity ? (
                <Field
                  label="Quantity"
                  required
                  className="md:col-span-2 xl:col-span-3"
                  hint={`Max ${pickedQty}${calcs[0].picked?.unit ? ` ${calcs[0].picked.unit}` : ""} on hand.`}
                >
                  <Input
                    className="w-full"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={pickedQty}
                    step={1}
                    value={rows[0]?.quantity ?? "1"}
                    onKeyDown={(e) => {
                      // Block signs/exponents so a negative quantity is impossible.
                      if (["-", "+", "e", "E", ".", ","].includes(e.key)) {
                        e.preventDefault();
                      }
                    }}
                    onChange={(e) => {
                      if (rows[0])
                        updateRow(rows[0].key, {
                          quantity: clampQuantity(e.target.value, pickedQty),
                        });
                    }}
                  />
                </Field>
              ) : null}

              {showOverride ? (
                <Field
                  label="Unit cost override"
                  required
                  className={
                    showQuantity ? "md:col-span-2 xl:col-span-2" : "md:col-span-2 xl:col-span-4"
                  }
                  hint="Required — this item has no cost on record."
                >
                  <Input
                    className="w-full"
                    type="number"
                    min={0}
                    step="0.01"
                    value={rows[0]?.override ?? ""}
                    onChange={(e) => {
                      if (rows[0])
                        updateRow(rows[0].key, { override: e.target.value });
                    }}
                    placeholder="e.g. 1250.00"
                  />
                </Field>
              ) : null}
            </div>

            {singleSelected ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-navy-500">
                <span className="rounded bg-navy-50 px-2 py-1 font-semibold text-navy-700">
                  {singleSelected.account_code ?? singleSelected.label}
                </span>
                <span className="rounded bg-navy-50 px-2 py-1">
                  {availabilityLabel(singleSelected)}
                </span>
                {calcs[0]?.recordedUnit !== null ? (
                  <span className="rounded bg-navy-50 px-2 py-1">
                    Unit cost {formatPeso(calcs[0]?.recordedUnit)}
                  </span>
                ) : null}
                {calcs[0]?.disabledReason ? (
                  <span className="flex items-center gap-1 rounded bg-red-50 px-2 py-1 font-semibold text-red-700">
                    <AlertTriangle className="size-3" aria-hidden="true" />
                    {calcs[0].disabledReason} — pick a substitute to continue
                  </span>
                ) : null}
              </div>
            ) : null}
          </section>

          {/* Step 2 — issuance check banner. */}
          <div
            className={cn(
              "relative overflow-hidden rounded-xl border shadow-[0_1px_2px_rgba(16,24,40,0.05)]",
              isForIssuance
                ? "border-amber-300/80 bg-gradient-to-r from-amber-50 via-amber-50/50 to-white"
                : "border-navy-200 bg-navy-50/50"
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b",
                isForIssuance
                  ? "from-amber-400 to-yellow-500"
                  : "from-navy-300 to-navy-400"
              )}
            />
            <div className="flex flex-col gap-3 px-4 py-3.5 pl-5 md:flex-row md:items-start md:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <span
                  className={cn(
                    "inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1",
                    isForIssuance
                      ? "text-amber-600 ring-amber-200"
                      : "text-navy-500 ring-navy-200"
                  )}
                >
                  <ClipboardCheck size={18} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-700">
                      Step 2 · Issuance check
                    </span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-navy-700 ring-1 ring-navy-200">
                      {docType} path
                    </span>
                  </div>
                  <label className="mt-1 flex cursor-pointer items-start gap-2">
                    <input
                      type="checkbox"
                      checked={isForIssuance}
                      onChange={(e) => setIsForIssuance(e.target.checked)}
                      className="mt-0.5 size-4 shrink-0 cursor-pointer accent-amber-600"
                    />
                    <span className="text-sm leading-snug">
                      <span className="font-semibold text-navy-900">
                        This item is for issuance
                      </span>{" "}
                      <span className="text-navy-600">
                        — prepare an accountability document and assign it.
                      </span>
                    </span>
                  </label>
                  {!isForIssuance ? (
                    <p className="mt-1 text-xs text-navy-500">
                      Not for issuance → the item stays in stock. No document,
                      no assignment, process ends.
                    </p>
                  ) : multi ? (
                    <p className="mt-1 text-xs text-navy-500">
                      One {headerDocType} covers all {rows.length} lines. Grand
                      total decides the document type (₱
                      {ISSUANCE_THRESHOLD.toLocaleString()} threshold).
                    </p>
                  ) : picked && calcs[0]?.disabledReason ? (
                    <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-red-700">
                      <AlertTriangle className="size-3.5" aria-hidden="true" />
                      {calcs[0].disabledReason} — this item cannot be assigned
                      again until units are available.
                    </p>
                  ) : picked ? (
                    <p className="mt-1 text-xs text-navy-500">
                      Checked against remaining quantity on hand. Pick a
                      substitute when the selected lot is exhausted.
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-navy-500">
                      Select an item above to see its value-based document.
                    </p>
                  )}
                </div>
              </div>

              {isForIssuance ? (
                multi ? (
                  <div className="w-full shrink-0 rounded-lg bg-white/80 p-2.5 ring-1 ring-inset ring-amber-200/70 md:w-[300px]">
                    <div className="space-y-1">
                      {rows.map((row, i) => (
                        <div
                          key={row.key}
                          className="flex items-center justify-between gap-3 text-xs"
                        >
                          <span className="truncate text-navy-600">
                            Item {i + 1}
                            {calcs[i].needsOverride ? " (override)" : ""}
                          </span>
                          <span className="shrink-0 font-semibold tabular-nums text-navy-900">
                            {formatPeso(calcs[i].lineTotal)}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3 border-t border-amber-200/70 pt-2 text-xs">
                      <span className="font-bold uppercase tracking-wide text-navy-600">
                        Grand total
                      </span>
                      <span className="font-bold tabular-nums text-amber-700">
                        {formatPeso(grandTotal)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex shrink-0 flex-wrap items-stretch gap-2">
                    <Stat
                      label="Unit cost"
                      value={
                        calcs[0]?.recordedUnit !== null &&
                        calcs[0]?.recordedUnit !== undefined
                          ? formatPeso(calcs[0].recordedUnit)
                          : calcs[0]?.effUnit != null
                            ? formatPeso(calcs[0].effUnit)
                            : "—"
                      }
                    />
                    <Stat
                      label={calcs[0]?.kind === "stock" ? "Quantity" : "Units"}
                      value={calcs[0]?.kind === "stock" ? `× ${qty}` : "1"}
                    />
                    <Stat
                      label={`${docType} total`}
                      value={formatPeso(total)}
                      emphasis
                    />
                  </div>
                )
              ) : null}
            </div>
          </div>

          {isForIssuance ? (
            <section className="rounded-xl border border-navy-100 bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
              <SectionHead
                step={3}
                icon={<FileText size={12} aria-hidden="true" />}
                title="Accountability document"
                hint={`${docType} is chosen from the total value (₱${ISSUANCE_THRESHOLD.toLocaleString()} threshold). These fields print on the signed sheet.`}
              />
              <div className="mt-3 grid gap-3 md:grid-cols-6 xl:grid-cols-12">
                <Field
                  label="Entity Name"
                  required
                  className="md:col-span-3 xl:col-span-4"
                >
                  <Input
                    className="w-full"
                    value={entity}
                    onChange={(e) => setEntity(e.target.value)}
                    placeholder="e.g. Provincial Government of Sorsogon"
                  />
                </Field>
                <Field label="Fund Cluster" className="md:col-span-3 xl:col-span-3">
                  <Input
                    className="w-full"
                    value={fundCluster}
                    onChange={(e) => setFundCluster(e.target.value)}
                    placeholder="e.g. GF-0100"
                  />
                </Field>
                <Field
                  label={docType === "PAR" ? "PAR No." : "ICS No."}
                  required
                  className="md:col-span-3 xl:col-span-2"
                >
                  <Input
                    className="w-full"
                    value={docNo}
                    onChange={(e) => setDocNo(e.target.value)}
                    placeholder={
                      docType === "PAR"
                        ? "e.g. PAR-2026-001"
                        : "e.g. ICS-2026-001"
                    }
                  />
                </Field>
                <Field
                  label="Document date"
                  required
                  className="md:col-span-3 xl:col-span-3"
                >
                  <DatePicker
                    value={parseLocalDate(docDate)}
                    onChange={(d) => setDocDate(d ? formatLocalDate(d) : "")}
                    placeholder="Pick a date"
                    className="w-full whitespace-nowrap"
                  />
                </Field>
                {!multi ? (
                  <Field label="Description" className="md:col-span-6 xl:col-span-8">
                    <Input
                      className="w-full"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder={
                        picked?.label ?? "Item description on the form"
                      }
                    />
                  </Field>
                ) : null}
                {docType === "PAR" ? (
                  <Field label="Property No." className="md:col-span-3 xl:col-span-4">
                    <Input
                      className="w-full"
                      value={propertyNo}
                      onChange={(e) => setPropertyNo(e.target.value)}
                      placeholder="Property / QR no."
                    />
                  </Field>
                ) : (
                  <>
                    <Field
                      label="Inventory Item No."
                      className="md:col-span-3 xl:col-span-4"
                    >
                      <Input
                        className="w-full"
                        value={inventoryItemNo}
                        onChange={(e) => setInventoryItemNo(e.target.value)}
                        placeholder="Inventory item no."
                      />
                    </Field>
                    <Field
                      label="Estimated Useful Life"
                      className="md:col-span-3 xl:col-span-4"
                    >
                      <Input
                        className="w-full"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1}
                        value={estUsefulLife}
                        onKeyDown={(e) => {
                          if (["-", "+", "e", "E", ".", ","].includes(e.key)) {
                            e.preventDefault();
                          }
                        }}
                        onChange={(e) => setEstUsefulLife(digitsOnly(e.target.value))}
                        placeholder="e.g. 5 (years)"
                      />
                    </Field>
                  </>
                )}
                <Field
                  label="Custodian name (issued by / received from)"
                  required
                  className="md:col-span-3 xl:col-span-4"
                >
                  <Input
                    className="w-full"
                    value={fromName}
                    onChange={(e) => setFromName(e.target.value)}
                    placeholder="Supply and/or Property Custodian"
                  />
                </Field>
                <Field
                  label="Custodian position/office"
                  className="md:col-span-3 xl:col-span-4"
                >
                  <Input
                    className="w-full"
                    value={fromPosition}
                    onChange={(e) => setFromPosition(e.target.value)}
                    placeholder="Position / Office"
                  />
                </Field>
                <Field
                  label="End-user position/office"
                  className="md:col-span-3 xl:col-span-4"
                  hint={
                    postingGuess
                      ? "Auto-filled from the employee profile."
                      : undefined
                  }
                >
                  <Input
                    className="w-full"
                    value={displayedToPosition}
                    onChange={(e) => {
                      setToPosition(e.target.value);
                      setPositionDirty(true);
                    }}
                    placeholder="Position / Office"
                  />
                </Field>
                <div className="grid content-end gap-1 md:col-span-3 xl:col-span-8">
                  <p className="text-xs text-navy-500">
                    Receiving employee:{" "}
                    <span className="font-semibold text-navy-800">
                      {employeeName || "select one above"}
                    </span>
                    {employeeName ? (
                      <>
                        {" "}
                        <span className="text-navy-500">
                          (receives the item + signed {docType})
                        </span>
                      </>
                    ) : null}
                    .
                  </p>
                  {!postingGuess && displayedToPosition.trim() !== "" ? (
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-navy-600">
                      <input
                        type="checkbox"
                        checked={savePosting}
                        onChange={(e) => setSavePosting(e.target.checked)}
                        className="size-3.5 accent-navy-700"
                      />
                      Save position/office to the employee profile
                    </label>
                  ) : null}
                </div>
              </div>
            </section>
          ) : null}

          {mode === "approve-request" ? (
            <section className="rounded-xl border border-navy-100 bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
              <SectionHead
                step={4}
                icon={<CheckCircle2 size={12} aria-hidden="true" />}
                title="Approval record"
                hint="Stored on the request and visible to the employee."
              />
              <div className="mt-3">
                <Field label="Remarks" required>
                  <textarea
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="Approval remarks — recorded on the request…"
                    rows={2}
                    className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
                  />
                </Field>
              </div>
            </section>
          ) : null}
        </div>

        {/* Pinned footer: live summary + actions. */}
        <div className="flex shrink-0 flex-col gap-2 border-t border-navy-100 bg-slate-50/80 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-[11px] leading-snug text-navy-500">{footerHint}</p>
          <DialogFooter className="gap-2">
            <ActionButton
              type="button"
              disabled={!canSubmit || saving}
              onClick={() => submit()}
              loadingLabel={isForIssuance ? "Assigning…" : "Saving…"}
              className="h-6 gap-1.5 rounded-[4px] border border-yellow-500 bg-yellow-500 px-3 text-xs font-semibold text-navy-900 hover:bg-yellow-400"
            >
              {isForIssuance ? `Prepare ${docType} & assign` : "Keep in stock"}
            </ActionButton>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ItemRowEditor({
  index,
  row,
  calc,
  items,
  removable,
  onChange,
  onRemove,
}: {
  index: number;
  row: EvalRow;
  calc: {
    picked: IssuanceAssetOption | null;
    kind: "asset" | "stock" | null;
    qty: number;
    onHand: number;
    recordedUnit: number | null;
    effUnit: number | null;
    needsOverride: boolean;
    lineTotal: number;
    docType: "PAR" | "ICS";
    qtyValid: boolean;
    costValid: boolean;
    assignable: boolean;
    disabledReason: string | null;
  };
  items: IssuanceAssetOption[];
  removable: boolean;
  onChange: (key: number, patch: Partial<EvalRow>) => void;
  onRemove: (key: number) => void;
}) {
  return (
    <div className="grid gap-3 rounded-lg border border-navy-100 bg-slate-50/40 p-3 sm:col-span-2 sm:grid-cols-2">
      <div className="flex items-center justify-between sm:col-span-2">
        <span className="text-xs font-bold uppercase tracking-[0.1em] text-navy-700">
          Item {index + 1}
        </span>
        {removable ? (
          <button
            type="button"
            className="cursor-pointer text-xs font-medium text-red-700 hover:underline"
            onClick={() => onRemove(row.key)}
          >
            Remove
          </button>
        ) : null}
      </div>
      <div className="grid gap-1.5 sm:col-span-2">
        <Label>
          Asset / Stock <span className="text-red-600">*</span>
        </Label>
        <Select
          value={row.itemId}
          onValueChange={(v) =>
            onChange(row.key, { itemId: v, quantity: "1", override: "" })
          }
        >
          <SelectTrigger className="w-full">
            {(() => {
              const selected =
                items.find((i) => i.id === row.itemId) ?? null;
              return selected ? (
                <span className="truncate">
                  {selected.account_code ?? selected.label}
                </span>
              ) : (
                <SelectValue placeholder="Select item to issue" />
              );
            })()}
          </SelectTrigger>
          <SelectContent className="pgso-no-scrollbar">
            {items.map((a) => (
              <SelectItem
                key={a.id}
                value={a.id}
                disabled={a.disabledReason != null}
              >
                <span className="flex w-full items-center justify-between gap-4">
                  <span className="truncate">{a.label}</span>
                  <span
                    className={cn(
                      "shrink-0 text-[10px] font-semibold uppercase tracking-wide",
                      a.disabledReason ? "text-red-600" : "text-navy-500"
                    )}
                  >
                    {a.kind === "stock" ? "Stock" : "Asset"}
                    {" · "}
                    {availabilityLabel(a)}
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {calc.picked ? (
        <p className="text-xs text-zinc-500 sm:col-span-2">
          {calc.picked.account_code ? `${calc.picked.account_code} · ` : ""}
          {calc.disabledReason ? (
            <span className="font-medium text-red-700">
              {calc.disabledReason} — pick a substitute
            </span>
          ) : calc.kind === "stock" ? (
            calc.onHand <= 0 ? (
              <span className="font-medium text-red-700">Out of stock</span>
            ) : (
              `${calc.onHand} on hand`
            )
          ) : (
            "Asset · qty 1"
          )}
          {calc.recordedUnit !== null
            ? ` · Unit cost ${formatPeso(calc.recordedUnit)}`
            : " · No unit cost on record"}
          {row.lineDesc ? ` · Requested: ${row.lineDesc}` : ""}
        </p>
      ) : row.lineDesc ? (
        <p className="text-xs text-zinc-500 sm:col-span-2">
          Requested: {row.lineDesc}
        </p>
      ) : null}
      <div className="grid gap-1.5">
        <Label>
          Item description
        </Label>
        <Input className="w-full"
          value={row.lineDesc}
          onChange={(e) => onChange(row.key, { lineDesc: e.target.value })}
          placeholder={calc.picked?.label ?? "Item description on the form"}
        />
      </div>
      {calc.kind === "stock" ? (
        <div className="grid gap-1.5">
          <Label>
            Quantity (max {calc.onHand}) <span className="text-red-600">*</span>
          </Label>
          <Input className="w-full"
            type="number"
            inputMode="numeric"
            min={1}
            max={calc.onHand}
            step={1}
            value={row.quantity}
            onKeyDown={(e) => {
              if (["-", "+", "e", "E", ".", ","].includes(e.key)) {
                e.preventDefault();
              }
            }}
            onChange={(e) =>
              onChange(row.key, {
                quantity: clampQuantity(e.target.value, calc.onHand),
              })
            }
          />
        </div>
      ) : (
        <div className="grid content-end gap-1.5">
          <p className="text-xs text-zinc-500">Qty 1 (asset)</p>
        </div>
      )}
      {calc.needsOverride ? (
        <div className="grid gap-1.5 sm:col-span-2">
          <Label>
            Unit cost override (required — no cost on record){" "}
            <span className="text-red-600">*</span>
          </Label>
          <Input className="w-full"
            type="number"
            min={0}
            step="0.01"
            value={row.override}
            onChange={(e) => onChange(row.key, { override: e.target.value })}
            placeholder="e.g. 1250.00"
          />
        </div>
      ) : null}
      <p className="text-xs font-medium text-zinc-700 sm:col-span-2">
        {calc.recordedUnit !== null ? (
          <>
            Unit cost {formatPeso(calc.recordedUnit)}
            {calc.kind === "stock" ? ` × ${calc.qty} requested` : ""} ={" "}
          </>
        ) : (
          <>
            Override {formatPeso(calc.effUnit)} × {calc.qty} ={" "}
          </>
        )}
        Line total {formatPeso(calc.lineTotal)}
      </p>
    </div>
  );
}

export { toIso };
