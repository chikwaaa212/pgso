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
  useLogDeliveryDraft,
  type PreviewData,
} from "./log-delivery-mock-form";
import { DeliveryReceipt } from "./delivery-receipt";
import { cn } from "@/lib/utils";
import styles from "../dashboard/page.module.css";

export function LogDeliveryModal() {
  const [open, setOpen] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const draft = useLogDeliveryDraft();

  const previewData: PreviewData = {
    ...draft.step1,
    ...draft.step2,
    ...draft.recipient,
    items: draft.step3.items,
  };

  return (
    <>
      <Dialog open={open} modal={!showPreview} onOpenChange={setOpen}>
        <button
          type="button"
          className={styles.actionPrimary}
          onClick={() => setOpen(true)}
        >
          Log delivery
        </button>
        <DialogContent
          className={cn(
            "bg-white transition-[left,translate] duration-200 sm:max-w-2xl dark:bg-white",
            showPreview && "xl:left-8 xl:translate-x-0"
          )}
        >
          <DialogHeader>
            <DialogTitle>Log a delivery</DialogTitle>
            <DialogDescription>
              Entries are saved to the database on submit.
            </DialogDescription>
          </DialogHeader>
          <LogDeliveryMockForm
            draft={draft}
            onShowPreview={setShowPreview}
            onClose={() => setOpen(false)}
          />
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
