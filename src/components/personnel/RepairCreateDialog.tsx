"use client";

/**
 * Shared create-repair dialog.
 *
 * Mounted by the personnel repairs page and the super-admin repairs page
 * (super admins cannot open `/personnel/*` — middleware redirects cross-
 * portal paths). Item selection uses the same grouped, badge-rich dropdown
 * as the request form.
 *
 * Submitting closes the dialog immediately and paints an optimistic ticket
 * row; success/failure feedback is toast-only and a failed write rolls the
 * temporary row back.
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Boxes, Package, Wrench } from "lucide-react";
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
import { DatePicker } from "@/components/ui/date-picker";
import {
  createRepair,
  getRepairFormOptions,
  type RepairAssetOption,
  type RepairEmployeeOption,
  type RepairRow,
} from "@/app/personnel/repairs/actions";
import type { ScannedAssetPrefill } from "@/lib/scan-actions";
import rep from "@/app/personnel/repairs/page.module.css";

function mergeOptions(
  prev: RepairAssetOption[],
  next: RepairAssetOption[]
): RepairAssetOption[] {
  if (next.length === 0) return prev;
  const seen = new Set(prev.map((a) => a.id));
  const merged = [...prev];
  for (const a of next) {
    if (!seen.has(a.id)) {
      seen.add(a.id);
      merged.push(a);
    }
  }
  return merged;
}

function optionFromPrefill(prefill: ScannedAssetPrefill): RepairAssetOption {
  const option = prefill.option;
  return {
    id: option.id,
    label: option.label,
    account_code: option.account_code,
    account_title: option.account_title,
    asset_type: option.asset_type,
    location: option.location,
    status: option.status,
    kind: "asset",
    quantity: null,
  };
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

function itemName(item: RepairAssetOption) {
  const code = item.account_code?.trim() ?? "";
  return code && item.label.startsWith(`${code} — `)
    ? item.label.slice(code.length + 3)
    : item.label;
}

function itemTone(item: RepairAssetOption): "ok" | "warn" | "bad" | "none" {
  if (item.kind === "stock") {
    const qty = item.quantity ?? 0;
    return qty <= 0 ? "bad" : qty <= 5 ? "warn" : "ok";
  }
  const status = (item.status ?? "").toLowerCase();
  if (!status) return "none";
  if (
    ["available", "serviceable", "good", "active"].some((k) =>
      status.includes(k)
    )
  )
    return "ok";
  if (
    ["unserviceable", "retired", "damaged", "lost", "disposed", "out of stock"].some(
      (k) => status.includes(k)
    )
  )
    return "bad";
  if (["assigned", "issued", "in use", "borrowed"].some((k) => status.includes(k)))
    return "warn";
  return "none";
}

function itemBadge(item: RepairAssetOption) {
  if (item.kind === "stock") {
    return item.quantity != null ? `${item.quantity} on hand` : "Stock";
  }
  const status = (item.status ?? "available").trim();
  return status ? status.charAt(0).toUpperCase() + status.slice(1) : "Available";
}

/** Grouped dropdown row: icon, name + code/location, status pill. */
function ItemOption({ item }: { item: RepairAssetOption }) {
  const isStock = item.kind === "stock";
  const code = item.account_code?.trim() ?? "";
  return (
    <span className={rep.itemOption}>
      <span
        className={rep.itemOptionIcon}
        data-kind={isStock ? "stock" : "asset"}
        aria-hidden="true"
      >
        {isStock ? <Boxes size={14} /> : <Package size={14} />}
      </span>
      <span className={rep.itemOptionBody}>
        <span className={rep.itemOptionTitle}>{itemName(item)}</span>
        <span className={rep.itemOptionMeta}>
          {code ? <span className={rep.itemOptionCode}>{code}</span> : null}
          {item.location ? (
            <span className={rep.itemOptionMetaText}>{item.location}</span>
          ) : null}
        </span>
      </span>
      <span className={rep.itemOptionBadge} data-tone={itemTone(item)}>
        {itemBadge(item)}
      </span>
    </span>
  );
}

