"use client";

import { useState } from "react";
import { useActionState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { useToast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { recordInspection, type InspectionState } from "./actions";
import styles from "../dashboard/page.module.css";

const inspectionResults = ["passed", "partial"];

export function InspectDeliveryModal({
  deliveryId,
  deliveryRef,
  open,
  onOpenChange,
}: {
  deliveryId: string;
  deliveryRef: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [result, setResult] = useState<string>("");
  const [remarks, setRemarks] = useState("");
  const [actionState, formAction] = useActionState<InspectionState, FormData>(
    recordInspection,
    { success: false, error: undefined }
  );
  const lastSuccessId = useRef<string | null>(null);

  const { toast } = useToast();

  useEffect(() => {
    if (actionState.success && lastSuccessId.current !== deliveryId) {
      lastSuccessId.current = deliveryId;
      setResult("");
      setRemarks("");
      toast({
        title: "Inspection recorded",
        description: `Inspection for ${deliveryRef} has been saved.`,
        variant: "success",
      });
      onOpenChange(false);
    }
    if (actionState?.error) {
      toast({
        title: "Save failed",
        description: actionState.error,
        variant: "error",
      });
    }
  }, [actionState, toast, deliveryId, deliveryRef, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Inspect delivery {deliveryRef}</DialogTitle>
          <DialogDescription>
            Record the cross-inspection result for this delivery.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction}>
          <input type="hidden" name="deliveryId" value={deliveryId} />
          <input type="hidden" name="result" value={result} />
          <input type="hidden" name="remarks" value={remarks} />

          <div className="mt-4 flex flex-col gap-4">
            <div>
              <Label
                htmlFor="inspection-result"
                className="mb-1 block text-sm font-medium"
              >
                Inspection Result
              </Label>
              <Select value={result} onValueChange={setResult}>
                <SelectTrigger id="inspection-result" className="w-full">
                  <SelectValue placeholder="Select inspection result" />
                </SelectTrigger>
                <SelectContent>
                  {inspectionResults.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r.charAt(0).toUpperCase() + r.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label
                htmlFor="inspection-remarks"
                className="mb-1 block text-sm font-medium"
              >
                Remarks
              </Label>
              <textarea
                id="inspection-remarks"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Any notes from the inspection…"
                className={styles.addInput}
                rows={3}
              />
            </div>
          </div>

          {actionState?.error && (
            <p className="mt-3 text-sm font-medium text-red-600">
              {actionState.error}
            </p>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className={cn(
                "inline-flex items-center justify-center rounded-full font-medium",
                "focus-visible:outline-2 focus-visible:outline-offset-2",
                "h-10 px-4 text-sm",
                "border border-navy-200 bg-transparent text-navy-700 hover:bg-navy-100"
              )}
            >
              Cancel
            </button>
            <SubmitButton
              variant="primary"
              disabled={!result}
              pendingLabel="Saving…"
            >
              Save inspection
            </SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
