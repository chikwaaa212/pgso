'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { IarReportView } from './iar-report-view';
import { cn } from '@/lib/utils';
import deliveryReceipt from '@/app/personnel/deliveries/delivery-receipt.module.css';

/**
 * AIR / IAR sheet shown as an overlay on the inspections list — viewing it no
 * longer redirects to the full page. The page stays for direct links/printing.
 * Can be controlled (row click) or render its own trigger button.
 */
export function ViewIarDialog({
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {hideTrigger ? null : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={triggerClassName}
          aria-label={`View AIR / IAR for ${deliveryRef}`}
        >
          View IAR
        </button>
      )}
      <DialogContent
        className={cn(
          "bg-white p-4 sm:max-w-4xl dark:bg-white",
          deliveryReceipt.dialogScroll
        )}
      >
        <DialogHeader className="px-1">
          <DialogTitle>AIR / IAR — {deliveryRef}</DialogTitle>
          <DialogDescription>
            Inspection and Acceptance Report for this delivery.
          </DialogDescription>
        </DialogHeader>
        <div className="flex w-full justify-center">
          <IarReportView
            deliveryParam={deliveryId}
            variant="overlay"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
