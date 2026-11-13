"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  LogDeliveryMockForm,
  hydrateDeliveryDraft,
  useLogDeliveryDraft,
  type PreviewData,
} from "./log-delivery-mock-form";
import { DeliveryReceipt } from "./delivery-receipt";
import { getDeliveryDetails } from "./actions";
import { cn } from "@/lib/utils";

/**
 * Edit trigger for a pending delivery. Opens the same stepper used by Log
 * delivery, pre-filled with the record so nothing has to be re-entered, and
 * saves back through `updateDelivery`.
 */
export function EditDeliveryModal({
  deliveryId,
  deliveryRef,
  triggerClassName,
}: {
  deliveryId: string;
  deliveryRef: string;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const draft = useLogDeliveryDraft();

  const previewData: PreviewData = {
    ...draft.step1,
    ...draft.step2,
    ...draft.recipient,
    items: draft.step3.items,
  };

  const handleOpen = () => {
    setOpen(true);
    setLoading(true);
    setError("");
    getDeliveryDetails(deliveryId)
      .then((delivery) => hydrateDeliveryDraft(draft, delivery))
      .catch(() =>
        setError("This delivery record could not be loaded.")
      )
      .finally(() => setLoading(false));
  };

  return (
    <>
      <Dialog open={open} modal={!showPreview} onOpenChange={setOpen}>
        <button
          type="button"
          onClick={handleOpen}
          className={triggerClassName}
          aria-label={`Edit delivery ${deliveryRef}`}
        >
          Edit
        </button>
        <DialogContent
          className={cn(
            "bg-white transition-[left,translate] duration-200 sm:max-w-2xl dark:bg-white",
            showPreview && "xl:left-8 xl:translate-x-0"
          )}
        >
          <DialogHeader>
            <DialogTitle>Edit delivery {deliveryRef}</DialogTitle>
            <DialogDescription>
              The log is pre-filled — adjust any step, then save your changes.
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
          ) : (
            <LogDeliveryMockForm
              draft={draft}
              editDeliveryId={deliveryId}
              onShowPreview={setShowPreview}
              onClose={() => setOpen(false)}
              onReopen={() => setOpen(true)}
            />
          )}
        </DialogContent>
      </Dialog>

      {showPreview && (
        <>
          <div
            aria-hidden="true"
            onClick={() => setShowPreview(false)}
            className="fixed inset-0 z-[55] animate-in bg-black/50 duration-200 fade-in-0"
          />
          <div
            role="dialog"
            aria-modal="false"
            aria-label="Preview delivery entry"
            className="fixed top-1/2 left-1/2 z-[60] max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 animate-in overflow-y-auto duration-200 fade-in-0 zoom-in-95 xl:top-1/2 xl:right-8 xl:left-auto xl:translate-x-0"
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowPreview(false);
              }}
              aria-label="Close preview"
              className="absolute top-3 right-3 z-10 rounded-full border border-navy-200 bg-white px-2.5 py-1 text-xs font-medium text-navy-700 shadow-md transition-colors hover:bg-navy-100"
            >
              Close
            </button>
            <DeliveryReceipt data={previewData} />
          </div>
        </>
      )}
    </>
  );
}
