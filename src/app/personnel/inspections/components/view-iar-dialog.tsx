'use client';

import { useState } from 'react';
import { Printer } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { IarReportView } from './iar-report-view';
import { cn } from '@/lib/utils';
import { useDialogPrintMode } from '@/hooks/use-dialog-print-mode';
import deliveryReceipt from '@/app/personnel/deliveries/delivery-receipt.module.css';
import overlay from '@/app/personnel/documents/receipt-overlay.module.css';

/**
 * AIR / IAR sheet shown as an overlay on the inspections list — viewing it no
 * longer redirects to the full page. The page stays for direct links/printing.
 * Can be controlled (row click) or render its own trigger button.
 *
 * Printing from the overlay prints only the official form: while it is open,
 * `useDialogPrintMode` flags the body and this dialog's portal so the print
 * stylesheet hides the app shell and un-clips the sheet.
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

  useDialogPrintMode(open);

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
        data-print-root={open ? 'true' : undefined}
        className={cn(
          "bg-white p-4 sm:max-w-4xl dark:bg-white",
          deliveryReceipt.dialogScroll
        )}
      >
        <div className={cn(overlay.headRow, overlay.headRowPrintable)}>
          <DialogHeader className="px-1">
            <DialogTitle>AIR / IAR — {deliveryRef}</DialogTitle>
            <DialogDescription>
              Inspection and Acceptance Report for this delivery.
            </DialogDescription>
          </DialogHeader>
          <button
            type="button"
            className={overlay.printButton}
            onClick={() => window.print()}
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            Print
          </button>
        </div>
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
