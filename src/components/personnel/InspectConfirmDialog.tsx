"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { inspectionHref } from "@/lib/inspection-ref";
import { portalFromPathname } from "@/lib/portal-path";
import styles from "@/app/personnel/dashboard/page.module.css";

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
  arrival,
  arrivalTone = "warn",
  triggerClassName,
  label = "Inspect",
}: {
  deliveryId: string;
  deliveryRef: string;
  supplier?: string | null;
  poReference?: string | null;
  arrival?: string | null;
  /** Matches the deliveries table: amber while upcoming, green once arrived. */
  arrivalTone?: "ok" | "warn";
  triggerClassName?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const href = inspectionHref(deliveryId, "", portalFromPathname(pathname));

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
          <div className="flex items-center justify-between gap-4">
            <dt className="text-navy-600">Target arrival</dt>
            <dd>
              {arrival && arrival !== "—" ? (
                <span className={styles.status} data-tone={arrivalTone}>
                  {arrival}
                </span>
              ) : (
                <span className="font-semibold text-navy-900">—</span>
              )}
            </dd>
          </div>
        </dl>
        <DialogFooter>
          <Link
            href={href}
            aria-label={`Continue to inspection for delivery ${deliveryRef}`}
            className={cn(
              "inline-flex h-6 items-center justify-center rounded-[4px] px-3 text-xs font-semibold",
              "border border-yellow-500 bg-yellow-500 text-navy-900 hover:bg-yellow-400"
            )}
          >
            Continue to inspection
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
