"use client";

import { useEffect } from "react";
import { Printer } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import overlay from "./receipt-overlay.module.css";

/**
 * Shared document-preview dialog.
 *
 * `printable` adds a Print button and a page-scoped print mode: while the
 * overlay is open the body carries `data-print-active`, so the print
 * stylesheet can hide the app chrome + dialog shell and print only the
 * official form (PAR / ICS / IAR) at full page width.
 */
export function ReceiptOverlay({
  open,
  title,
  onClose,
  printable = false,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  printable?: boolean;
  children: React.ReactNode;
}) {
  // Flag the document so print CSS can scope itself to this overlay.
  // Radix portals the dialog straight into <body>; marking its wrapper lets
  // the print stylesheet hide every other body child without relying on
  // `:has()` support in the print engine.
  useEffect(() => {
    if (!open || !printable) return;
    const root = document.querySelector('[data-print-root="true"]');
    const portal = root?.parentElement ?? null;
    document.body.dataset.printActive = "true";
    portal?.setAttribute("data-print-portal", "true");
    return () => {
      delete document.body.dataset.printActive;
      portal?.removeAttribute("data-print-portal");
    };
  }, [open, printable]);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent
        data-print-root={printable ? "true" : undefined}
        className={`${overlay.overlayContent} w-full sm:max-w-5xl`}
      >
        <div
          className={`${overlay.headRow} ${
            printable ? overlay.headRowPrintable : ""
          }`}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          {printable ? (
            <button
              type="button"
              className={overlay.printButton}
              onClick={() => window.print()}
            >
              <Printer className="h-4 w-4" aria-hidden="true" />
              Print
            </button>
          ) : null}
        </div>
        {children}
      </DialogContent>
    </Dialog>
  );
}