/** Registered assets first, then delivered stock lots that still have units. */
function ItemChoices({ items }: { items: RepairAssetOption[] }) {
  // Depleted lots (0 on hand) cannot be repaired — keep them out of the list.
  const selectable = items.filter(
    (item) => (item.kind ?? "asset") !== "stock" || (item.quantity ?? 0) > 0
  );
  const groups = [
    { kind: "asset" as const, label: "Registered assets" },
    { kind: "stock" as const, label: "Delivered / stock items" },
  ];
  const rowsByKind = groups.map((group) => ({
    ...group,
    rows: selectable.filter((item) => (item.kind ?? "asset") === group.kind),
  }));
  const showLabels = rowsByKind.every((group) => group.rows.length > 0);

  if (selectable.length === 0) {
    return (
      <p className={rep.itemEmpty}>
        No assets or stock items with units on hand are available yet.
      </p>
    );
  }

  return (
    <>
      {rowsByKind.map((group) =>
        group.rows.length === 0 ? null : (
          <SelectGroup key={group.kind}>
            {showLabels ? (
              <SelectLabel className={rep.itemGroupLabel}>
                {group.label}
              </SelectLabel>
            ) : null}
            {group.rows.map((item) => (
              <SelectItem
                key={item.id}
                value={item.id}
                className={rep.itemSelectItem}
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

function PickedItemCard({ item }: { item: RepairAssetOption }) {
  const isStock = item.kind === "stock";
  const facts = [
    {
      label: isStock ? "Stock code" : "Account code",
      value: item.account_code,
    },
    {
      label: isStock ? "Stock title" : "Account title",
      value: item.account_title,
    },
    {
      label: isStock ? "Stock type" : "Asset type",
      value: item.asset_type,
    },
    isStock
      ? {
          label: "Quantity on hand",
          value: item.quantity != null ? String(item.quantity) : null,
        }
      : { label: "Status", value: item.status },
  ];

  return (
    <div className={`${rep.span2} ${rep.selectedCard}`}>
      <div className={rep.selectedHead}>
        <span className={rep.selectedIcon} aria-hidden="true">
          {isStock ? <Boxes size={16} /> : <Package size={16} />}
        </span>
        <div className={rep.selectedText}>
          <p className={rep.selectedTitle}>{itemName(item)}</p>
          <p className={rep.selectedSub}>
            {isStock ? "Stock item" : "Registered asset"}
            {item.location ? ` · ${item.location}` : ""}
          </p>
        </div>
        <span className={rep.itemKind} data-kind={isStock ? "stock" : "asset"}>
          {isStock ? "Stock" : "Asset"}
        </span>
        <span className={rep.selectedBadge} data-tone={itemTone(item)}>
          {itemBadge(item)}
        </span>
      </div>
      <dl className={rep.selectedGrid}>
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

/** Two 24px buttons per the Personnel action-button standard. */
const DIALOG_BTN = "h-6 rounded-[4px] px-3 text-xs font-semibold";

function SectionHead({
  step,
  title,
  hint,
}: {
  step: string;
  title: string;
  hint: string;
}) {
  return (
    <div className={rep.dialogSectionHead}>
      <span className={rep.dialogStep} aria-hidden="true">
        {step}
      </span>
      <div>
        <h3 className={rep.dialogSectionTitle}>{title}</h3>
        <p className={rep.dialogSectionHint}>{hint}</p>
      </div>
    </div>
  );
}

export function RepairCreateDialog({
  open,
  onOpenChange,
  prefill = null,
  onCreated,
  onOptimisticCreate,
  onOptimisticRemove,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefill?: ScannedAssetPrefill | null;
  onCreated?: () => void;
  /** Paint a temporary ticket row while the server write is in flight. */
  onOptimisticCreate?: (row: RepairRow) => void;
  /** Roll the temporary row back when the write fails. */
  onOptimisticRemove?: (id: string) => void;
}) {
  const [assets, setAssets] = useState<RepairAssetOption[]>([]);
  const [employees, setEmployees] = useState<RepairEmployeeOption[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);

  const [assetId, setAssetId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [repairDate, setRepairDate] = useState(todayISO());
  const [description, setDescription] = useState("");
  const [technician, setTechnician] = useState("");
  const [cost, setCost] = useState("");
  const [saving, setSaving] = useState(false);

  // Fresh form + prefill every time the dialog opens. A scanned asset and its
  // current holder are preselected but remain editable.
  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect -- dialog form reset on open */
    setAssetId(prefill?.option.id ?? "");
    setEmployeeId(prefill?.assignedToId ?? "");
    setRepairDate(todayISO());
    setDescription("");
    setTechnician("");
    setCost("");
    /* eslint-enable react-hooks/set-state-in-effect */
    if (prefill?.option) {
      setAssets((prev) => mergeOptions(prev, [optionFromPrefill(prefill)]));
    }
  }, [open, prefill]);

  useEffect(() => {
    if (!open || employees.length > 0) return;
    void getRepairFormOptions({})
      .then((opts) => {
        setEmployees(opts.employees);
        setAssets((prev) => mergeOptions(prev, opts.assets));
      })
      .finally(() => setLoadingItems(false));
  }, [open, employees.length]);

  const pickedAsset = assets.find((a) => a.id === assetId) ?? null;
  const pickedEmployee = employees.find((e) => e.id === employeeId) ?? null;

  const costNum = cost.trim() === "" ? null : Number(cost);
  const canSubmit =
    assetId !== "" &&
    employeeId !== "" &&
    description.trim() !== "" &&
    repairDate !== "" &&
    (costNum === null || (Number.isFinite(costNum) && costNum >= 0));

  async function onSubmit() {
    if (saving || !canSubmit) return;
    setSaving(true);

    // Optimistic row + instant close: the table behind the dialog updates on
    // the same tick the user hits "Log repair". Rolled back if the write fails.
    const tempId = `temp-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const optimisticRow: RepairRow = {
      id: tempId,
      asset_id: assetId,
      asset_label: pickedAsset?.label ?? null,
      account_code: pickedAsset?.account_code ?? null,
      account_title: pickedAsset?.account_title ?? null,
      asset_type: pickedAsset?.asset_type ?? null,
      reported_by: employeeId,
      reporter_name: pickedEmployee?.full_name ?? "Employee",
      repair_date: repairDate,
      description: description.trim(),
      status: "pending",
      cost: costNum,
      technician: technician.trim() || null,
      created_at: new Date().toISOString(),
    };
    onOptimisticCreate?.(optimisticRow);
    onOpenChange(false);

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
        onOptimisticRemove?.(tempId);
        toast.error(
          res.error ?? "Could not log the repair. Please try again.",
          { duration: 2500, closeButton: true }
        );
        return;
      }
      onCreated?.();
      toast.success("Repair ticket logged.", {
        duration: 2000,
        closeButton: true,
      });
    } catch {
      onOptimisticRemove?.(tempId);
      toast.error("Could not log the repair. Please try again.", {
        duration: 2500,
        closeButton: true,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`max-h-[92vh] overflow-y-auto sm:max-w-2xl ${rep.dialogScroll}`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <span className={rep.dialogTitleIcon} aria-hidden="true">
              <Wrench size={16} />
            </span>
            New repair ticket
          </DialogTitle>
          <DialogDescription>
            Log a repair for a registered asset or a stock item. The ticket
            starts as pending and can be progressed from the repairs table.
          </DialogDescription>
        </DialogHeader>

        <div className={rep.dialogBody}>
          <section className={rep.dialogSection}>
            <SectionHead
              step="1"
              title="Item to repair"
              hint="Choose the registered asset or delivered stock item that needs repair."
            />

            <div className={rep.formGrid}>
              <div className={`${rep.field} ${rep.span2}`}>
                <Label htmlFor="rep-asset">
                  Asset / stock item <span className="text-red-600">*</span>
                </Label>
                <Select value={assetId} onValueChange={setAssetId}>
                  <SelectTrigger id="rep-asset" className="w-full">
                    <SelectValue
                      placeholder={
                        loadingItems
                          ? "Loading items…"
                          : "Select an asset or stock item"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent className={rep.itemSelectContent}>
                    <ItemChoices items={assets} />
                  </SelectContent>
                </Select>
              </div>

              {pickedAsset ? <PickedItemCard item={pickedAsset} /> : null}
            </div>
          </section>

          <section className={rep.dialogSection}>
            <SectionHead
              step="2"
              title="What happened"
              hint="Who reported it, when it happened, and what is wrong."
            />

            <div className={rep.formGrid}>
              <div className={rep.field}>
                <Label htmlFor="rep-employee">
                  Reported by <span className="text-red-600">*</span>
                </Label>
                <Select value={employeeId} onValueChange={setEmployeeId}>
                  <SelectTrigger id="rep-employee" className="w-full">
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
                  rows={3}
                  className={rep.textarea}
                />
                <p className={rep.helperText}>
                  Keep it short and specific — this appears on the repair
                  receipt.
                </p>
              </div>
            </div>
          </section>

          <section className={rep.dialogSection}>
            <SectionHead
              step="3"
              title="Handling"
              hint="Optional now — the technician and final cost can be added later."
            />

            <div className={rep.formGrid}>
              <div className={rep.field}>
                <Label htmlFor="rep-tech">Technician</Label>
                <Input
                  id="rep-tech"
                  type="text"
                  value={technician}
                  onChange={(e) => setTechnician(e.target.value)}
                  placeholder="e.g. J. Santos"
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
                  placeholder="0.00"
                />
                <p className={rep.helperText}>
                  Leave blank until the final cost is known.
                </p>
              </div>
            </div>
          </section>
        </div>

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <p className={rep.dialogFooterNote}>
            <span className="text-red-600">*</span> Required fields
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className={DIALOG_BTN}
            >
              Cancel
            </Button>
            <ActionButton
              type="button"
              variant="warning"
              disabled={!canSubmit || saving}
              onClick={() => onSubmit()}
              loadingLabel="Logging…"
              className={`${DIALOG_BTN} border border-yellow-500 bg-yellow-500 text-navy-900 hover:bg-yellow-400`}
            >
              Log repair
            </ActionButton>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
