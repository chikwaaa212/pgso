"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getDeliveryDetails, type DeliveryDetails } from "./actions";
import { DeliveryReceipt } from "./[id]/delivery-receipt";
import { cn } from "@/lib/utils";
import styles from "./delivery-receipt.module.css";

/**
 * Read-only delivery record shown as an overlay on the list page — clicking
 * View Details no longer navigates away. The full receipt stays available at
 * /personnel/deliveries/[id] for direct links / printing.
 */
export function ViewDeliveryDialog({
  deliveryId,
  deliveryRef,
  triggerClassName,
}: {
  deliveryId: string;
  deliveryRef: string;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [delivery, setDelivery] = useState<DeliveryDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleOpen = () => {
    setOpen(true);
    // Fetch once per row; reopening is instant from the local copy.
    if (delivery || loading) return;
    setLoading(true);
    setError("");
    getDeliveryDetails(deliveryId)
      .then((data) => setDelivery(data))
      .catch(() =>
        setError("This delivery record could not be loaded.")
      )
      .finally(() => setLoading(false));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={handleOpen}
        className={triggerClassName}
        aria-label={`View details for delivery ${deliveryRef}`}
      >
        View Details
      </button>
      <DialogContent
        className={cn(
          "bg-white p-4 sm:max-w-3xl dark:bg-white",
          styles.dialogScroll
        )}
      >
        <DialogHeader className="px-1">
          <DialogTitle>Delivery {deliveryRef}</DialogTitle>
          <DialogDescription>
            Record overview — inspection details are handled separately.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-12 text-center text-sm font-medium text-navy-500">
            Loading record…
          </div>
        ) : error ? (
          <div className="py-12 text-center text-sm font-medium text-red-600">
            {error}
          </div>
        ) : delivery ? (
          <DeliveryReceipt delivery={delivery} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
