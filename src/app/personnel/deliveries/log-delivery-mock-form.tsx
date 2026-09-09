"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { useToast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { logDelivery } from "./actions";
import type { SignupState } from "@/types";

interface Step1Data {
  assetType: string;
  accountCode: string;
  accountType: string;
}

interface Step2Data {
  dateSupplied: Date | undefined;
  supplierName: string;
  poReference: string;
  deliveryStatus: string;
}

interface ItemRow {
  id: string;
  description: string;
  units: string;
  quantity: string;
  unitCost: string;
}

interface RecipientData {
  recipientRole: string;
  recipientName: string;
}

interface Step3Data {
  items: ItemRow[];
}

interface PreviewData extends Step1Data, Step2Data, RecipientData, Step3Data {}

export type { PreviewData };

const STEPS = ["Asset Details", "Delivery Details", "Recipient", "Items Delivered"];

function StepperNav({ currentStep }: { currentStep: number }) {
  return (
    <nav aria-label="Progress" className="mb-4">
      <ol role="list" className="flex items-center justify-between">
        {STEPS.map((label, index) => {
          const stepNum = index + 1;
          const isActive = currentStep === stepNum;
          const isComplete = currentStep > stepNum;
          const base = "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-medium transition-colors";
          return (
            <li key={stepNum} className="flex-1">
              <div className="flex items-center justify-center">
                <span
                  className={cn(
                    base,
                    isComplete
                      ? "border-yellow-500 bg-yellow-500 text-navy-900"
                      : isActive
                        ? "border-yellow-500 bg-yellow-500 text-navy-900"
                        : "border-navy-300 bg-white text-navy-500"
                  )}
                >
                  {stepNum}
                </span>
                <span className="ml-2 text-sm font-medium text-navy-600 hidden sm:inline">
                  {label}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function useLogDeliveryDraft() {
  const [step, setStep] = useState(1);
  const [step1, setStep1] = useState<Step1Data>({
    assetType: "",
    accountCode: "",
    accountType: "",
  });
  const [step2, setStep2] = useState<Step2Data>({
    dateSupplied: undefined,
    supplierName: "",
    poReference: "",
    deliveryStatus: "Complete",
  });
  const [recipient, setRecipient] = useState<RecipientData>({
    recipientRole: "",
    recipientName: "",
  });
  const [step3, setStep3] = useState<Step3Data>({ items: [] });

  const reset = () => {
    setStep1({ assetType: "", accountCode: "", accountType: "" });
    setStep2({
      dateSupplied: undefined,
      supplierName: "",
      poReference: "",
      deliveryStatus: "Complete",
    });
    setRecipient({ recipientRole: "", recipientName: "" });
    setStep3({ items: [] });
    setStep(1);
  };

  return {
    step,
    setStep,
    step1,
    setStep1,
    step2,
    setStep2,
    recipient,
    setRecipient,
    step3,
    setStep3,
    reset,
  };
}

export type LogDeliveryDraft = ReturnType<typeof useLogDeliveryDraft>;

export interface SavedDelivery {
  data: PreviewData;
  deliveryId: string;
}

export function LogDeliveryMockForm({
  draft,
  onShowPreview,
  onClose,
}: {
  draft: LogDeliveryDraft;
  onShowPreview: (show: boolean) => void;
  onClose: () => void;
}) {
  const {
    step,
    setStep,
    step1,
    setStep1,
    step2,
    setStep2,
    recipient,
    setRecipient,
    step3,
    setStep3,
    reset,
  } = draft;

  const handleStep1Change = (field: keyof Step1Data, value: string) => {
    setStep1((prev) => ({ ...prev, [field]: value }));
  };

  const handleStep2Change = (field: keyof Step2Data, value: Date | string | undefined) => {
    setStep2((prev) => ({ ...prev, [field]: value }));
  };

  const handleRecipientChange = (field: keyof RecipientData, value: string) => {
    setRecipient((prev) => ({ ...prev, [field]: value }));
  };

  const handleItemChange = (id: string, field: keyof ItemRow, value: string) => {
    setStep3((prev) => ({
      items: prev.items.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      ),
    }));
  };

  const addItem = () => {
    setStep3((prev) => ({
      items: [
        ...prev.items,
        { id: crypto.randomUUID(), description: "", units: "", quantity: "", unitCost: "" },
      ],
    }));
  };

  const removeItem = (id: string) => {
    setStep3((prev) => ({ items: prev.items.filter((item) => item.id !== id) }));
  };

  const resetForm = () => {
    reset();
    setIdempotencyKey(crypto.randomUUID());
  };

  const { toast } = useToast();

  const [actionState, formAction] = useActionState<SignupState, FormData>(
    logDelivery,
    { success: false, error: undefined }
  );
  const lastSavedId = useRef<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    if (
      actionState.success &&
      actionState.deliveryId &&
      lastSavedId.current !== actionState.deliveryId
    ) {
      lastSavedId.current = actionState.deliveryId;
      setIdempotencyKey(crypto.randomUUID());
      toast({
        title: "Delivery saved",
        description: "The delivery entry has been saved to the database.",
        variant: "success",
      });
      onClose();
    }
    if (actionState?.error) {
      setIdempotencyKey(crypto.randomUUID());
      toast({
        title: "Save failed",
        description: actionState.error,
        variant: "error",
      });
    }
  }, [actionState, toast, onClose]);

  const isStep1Valid =
    !!step1.assetType && !!step1.accountCode && !!step1.accountType;
  const isStep2Valid =
    !!step2.dateSupplied && !!step2.supplierName && !!step2.poReference;
  const isRecipientValid = !!recipient.recipientRole;
  const isStep3Valid = step3.items.length > 0;

  const canGoNext =
    step === 1
      ? !!isStep1Valid
      : step === 2
        ? !!isStep2Valid
        : step === 3
          ? !!isRecipientValid
          : true;

  const handleNext = () => setStep((s) => Math.min(s + 1, 4));
  const handleBack = () => setStep((s) => Math.max(s - 1, 1));

  const renderStep1 = () => (
    <div className="flex flex-col gap-3">
      <div>
        <Label htmlFor="asset-type" className="mb-1 block text-sm font-medium">
          Asset Type
        </Label>
        <Select
          value={step1.assetType}
          onValueChange={(v) => handleStep1Change("assetType", v)}
        >
          <SelectTrigger id="asset-type" className="w-full">
            <SelectValue placeholder="Select asset type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="IT">IT Equipment</SelectItem>
            <SelectItem value="FS">Furniture &amp; Supplies</SelectItem>
            <SelectItem value="HV">Vehicle</SelectItem>
            <SelectItem value="OT">Office Equipment</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="account-code" className="mb-1 block text-sm font-medium">
          Account Code
        </Label>
        <Input
          id="account-code"
          name="accountCode"
          value={step1.accountCode}
          onChange={(e) => handleStep1Change("accountCode", e.target.value)}
          placeholder="e.g. A-001-B"
        />
      </div>
      <div>
        <Label htmlFor="account-type" className="mb-1 block text-sm font-medium">
          Account Type
        </Label>
        <Select
          value={step1.accountType}
          onValueChange={(v) => handleStep1Change("accountType", v)}
        >
          <SelectTrigger id="account-type" className="w-full">
            <SelectValue placeholder="Select account type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="capital">Capital</SelectItem>
            <SelectItem value="operational">Operational</SelectItem>
            <SelectItem value="administrative">Administrative</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="flex flex-col gap-3">
      <div>
        <Label htmlFor="date-supplied" className="mb-1 block text-sm font-medium">
          Date Supplied
        </Label>
        <DatePicker
          id="date-supplied"
          value={step2.dateSupplied}
          onChange={(d) => handleStep2Change("dateSupplied", d)}
          placeholder="Pick a date"
        />
      </div>
      <div>
        <Label htmlFor="supplier-name" className="mb-1 block text-sm font-medium">
          Supplier Name
        </Label>
        <Input
          id="supplier-name"
          name="supplierName"
          value={step2.supplierName}
          onChange={(e) => handleStep2Change("supplierName", e.target.value)}
          placeholder="e.g. Acme Office Supply"
        />
      </div>
      <div>
        <Label htmlFor="po-reference" className="mb-1 block text-sm font-medium">
          PO Reference
        </Label>
        <Input
          id="po-reference"
          name="poReference"
          value={step2.poReference}
          onChange={(e) => handleStep2Change("poReference", e.target.value)}
          placeholder="e.g. PO-2026-081"
        />
      </div>
      <div>
        <Label htmlFor="delivery-status" className="mb-1 block text-sm font-medium">
          Status
        </Label>
        <Select
          value={step2.deliveryStatus}
          onValueChange={(v) => handleStep2Change("deliveryStatus", v)}
        >
          <SelectTrigger id="delivery-status" className="w-full">
            <SelectValue placeholder="Select status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Complete">Complete</SelectItem>
            <SelectItem value="Partial">Partial</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  const renderRecipient = () => (
    <div className="flex flex-col gap-3">
      <div>
        <Label htmlFor="recipient-role" className="mb-1 block text-sm font-medium">
          Received By (Role)
        </Label>
        <Select
          value={recipient.recipientRole}
          onValueChange={(v) => handleRecipientChange("recipientRole", v)}
        >
          <SelectTrigger id="recipient-role" className="w-full">
            <SelectValue placeholder="Select who receives the delivery" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Employee">Employee</SelectItem>
            <SelectItem value="PGSO Personnel">PGSO Personnel</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="recipient-name" className="mb-1 block text-sm font-medium">
          Name <span className="font-normal text-navy-500">(optional)</span>
        </Label>
        <Input
          id="recipient-name"
          name="recipientName"
          value={recipient.recipientName}
          onChange={(e) => handleRecipientChange("recipientName", e.target.value)}
          placeholder="e.g. Juan Dela Cruz"
        />
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="flex flex-col gap-3">
      {step3.items.length === 0 ? (
        <p className="text-sm text-navy-500">
          No items added. Click &ldquo;Add item&rdquo; to get started.
        </p>
      ) : (
        <div className="space-y-3">
          {step3.items.map((item) => (
            <div key={item.id} className="flex items-end gap-2">
              <div className="flex-1">
                <Label
                  htmlFor={`item-desc-${item.id}`}
                  className="mb-1 block text-sm font-medium"
                >
                  Description
                </Label>
                <Input
                  id={`item-desc-${item.id}`}
                  value={item.description}
                  onChange={(e) =>
                    handleItemChange(item.id, "description", e.target.value)
                  }
                  placeholder="Item description"
                />
              </div>
              <div className="w-20">
                <Label
                  htmlFor={`item-qty-${item.id}`}
                  className="mb-1 block text-sm font-medium"
                >
                  Quantity
                </Label>
                <Input
                  id={`item-qty-${item.id}`}
                  type="number"
                  value={item.quantity}
                  onChange={(e) =>
                    handleItemChange(item.id, "quantity", e.target.value)
                  }
                  placeholder="Qty"
                />
              </div>
              <div className="w-24">
                <Label
                  htmlFor={`item-units-${item.id}`}
                  className="mb-1 block text-sm font-medium"
                >
                  Units
                </Label>
                <Select
                  value={item.units}
                  onValueChange={(v) => handleItemChange(item.id, "units", v)}
                >
                  <SelectTrigger id={`item-units-${item.id}`} className="w-full">
                    <SelectValue placeholder="Unit" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pcs">Pieces (pcs)</SelectItem>
                    <SelectItem value="box">Box</SelectItem>
                    <SelectItem value="set">Set</SelectItem>
                    <SelectItem value="ltr">Litre</SelectItem>
                    <SelectItem value="kg">Kilogram</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="w-24">
                <Label
                  htmlFor={`item-cost-${item.id}`}
                  className="mb-1 block text-sm font-medium"
                >
                  Unit Cost
                </Label>
                <Input
                  id={`item-cost-${item.id}`}
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.unitCost}
                  onChange={(e) =>
                    handleItemChange(item.id, "unitCost", e.target.value)
                  }
                  placeholder="0.00"
                />
              </div>
              <button
                type="button"
                onClick={() => removeItem(item.id)}
                className="mb-[0.25rem] p-1 text-red-600 hover:text-red-800"
                aria-label="Remove item"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={addItem}
        className={cn(
          "inline-flex items-center justify-center rounded-full font-medium",
          "focus-visible:outline-2 focus-visible:outline-offset-2",
          "disabled:pointer-events-none disabled:opacity-50",
          "h-10 px-4 text-sm",
          "border border-navy-200 bg-transparent text-navy-700 hover:bg-navy-100"
        )}
      >
        <Plus className="mr-1 h-4 w-4" />
        Add item delivery
      </button>
    </div>
  );

  const renderStep = () => {
    if (step === 1) return renderStep1();
    if (step === 2) return renderStep2();
    if (step === 3) return renderRecipient();
    return renderStep3();
  };

  return (
    <form action={formAction}>
      <input type="hidden" name="assetType" value={step1.assetType} />
      <input type="hidden" name="accountCode" value={step1.accountCode} />
      <input type="hidden" name="accountType" value={step1.accountType} />
      <input
        type="hidden"
        name="dateSupplied"
        value={step2.dateSupplied ? step2.dateSupplied.toISOString() : ""}
      />
      <input type="hidden" name="supplierName" value={step2.supplierName} />
      <input type="hidden" name="poReference" value={step2.poReference} />
      <input type="hidden" name="deliveryStatus" value={step2.deliveryStatus} />
      <input type="hidden" name="recipientRole" value={recipient.recipientRole} />
      <input type="hidden" name="recipientName" value={recipient.recipientName} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <input type="hidden" name="itemsJson" value={JSON.stringify(step3.items)} />

      <StepperNav currentStep={step} />

      <div className="min-h-[180px]">{renderStep()}</div>

      {actionState?.error && (
        <p className="mt-3 text-sm font-medium text-red-600">{actionState.error}</p>
      )}

      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={handleBack}
          disabled={step === 1}
          className={cn(
            "inline-flex items-center justify-center rounded-full font-medium",
            "focus-visible:outline-2 focus-visible:outline-offset-2",
            "disabled:pointer-events-none disabled:opacity-50",
            "h-10 px-4 text-sm",
            "border border-navy-200 bg-transparent text-navy-700 hover:bg-navy-100"
          )}
        >
          Back
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={resetForm}
            className={cn(
              "inline-flex items-center justify-center rounded-full font-medium",
              "focus-visible:outline-2 focus-visible:outline-offset-2",
              "disabled:pointer-events-none disabled:opacity-50",
              "h-10 px-4 text-sm",
              "border border-navy-200 bg-transparent text-navy-700 hover:bg-navy-100"
            )}
          >
            Reset
          </button>
          {step === 4 ? (
            <>
              <button
                type="button"
                onClick={() => onShowPreview(true)}
                className={cn(
                  "inline-flex items-center justify-center rounded-full font-medium",
                  "focus-visible:outline-2 focus-visible:outline-offset-2",
                  "disabled:pointer-events-none disabled:opacity-50",
                  "h-10 px-4 text-sm",
                  "border border-navy-200 bg-transparent text-navy-700 hover:bg-navy-100"
                )}
              >
                Preview Entry
              </button>
              <SubmitButton variant="primary" disabled={!isStep3Valid} pendingLabel="Saving…">
                Save delivery
              </SubmitButton>
            </>
          ) : (
            <button
              type="button"
              onClick={handleNext}
              disabled={!canGoNext}
              className={cn(
                "inline-flex items-center justify-center rounded-full font-medium",
                "focus-visible:outline-2 focus-visible:outline-offset-2",
                "disabled:pointer-events-none disabled:opacity-50",
                "h-10 px-4 text-sm",
                "bg-navy-900 text-white hover:bg-navy-800"
              )}
            >
              Next
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
