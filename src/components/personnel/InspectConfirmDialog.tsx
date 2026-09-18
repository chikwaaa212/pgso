"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Confirmation gate before opening the inspection form.
 * The trigger looks exactly like the table's Inspect link; clicking it
 * opens a shadcn Dialog summary first — navigation only happens on
 * "Continue to inspection".
 */
export function InspectConfirmButton({
  deliveryId,
  deliveryRef,
  supplier,
  poReference,
  triggerClassName,
  label = "Inspect",
}: {
  deliveryId: string;
  deliveryRef: string;
  supplier?: string | null;
  poReference?: string | null;
  triggerClassName?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const href = `/personnel/inspections/${deliveryId}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        className={triggerClassName}
        onClick={() => setOpen(true)}
        aria-label={`${label} delivery ${deliveryRef}`}
      >
        {label}
      </button>
      <DialogContent className="bg-white sm:max-w-md dark:bg-white">
        <DialogHeader>
          <DialogTitle>Start inspection?</DialogTitle>
          <DialogDescription>
            Review the delivery below, then continue to the inspection form.
          </DialogDescription>
        </DialogHeader>
        <dl className="flex flex-col gap-1.5 rounded-md border border-navy-200 bg-navy-100/50 px-4 py-3 text-sm">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-navy-600">Delivery ref</dt>
            <dd className="font-mono font-semibold text-navy-900">
              {deliveryRef}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-navy-600">Supplier</dt>
            <dd className="font-semibold text-navy-900">
              {supplier ?? "—"}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-navy-600">PO ref</dt>
            <dd className="font-semibold text-navy-900">
              {poReference ?? "—"}
            </dd>
          </div>
        </dl>
        <DialogFooter>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className={cn(
              "inline-flex h-8 items-center justify-center rounded-[4px] px-3.5 text-xs font-semibold",
              "border border-navy-200 bg-transparent text-navy-700 hover:bg-navy-100"
            )}
          >
            Cancel
          </button>
          <Link
            href={href}
            aria-label={`Continue to inspection for delivery ${deliveryRef}`}
            className={cn(
              "inline-flex h-8 items-center justify-center rounded-[4px] px-3.5 text-xs font-semibold",
              "border border-navy-700 bg-navy-800 text-white hover:bg-navy-700"
            )}
          >
            Continue to inspection
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
