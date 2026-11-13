"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getDeliveryForInspection } from "../actions";
import { InspectionReceipt } from "./inspection-receipt";
import { useCachedAction } from "@/hooks/use-cached-action";
import { CLIENT_CACHE_KEYS } from "@/lib/client-cache";
import { cn } from "@/lib/utils";
import deliveryReceipt from "@/app/personnel/deliveries/delivery-receipt.module.css";

/**
 * Read-only inspection receipt shown as an overlay on the list page.
 * Can be controlled (row click) or render its own trigger button.
 */
export function ViewInspectionDialog({
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

  const { data: delivery, loading, error } = useCachedAction(
    `${CLIENT_CACHE_KEYS.inspections}:receipt:${deliveryId}`,
    () => getDeliveryForInspection(deliveryId),
    { staleTime: 30_000, enabled: open, keepPreviousData: false }
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {hideTrigger ? null : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={triggerClassName}
          aria-label={`View inspection details for ${deliveryRef}`}
        >
          View Details
        </button>
      )}
      <DialogContent
        className={cn(
          "bg-white p-4 sm:max-w-3xl dark:bg-white",
          deliveryReceipt.dialogScroll
        )}
      >
        <DialogHeader className="px-1">
          <DialogTitle>Inspection {deliveryRef}</DialogTitle>
          <DialogDescription>
            Inspection receipt and cross-verification details.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-12 text-center text-sm font-medium text-navy-500">
            Loading record…
          </div>
        ) : error ? (
          <div className="py-12 text-center text-sm font-medium text-red-600">
            This inspection receipt could not be loaded.
          </div>
        ) : delivery ? (
          <InspectionReceipt
            delivery={delivery}
            inspection={delivery.inspection_data}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
