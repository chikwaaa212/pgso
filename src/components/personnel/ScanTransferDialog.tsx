"use client";

/**
 * Compact scan-driven request dialog.
 *
 * The personnel requests page already has a large multi-type filing dialog;
 * this component is deliberately small and only handles the two actions a
 * scan can trigger: a transfer (`?scan=transfer`) and a stock replenishment
 * (`?scan=replenish`). Both call the existing `createRequest` server action,
 * which keeps its own authorization and validation.
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
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  createRequest,
  getRequestFormOptions,
  type EmployeeOption,
} from "@/app/personnel/requests/actions";
import type { ScannedAssetPrefill } from "@/lib/scan-actions";
import rep from "@/app/personnel/repairs/page.module.css";

const MANUAL = "__manual";

export function ScanTransferDialog({
  open,
  onOpenChange,
  prefill,
  scan,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefill: ScannedAssetPrefill;
  scan: string | null;
  onCreated?: () => void;
}) {
  const replenish = scan === "replenish" || prefill.option.kind === "stock";
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [employeeQuery, setEmployeeQuery] = useState("");
  const debouncedQuery = useDebouncedValue(employeeQuery, 300);
  const [requesterId, setRequesterId] = useState("");
  const [transferToMode, setTransferToMode] = useState<"select" | "manual">(
    "select"
  );
  const [transferToId, setTransferToId] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect -- dialog form reset on open */
    setEmployeeQuery("");
    setRequesterId(prefill.assignedToId ?? "");
    setTransferToMode("select");
    setTransferToId("");
    setTransferTo("");
    setQuantity(replenish ? "10" : "1");
    setReason("");
    setFormError("");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, prefill, replenish]);

  useEffect(() => {
    if (!open) return;
    const q = debouncedQuery.trim();
    if (employees.length > 0 && q === "") return;
    let live = true;
    void getRequestFormOptions({ q }).then((opts) => {
      if (!live) return;
      setEmployees((prev) => {
        const seen = new Set(prev.map((e) => e.id));
        const merged = [...prev];
        for (const e of opts.employees) {
          if (!seen.has(e.id)) {
            seen.add(e.id);
            merged.push(e);
          }
        }
        return merged;
      });
    });
    return () => {
      live = false;
    };
  }, [open, debouncedQuery, employees.length]);

  const option = prefill.option;
  const qtyNum = Math.floor(Number(quantity) || 0);
  const targetName =
    transferToMode === "select"
      ? (employees.find((e) => e.id === transferToId)?.full_name ?? "")
      : transferTo.trim();

  const canSubmit = replenish
    ? qtyNum >= 1
    : requesterId !== "" &&
      targetName !== "" &&
      (option.kind !== "stock" || (qtyNum >= 1 && qtyNum <= (option.quantity ?? 0)));

  async function onSubmit() {
    if (saving || !canSubmit) return;
    if (reason.trim() === "") {
      setFormError("Enter a reason for this request.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const res = replenish
        ? await createRequest({
            employeeId: "",
            requestType: "stock_replenishment",
            assetId: option.id,
            quantity: qtyNum,
            reason,
          })
        : await createRequest({
            employeeId: requesterId,
            requestType: "transfer",
            assetId: option.id,
            quantity: option.kind === "stock" ? qtyNum : undefined,
            transferTo: targetName,
            reason,
          });
      if (!res.success) {
        const msg = res.error ?? "Failed to submit the request.";
        setFormError(msg);
        toast.error(msg, { duration: 2000, closeButton: true });
        return;
      }
      onOpenChange(false);
      onCreated?.();
      toast.success(
        replenish
          ? "Replenishment request submitted."
          : "Transfer request submitted.",
        { duration: 2000, closeButton: true }
      );
    } catch {
      const msg = "Failed to submit the request. Please try again.";
      setFormError(msg);
      toast.error(msg, { duration: 2000, closeButton: true });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {replenish ? "Request replenishment" : "Request transfer"}
          </DialogTitle>
          <DialogDescription>
            Scanned from a QR tag. The item and its current holder are
            prefilled; adjust anything before submitting.
          </DialogDescription>
        </DialogHeader>

        <div className={rep.formGrid}>
          <div className={`${rep.field} ${rep.span2} rounded-md border bg-zinc-50 px-3 py-2.5 text-sm`}>
            <p className="text-xs font-medium text-zinc-500">Item</p>
            <p>{option.label}</p>
            <p className="mt-1 text-xs text-zinc-500">
              {option.account_code ?? "No account code"}
              {option.location ? ` · ${option.location}` : ""}
            </p>
          </div>

          {prefill.holderName ? (
            <div className={`${rep.field} ${rep.span2}`}>
              <p className="text-xs font-medium text-zinc-500">Current holder</p>
              <p className="text-sm">{prefill.holderName}</p>
            </div>
          ) : null}

          {replenish ? (
            <div className={rep.field}>
              <Label htmlFor="scan-qty">
                Quantity <span className="text-red-600">*</span>
              </Label>
              <Input
                id="scan-qty"
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
              <p className="text-xs text-zinc-500">
                On hand: {option.quantity ?? 0}
              </p>
            </div>
          ) : (
            <>
              <div className={`${rep.field} ${rep.span2}`}>
                <Label htmlFor="scan-requester">
                  Requested by <span className="text-red-600">*</span>
                </Label>
                <Select value={requesterId} onValueChange={setRequesterId}>
                  <SelectTrigger id="scan-requester">
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

              <div className={`${rep.field} ${rep.span2}`}>
                <Label htmlFor="scan-search">Search employees</Label>
                <Input
                  id="scan-search"
                  value={employeeQuery}
                  onChange={(e) => setEmployeeQuery(e.target.value)}
                  placeholder="Type to narrow the list…"
                />
              </div>

              <div className={`${rep.field} ${rep.span2}`}>
                <Label htmlFor="scan-transfer-to">
                  Transfer to <span className="text-red-600">*</span>
                </Label>
                <Select
                  value={transferToMode === "manual" ? MANUAL : transferToId || undefined}
                  onValueChange={(value) => {
                    if (value === MANUAL) {
                      setTransferToMode("manual");
                      return;
                    }
                    setTransferToMode("select");
                    setTransferToId(value);
                  }}
                >
                  <SelectTrigger id="scan-transfer-to">
                    <SelectValue placeholder="Select employee or type a name" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.full_name}
                      </SelectItem>
                    ))}
                    <SelectItem value={MANUAL}>Someone else…</SelectItem>
                  </SelectContent>
                </Select>
                {transferToMode === "manual" ? (
                  <Input
                    aria-label="Transfer to (manual name)"
                    value={transferTo}
                    onChange={(e) => setTransferTo(e.target.value)}
                    placeholder="Office or person outside the system"
                    className="mt-2"
                  />
                ) : null}
              </div>

              {option.kind === "stock" ? (
                <div className={rep.field}>
                  <Label htmlFor="scan-transfer-qty">
                    Quantity <span className="text-red-600">*</span>
                  </Label>
                  <Input
                    id="scan-transfer-qty"
                    type="number"
                    min={1}
                    max={option.quantity ?? undefined}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                  />
                  <p className="text-xs text-zinc-500">
                    On hand: {option.quantity ?? 0}
                  </p>
                </div>
              ) : null}
            </>
          )}

          <div className={`${rep.field} ${rep.span2}`}>
            <Label htmlFor="scan-reason">
              Reason <span className="text-red-600">*</span>
            </Label>
            <textarea
              id="scan-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                replenish
                  ? "e.g. Stock is below the reorder threshold…"
                  : "e.g. Item is needed by the receiving office…"
              }
              rows={3}
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
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <ActionButton
            type="button"
            disabled={!canSubmit || saving}
            onClick={() => onSubmit()}
            loadingLabel="Submitting…"
          >
            {replenish ? "Request replenishment" : "Request transfer"}
          </ActionButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
