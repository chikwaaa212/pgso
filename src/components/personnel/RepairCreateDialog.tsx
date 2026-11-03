"use client";

/**
 * Shared create-repair dialog.
 *
 * Extracted verbatim from the personnel repairs page so the super-admin
 * portal can log a repair too (super admins cannot open `/personnel/*` —
 * middleware redirects cross-portal paths). `createRepair` already accepts
 * personnel and super admins; employees are rejected server-side.
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
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
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  createRepair,
  getRepairFormOptions,
  type RepairAssetOption,
  type RepairEmployeeOption,
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

export function RepairCreateDialog({
  open,
  onOpenChange,
  prefill = null,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefill?: ScannedAssetPrefill | null;
  onCreated?: () => void;
}) {
  const [assets, setAssets] = useState<RepairAssetOption[]>([]);
  const [employees, setEmployees] = useState<RepairEmployeeOption[]>([]);
  const [itemQuery, setItemQuery] = useState("");
  const debouncedItemQuery = useDebouncedValue(itemQuery, 300);
  const trimmedItemSearch = debouncedItemQuery.trim();
  const [searchedItems, setSearchedItems] = useState<RepairAssetOption[] | null>(
    null
  );
  const [searchedItemsFor, setSearchedItemsFor] = useState("");
  const searchingItems =
    trimmedItemSearch !== "" && searchedItemsFor !== trimmedItemSearch;

  const [assetId, setAssetId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [repairDate, setRepairDate] = useState(todayISO());
  const [description, setDescription] = useState("");
  const [technician, setTechnician] = useState("");
  const [cost, setCost] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Fresh form + prefill every time the dialog opens. A scanned asset and its
  // current holder are preselected but remain editable.
  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect -- dialog form reset on open */
    setItemQuery("");
    setSearchedItems(null);
    setSearchedItemsFor("");
    setAssetId(prefill?.option.id ?? "");
    setEmployeeId(prefill?.assignedToId ?? "");
    setRepairDate(todayISO());
    setDescription("");
    setTechnician("");
    setCost("");
    setFormError("");
    /* eslint-enable react-hooks/set-state-in-effect */
    if (prefill?.option) {
      setAssets((prev) => mergeOptions(prev, [optionFromPrefill(prefill)]));
    }
  }, [open, prefill]);

  useEffect(() => {
    if (!open || employees.length > 0) return;
    void getRepairFormOptions({}).then((opts) => {
      setEmployees(opts.employees);
      setAssets((prev) => mergeOptions(prev, opts.assets));
    });
  }, [open, employees.length]);

  useEffect(() => {
    if (!open) return;
    const q = debouncedItemQuery.trim();
    if (q === "" || q === searchedItemsFor) return;
    let live = true;
    void getRepairFormOptions({ q })
      .then((opts) => {
        if (!live) return;
        setSearchedItems(opts.assets);
        setSearchedItemsFor(q);
        setAssets((prev) => mergeOptions(prev, opts.assets));
      })
      .catch(() => {
        if (live) setSearchedItemsFor(q);
      });
    return () => {
      live = false;
    };
  }, [open, debouncedItemQuery, searchedItemsFor]);

  // Empty query → default window; pending query → previous results stay
  // visible (no flash of wrong options while the next window loads).
  const visibleAssets =
    trimmedItemSearch === "" ? assets : (searchedItems ?? assets);
  const lookupAssets =
    searchedItems && searchedItems.length > 0
      ? mergeOptions(assets, searchedItems)
      : assets;

  const pickedAsset = lookupAssets.find((a) => a.id === assetId) ?? null;

  const costNum = cost.trim() === "" ? null : Number(cost);
  const canSubmit =
    assetId !== "" &&
    employeeId !== "" &&
    description.trim() !== "" &&
    repairDate !== "" &&
    (costNum === null || (Number.isFinite(costNum) && costNum >= 0));

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
      onOpenChange(false);
      onCreated?.();
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
            <Label htmlFor="rep-item-search">Search items</Label>
            <Input
              id="rep-item-search"
              aria-label="Search items"
              value={itemQuery}
              onChange={(e) => setItemQuery(e.target.value)}
              placeholder="Type to search assets…"
            />
            {searchingItems ? (
              <p className="text-xs text-zinc-500">Searching…</p>
            ) : null}
          </div>
          <div className={`${rep.field} ${rep.span2}`}>
            <Label htmlFor="rep-asset">
              Asset <span className="text-red-600">*</span>
            </Label>
            <Select value={assetId} onValueChange={setAssetId}>
              <SelectTrigger id="rep-asset">
                <SelectValue placeholder="Select asset" />
              </SelectTrigger>
              <SelectContent>
                {visibleAssets.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {pickedAsset ? (
            <div
              className={`${rep.span2} grid gap-3 rounded-md border bg-zinc-50 px-3 py-2.5 text-sm sm:grid-cols-2`}
            >
              <div>
                <p className="text-xs font-medium text-zinc-500">Account code</p>
                <p>{pickedAsset.account_code ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-zinc-500">Account title</p>
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
            onClick={() => onOpenChange(false)}
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
  );
}
