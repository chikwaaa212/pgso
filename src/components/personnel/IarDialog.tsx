"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2 } from "lucide-react";
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
}: {
  deliveryId: string;
  deliveryRef: string;
  /** True when the inspection questioning page has been recorded/saved.
   *  Date Inspected + Inspector on the AIR come from that saved record. */
  hasSavedInspection?: boolean;
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [savedRecordId, setSavedRecordId] = useState("");
  const [entity, setEntity] = useState("");
  const [department, setDepartment] = useState("");
  const [rcCode, setRcCode] = useState("");
  const [fundCluster, setFundCluster] = useState("");
  const [iarNo, setIarNo] = useState("");
  const [iarDate, setIarDate] = useState<Date | undefined>(new Date(today));
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState<Date | undefined>(
    new Date(today)
  );

  const canGenerate =
    hasSavedInspection &&
    entity.trim() !== "" &&
    department.trim() !== "" &&
    iarNo.trim() !== "" &&
    iarDate !== undefined &&
    invoiceDate !== undefined;

  function generate() {
    if (!canGenerate || saving) return;
    setSaving(true);
    setError("");
    setWarning("");
    setSavedRecordId("");
    void saveAir(deliveryId, {
      entity: entity.trim(),
      department: department.trim(),
      rcCode: rcCode.trim(),
      fundCluster: fundCluster.trim(),
      iarNo: iarNo.trim(),
      iarDate: toIso(iarDate),
      invoiceNo: invoiceNo.trim(),
      invoiceDate: toIso(invoiceDate),
    }).then((res) => {
      setSaving(false);
      if (!res.success) {
        setError(res.error ?? "Failed to save the AIR. Please try again.");
        return;
      }
      const href = res.recordId
        ? `/personnel/inspections/${deliveryId}/iar?record=${res.recordId}`
        : `/personnel/inspections/${deliveryId}/iar`;
      if (res.stockWarning) {
        // AIR is saved — stay and show the warning with a way through.
        setWarning(res.stockWarning);
        setSavedRecordId(href);
        return;
      }
      router.push(href);
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="gap-2">
          <FileText className="h-4 w-4" />
          Generate IAR
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

          <Field label="IAR No." required>
            <Input
              type="text"
              value={iarNo}
              onChange={(e) => setIarNo(e.target.value)}
              placeholder="e.g. IAR-2026-001"
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

          <Field label="Invoice No.">
            <Input
              type="text"
              value={invoiceNo}
              onChange={(e) => setInvoiceNo(e.target.value)}
              placeholder="e.g. INV-2026-015"
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

        {error ? (
          <p
            role="alert"
            className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            {error}
          </p>
        ) : null}

        {warning ? (
          <div
            role="alert"
            className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          >
            <p>{warning}</p>
            {savedRecordId ? (
              <Button
                type="button"
                className="mt-2"
                onClick={() => {
                  router.push(savedRecordId);
                  setOpen(false);
                }}
              >
                View IAR anyway
              </Button>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canGenerate || saving}
            onClick={generate}
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Generate IAR"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}