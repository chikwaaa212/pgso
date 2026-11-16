"use client";

import { useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { saveAir } from "@/app/personnel/inspections/actions";
import { CLIENT_CACHE_KEYS, bustClientCache } from "@/lib/client-cache";
import { resourcePrefix } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { portalFromPathname } from "@/lib/portal-path";
import {
  removePendingAir,
  upsertPendingAir,
} from "@/app/personnel/inspections/optimistic-inspections";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label>
        {label}
        {required ? (
          <span className="text-red-600" aria-hidden="true">
            {" "}
            *
          </span>
        ) : null}
      </Label>
      {children}
    </div>
  );
}

function toIso(date: Date | undefined) {
  return date ? date.toISOString().slice(0, 10) : "";
}

export function IarDialog({
  deliveryId,
  deliveryRef,
  hasSavedInspection = false,
  triggerClassName,
  label = "Generate IAR",
}: {
  deliveryId: string;
  deliveryRef: string;
  /** True when the inspection questioning page has been recorded/saved.
   *  Date Inspected + Inspector on the AIR come from that saved record. */
  hasSavedInspection?: boolean;
  /** Optional trigger styling (e.g. compact 24px row actions). */
  triggerClassName?: string;
  /** Optional trigger label (defaults to "Generate IAR"). */
  label?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const today = new Date().toISOString().slice(0, 10);
  const submittingRef = useRef(false);

  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [entity, setEntity] = useState("");
  const [department, setDepartment] = useState("");
  const [rcCode, setRcCode] = useState("");
  const [fundCluster, setFundCluster] = useState("");
  const [iarDate, setIarDate] = useState<Date | undefined>(new Date(today));
  const [invoiceDate, setInvoiceDate] = useState<Date | undefined>(
    new Date(today)
  );

  // Super admins have read-only oversight of inspections.
  if (portalFromPathname(pathname) === "super-admin") return null;

  // IAR No. and Invoice No. are assigned by the system on save.
  const canGenerate =
    hasSavedInspection &&
    entity.trim() !== "" &&
    department.trim() !== "" &&
    iarDate !== undefined &&
    invoiceDate !== undefined;

  function generate() {
    if (!canGenerate || submittingRef.current) return;
    submittingRef.current = true;
    setError("");
    const payload = {
      entity: entity.trim(),
      department: department.trim(),
      rcCode: rcCode.trim(),
      fundCluster: fundCluster.trim(),
      iarNo: "",
      iarDate: toIso(iarDate),
      invoiceNo: "",
      invoiceDate: toIso(invoiceDate),
    };
    // Close + paint the row immediately; the server keeps working behind it.
    upsertPendingAir({
      deliveryId,
      iarNo: "Generating…",
      at: Date.now(),
    });
    setOpen(false);
    window.setTimeout(() => {
      void saveAir(deliveryId, payload)
        .then((res) => {
          if (!res.success) {
            removePendingAir(deliveryId);
            const msg = res.error ?? "Failed to save the AIR. Please try again.";
            toast.error(msg, { duration: 3000, closeButton: true });
            return;
          }
          // AIR changed — drop the cached lists + dashboard + stocks so the
          // next visit refetches instead of serving the pre-AIR payload.
          bustClientCache([
            CLIENT_CACHE_KEYS.inspections,
            CLIENT_CACHE_KEYS.dashboard,
            CLIENT_CACHE_KEYS.inventory,
            CLIENT_CACHE_KEYS.iar,
            resourcePrefix("personnel", "inspections"),
            resourcePrefix("personnel", "inspections-air"),
            resourcePrefix("personnel", "inspections-counts"),
            resourcePrefix("personnel", "dashboard"),
            resourcePrefix("personnel", "inventory"),
            resourcePrefix("personnel", "inventory-stats"),
          ]);
          router.refresh();
          toast.success(
            res.stockWarning
              ? `IAR ${res.iarNo ?? ""} generated. ${res.stockWarning}`
              : `IAR ${res.iarNo ?? ""} generated successfully.`,
            { duration: res.stockWarning ? 5000 : 2000, closeButton: true }
          );
          // Keep the optimistic row a little longer for the refresh to land.
          window.setTimeout(() => removePendingAir(deliveryId), 8000);
        })
        .catch(() => {
          removePendingAir(deliveryId);
          toast.error("Failed to save the AIR. Please try again.", {
            duration: 3000,
            closeButton: true,
          });
        })
        .finally(() => {
          submittingRef.current = false;
        });
    }, 0);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "gap-2 rounded-[4px] px-3.5 text-xs font-semibold",
            triggerClassName ?? "h-8"
          )}
        >
          {label}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Inspection and Acceptance Report</DialogTitle>
          <DialogDescription>
            Fill in the IAR header details for delivery {deliveryRef}. These will
            appear at the top of the printed report.
          </DialogDescription>
        </DialogHeader>

        {!hasSavedInspection ? (
          <div
            role="alert"
            className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          >
            Please save the Record Inspection first before generating the AIR.
            Date Inspected and the Inspection Officer come from the saved
            inspection on the questioning page.
          </div>
        ) : null}

        <div className="grid gap-4 py-1 sm:grid-cols-2">
          <Field label="Entity Name" required>
            <Input
              type="text"
              value={entity}
              onChange={(e) => setEntity(e.target.value)}
              placeholder="e.g. Provincial Government of Sorsogon"
            />
          </Field>

          <Field label="Requisitioning Officer / Department" required>
            <Input
              type="text"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="e.g. Office of the Provincial Engineer"
            />
          </Field>

          <Field label="Responsibility Center Code">
            <Input
              type="text"
              value={rcCode}
              onChange={(e) => setRcCode(e.target.value)}
              placeholder="e.g. 1000-000-00"
            />
          </Field>

          <Field label="Fund Cluster">
            <Input
              type="text"
              value={fundCluster}
              onChange={(e) => setFundCluster(e.target.value)}
              placeholder="e.g. GF-0100"
            />
          </Field>

          <Field label="IAR Date" required>
            <DatePicker
              id="iar-date"
              value={iarDate}
              onChange={setIarDate}
              placeholder="Pick a date"
            />
          </Field>

          <Field label="Invoice Date" required>
            <DatePicker
              id="invoice-date"
              value={invoiceDate}
              onChange={setInvoiceDate}
              placeholder="Pick a date"
            />
          </Field>
        </div>

        <p className="text-xs text-navy-500">
          IAR No. and Invoice No. are generated automatically when you save.
        </p>

        {error ? (
          <p
            role="alert"
            className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            disabled={!canGenerate}
            onClick={generate}
            className={cn(
              "h-6 rounded-[4px] border border-yellow-500 bg-yellow-500 px-3 text-xs font-semibold",
              "text-navy-900 transition-colors hover:bg-yellow-400 disabled:opacity-50"
            )}
          >
            Generate IAR
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}