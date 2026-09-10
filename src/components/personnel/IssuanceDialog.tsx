"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  ISSUANCE_THRESHOLD,
  formatPeso,
  resolveDocType,
} from "@/lib/issuance-rules";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label>
        {label}
        {required ? (
          <span className="text-red-600" aria-hidden="true">
            {" "}
            *
          </span>
        ) : null}
      </Label>
      {children}
    </div>
  );
}

function toIso(d: Date | undefined) {
  return d ? d.toISOString().slice(0, 10) : "";
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
export function IssuanceEvaluateDialog({
  open,
  onOpenChange,
  mode,
  request,
  presetAssetId,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: "approve-request" | "direct";
  request?: IssuanceRequestPrefill | null;
  /** Pre-select this asset/stock (e.g. from the Assets row). */
  presetAssetId?: string | null;
  onSuccess?: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
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
    setOptionsError("");
    void getIssuanceFormOptions()
      .then((opts) => {
        setEmployees(opts.employees);
        setItems(opts.items);
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

  async function submit() {
    if (!canSubmit || saving) return;
    setSaving(true);
    setError("");

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
        setSaving(false);
        setError(res.error ?? "Failed to save the employee posting.");
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
      setSaving(false);
      if (!res.success) {
        setError(res.error ?? "Failed to save the issuance.");
        return;
      }
      onOpenChange(false);
      onSuccess?.();
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
    setSaving(false);
    if (!res.success) {
      setError(res.error ?? "Failed to save the issuance.");
      return;
    }
    onOpenChange(false);
    onSuccess?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="pgso-no-scrollbar max-h-[90vh] overflow-y-auto sm:max-w-3xl">
<DialogHeader>
        <DialogTitle>
          {mode === "approve-request"
            ? "Approve with issuance evaluation"
            : "Assign / issue item"}
        </DialogTitle>
        <DialogDescription>
          {mode === "approve-request" && request
            ? `Shared evaluation for ${request.employee_name}: issuance check → value-based document → sign → assign. Denials still use Reject and end with no assignment.`
            : "Personnel-initiated path — no request needed. Same evaluation: issuance check → value-based document → sign → assign."}
        </DialogDescription>
        </DialogHeader>

        {optionsError ? (
          <p
            role="alert"
            className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          >
            {optionsError}
          </p>
        ) : null}

        <div className="grid gap-4 py-1 sm:grid-cols-2">
          <Field label="Receiving employee" required>
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
            <div className="grid gap-1.5 sm:col-span-2">
              <p className="text-sm font-medium">
                Requested items ({rows.length})
              </p>
            </div>
          ) : (
            <Field label="Asset / Stock" required>
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
                  <span className="truncate">
                    {singleSelected.account_code ?? singleSelected.label}
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
                      {a.label} · {a.kind === "stock" ? "Stock" : "Asset"}
                      {a.disabledReason ? ` — ${a.disabledReason}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}

{multi
        ? rows.map((row, i) => (
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
          ))
        : null}

          {mode === "approve-request" ? (
            <div className="sm:col-span-2">
              <Button type="button" variant="outline" onClick={addRow}>
                Add another item
              </Button>
            </div>
          ) : null}

          {calcs[0]?.kind === "stock" && !multi ? (
            <Field
              label={`Quantity (max ${pickedQty} on hand)`}
              required
            >
              <Input className="w-full"
                type="number"
                min={1}
                max={pickedQty}
                step={1}
                value={rows[0]?.quantity ?? "1"}
                onChange={(e) => {
                  if (rows[0])
                    updateRow(rows[0].key, { quantity: e.target.value });
                }}
              />
            </Field>
          ) : null}

          {calcs[0]?.needsOverride && !multi ? (
            <Field
              label="Unit cost override (required — no cost on record)"
              required
            >
              <Input className="w-full"
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

          <div className="grid gap-1.5 sm:col-span-2">
            <Label>Issuance check (step 2)</Label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isForIssuance}
                onChange={(e) => setIsForIssuance(e.target.checked)}
              />
              This item is for issuance — prepare an accountability document
              and assign it.
            </label>
            {!isForIssuance ? (
              <p className="text-xs text-zinc-500">
                Not for issuance → the item stays in stock. No document, no
                assignment, process ends.
              </p>
            ) : multi ? (
              <div className="grid gap-1 text-xs font-medium text-zinc-700">
                {rows.map((row, i) => (
                  <p key={row.key}>
                    Item {i + 1}: {formatPeso(calcs[i].lineTotal)}
                    {calcs[i].needsOverride ? " (override cost)" : ""}
                  </p>
                ))}
                <p>
                  Grand total {formatPeso(grandTotal)} → single {headerDocType}{" "}
                  (
                  {headerDocType === "PAR"
                    ? `over ₱${ISSUANCE_THRESHOLD.toLocaleString()}`
                    : `₱${ISSUANCE_THRESHOLD.toLocaleString()} or less`}
                  ).
                </p>
              </div>
            ) : picked ? (
              calcs[0].disabledReason ? (
                <p className="text-xs font-medium text-red-700">
                  This item is {calcs[0].disabledReason.toLowerCase()} — pick
                  a substitute to continue.
                </p>
              ) : (
                <p className="text-xs font-medium text-zinc-700">
                  {calcs[0].recordedUnit !== null ? (
                    <>
                      Unit cost {formatPeso(calcs[0].recordedUnit)}
                      {calcs[0].kind === "stock"
                        ? ` × ${qty} requested`
                        : ""}{" "}
                      ={" "}
                    </>
                  ) : (
                    <>
                      Override unit cost {formatPeso(calcs[0].effUnit)} × {qty}{" "}
                      ={" "}
                    </>
                  )}
                  Total {formatPeso(total)} → {docType} required (
                  {docType === "PAR"
                    ? `over ₱${ISSUANCE_THRESHOLD.toLocaleString()}`
                    : `₱${ISSUANCE_THRESHOLD.toLocaleString()} or less`}
                  ).
                </p>
              )
            ) : null}
          </div>

          {isForIssuance ? (
            <>
              <Field label="Entity Name" required>
                <Input className="w-full"
                  value={entity}
                  onChange={(e) => setEntity(e.target.value)}
                  placeholder="e.g. Provincial Government of Sorsogon"
                />
              </Field>
              <Field label="Fund Cluster">
                <Input className="w-full"
                  value={fundCluster}
                  onChange={(e) => setFundCluster(e.target.value)}
                  placeholder="e.g. GF-0100"
                />
              </Field>
              <Field
                label={docType === "PAR" ? "PAR No." : "ICS No."}
                required
              >
                <Input className="w-full"
                  value={docNo}
                  onChange={(e) => setDocNo(e.target.value)}
                  placeholder={
                    docType === "PAR"
                      ? "e.g. PAR-2026-001"
                      : "e.g. ICS-2026-001"
                  }
                />
              </Field>
              <Field label="Document date" required>
                <Input className="w-full"
                  type="date"
                  value={docDate}
                  onChange={(e) => setDocDate(e.target.value)}
                />
              </Field>
              {!multi ? (
                <div className="grid gap-1.5 sm:col-span-2">
                  <Field label="Description">
                    <Input className="w-full"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder={picked?.label ?? "Item description on the form"}
                    />
                  </Field>
                </div>
              ) : null}
              {docType === "PAR" ? (
                <Field label="Property No.">
                  <Input className="w-full"
                    value={propertyNo}
                    onChange={(e) => setPropertyNo(e.target.value)}
                    placeholder="Property / QR no."
                  />
                </Field>
              ) : (
                <>
                  <Field label="Inventory Item No.">
                    <Input className="w-full"
                      value={inventoryItemNo}
                      onChange={(e) => setInventoryItemNo(e.target.value)}
                      placeholder="Inventory item no."
                    />
                  </Field>
                  <Field label="Estimated Useful Life">
                    <Input className="w-full"
                      value={estUsefulLife}
                      onChange={(e) => setEstUsefulLife(e.target.value)}
                      placeholder="e.g. 5 years"
                    />
                  </Field>
                </>
              )}
              <Field label="Custodian name (issued by / received from)" required>
                <Input className="w-full"
                  value={fromName}
                  onChange={(e) => setFromName(e.target.value)}
                  placeholder="Supply and/or Property Custodian"
                />
              </Field>
              <Field label="Custodian position/office">
                <Input className="w-full"
                  value={fromPosition}
                  onChange={(e) => setFromPosition(e.target.value)}
                  placeholder="Position / Office"
                />
              </Field>
              <Field label="End-user position/office">
                <Input className="w-full"
                  value={displayedToPosition}
                  onChange={(e) => {
                    setToPosition(e.target.value);
                    setPositionDirty(true);
                  }}
                  placeholder="Position / Office"
                />
              </Field>
              <div className="grid content-end gap-1.5">
                <p className="text-xs text-zinc-500">
                  End user: {employeeName || "—"} (receives the item + signed{" "}
                  {docType}
                  ).
                </p>
                {postingGuess ? (
                  <p className="text-xs text-zinc-500">
                    Auto-filled from the employee profile.
                  </p>
                ) : displayedToPosition.trim() !== "" ? (
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-600">
                    <input
                      type="checkbox"
                      checked={savePosting}
                      onChange={(e) => setSavePosting(e.target.checked)}
                    />
                    Save position/office to the employee profile
                  </label>
                ) : null}
              </div>
            </>
          ) : null}

          {mode === "approve-request" ? (
            <div className="grid gap-1.5 sm:col-span-2">
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
          ) : null}
        </div>

        {error ? (
          <p
            role="alert"
            className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="button" disabled={!canSubmit || saving} onClick={() => void submit()}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : isForIssuance ? (
              `Prepare ${docType} & assign`
            ) : (
              "Keep in stock"
            )}
          </Button>
        </DialogFooter>
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
    <div className="grid gap-3 rounded-md border p-3 sm:col-span-2 sm:grid-cols-2">
      <div className="flex items-center justify-between sm:col-span-2">
        <span className="text-sm font-medium">Item {index + 1}</span>
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
                {a.label} · {a.kind === "stock" ? "Stock" : "Asset"}
                {a.disabledReason ? ` — ${a.disabledReason}` : ""}
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
            min={1}
            max={calc.onHand}
            step={1}
            value={row.quantity}
            onChange={(e) => onChange(row.key, { quantity: e.target.value })}
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
