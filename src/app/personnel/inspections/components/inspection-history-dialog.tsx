"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getDeliveryForInspection, getInspectionHistory } from "../actions";
import { InspectionReceipt } from "./inspection-receipt";
import { useCachedAction } from "@/hooks/use-cached-action";
import { CLIENT_CACHE_KEYS } from "@/lib/client-cache";
import { cn } from "@/lib/utils";
import receipt from "./receipt.module.css";
import deliveryReceipt from "@/app/personnel/deliveries/delivery-receipt.module.css";

/**
 * Every recorded inspection for a delivery, stacked newest-first inside an
 * overlay. Can be controlled (row click) or render its own trigger button.
 */
export function InspectionHistoryDialog({
  deliveryId,
  deliveryRef,
  triggerClassName,
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
}: {
  deliveryId: string;
  deliveryRef: string;
  triggerClassName?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  };

  const { data, loading, error } = useCachedAction(
    `${CLIENT_CACHE_KEYS.inspections}:history:${deliveryId}`,
    () =>
      Promise.all([
        getDeliveryForInspection(deliveryId),
        getInspectionHistory(deliveryId),
      ]).then(([delivery, history]) => ({ delivery, history })),
    { staleTime: 30_000, enabled: open, keepPreviousData: false }
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {hideTrigger ? null : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={triggerClassName}
          aria-label={`View inspection history for ${deliveryRef}`}
        >
          History
        </button>
      )}
      <DialogContent
        className={cn(
          "bg-white p-4 sm:max-w-3xl dark:bg-white",
          deliveryReceipt.dialogScroll
        )}
      >
        <DialogHeader className="px-1">
          <DialogTitle>Inspection history — {deliveryRef}</DialogTitle>
          <DialogDescription>
            Every recorded inspection for this delivery, newest first.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-12 text-center text-sm font-medium text-navy-500">
            Loading history…
          </div>
        ) : error ? (
          <div className="py-12 text-center text-sm font-medium text-red-600">
            This inspection history could not be loaded.
          </div>
        ) : data ? (
          data.history.length === 0 ? (
            <div className={receipt.empty}>
              No inspection records have been recorded for this delivery yet.
            </div>
          ) : (
            <div className={receipt.receiptStack}>
              <p className={receipt.stackLabel}>Latest Receipt</p>
              {data.history.map((record) => (
                <InspectionReceipt
                  key={record.id}
                  delivery={data.delivery}
                  inspection={record}
                />
              ))}
            </div>
          )
        ) : null}
      </DialogContent>
    </Dialog>
  );
}