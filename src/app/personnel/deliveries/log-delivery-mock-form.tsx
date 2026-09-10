"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { useToast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { logDelivery, getDeliveryFormOptions, type DeliveryFormOptions } from "./actions";
import { useMasterData } from "@/hooks/use-master-data";
import type { SignupState } from "@/types";

interface Step1Data {
  assetType: string;
  accountCode: string;
  accountTitle: string;
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

const FALLBACK_UNITS = ["pcs", "box", "set", "ltr", "kg"];

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
    accountTitle: "",
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
    setStep1({ assetType: "", accountCode: "", accountTitle: "" });
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

  const lookupCode = (code: string) =>
    formOptions.codes.find(
      (c) => c.code.toLowerCase() === code.trim().toLowerCase()
    );

  /**
   * Strict mode: Account Code drives Step 1. Picking a code auto-fills asset
   * type + account title from Master Data. Clearing the code clears both —
   * there is no manual entry; unknown codes must be added by Super Admin.
   */
  const handleAccountCodeChange = (value: string) => {
    const hit = lookupCode(value);
    if (hit) {
      setStep1({
        accountCode: value,
        assetType: hit.assetType,
        accountTitle: hit.accountTitle,
      });
    } else {
      setStep1({ assetType: "", accountCode: value, accountTitle: "" });
    }
  };

  const handleAssetTypeChange = (value: string) => {
    // Only reachable when no catalog is loaded (legacy fallback inputs).
    setStep1((prev) => ({ ...prev, assetType: value }));
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
  const [formOptions, setFormOptions] = useState<DeliveryFormOptions>({
    assetTypes: [],
    accountTitles: [],
    codes: [],
  });
  const master = useMasterData();
  const unitOptions = master.loaded && master.units.length > 0 ? master.units : FALLBACK_UNITS;

  useEffect(() => {
    void getDeliveryFormOptions().then(setFormOptions);
  }, []);

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
    !!step1.assetType && !!step1.accountCode && !!step1.accountTitle;
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

  const renderStep1 = () => {
    const matchedCode = lookupCode(step1.accountCode);
    const isAutoFilled = !!matchedCode;
    // Strict mode: type + title are display-only whenever the catalog is
    // loaded — they always come from the picked code.
    const catalogMode = formOptions.codes.length > 0;
    const locked = isAutoFilled || catalogMode;

    return (
      <div className="flex flex-col gap-3">
        <div>
          <Label htmlFor="account-code" className="mb-1 block text-sm font-medium">
            Account Code <span className="font-normal text-navy-500">(start here)</span>
          </Label>
          {catalogMode ? (
            <Select
              value={isAutoFilled ? matchedCode.code : ""}
              onValueChange={handleAccountCodeChange}
            >
              <SelectTrigger id="account-code" className="w-full">
                <SelectValue placeholder="Select account code" />
              </SelectTrigger>
              <SelectContent>
                {formOptions.codes.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.code}
                    {c.accountTitle ? ` — ${c.accountTitle}` : c.assetType ? ` — ${c.assetType}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id="account-code"
              name="accountCode"
              value={step1.accountCode}
              onChange={(e) => handleAccountCodeChange(e.target.value)}
              placeholder="e.g. 1-06-05-020"
              autoFocus
            />
          )}
          {step1.accountCode.trim() === "" ? (
            <p className="mt-1 text-xs text-navy-500">
              Start by picking the account code — asset type and account title
              fill in automatically.
            </p>
          ) : isAutoFilled ? (
            <p className="mt-1 text-xs font-medium text-emerald-700">
              Known code — asset type and account title filled in automatically.
            </p>
          ) : (
            <p className="mt-1 text-xs text-amber-700">
              Unknown code — ask your Super Admin to add it to Master Data.
            </p>
          )}
        </div>
        <div>
          <Label htmlFor="asset-type" className="mb-1 block text-sm font-medium">
            Asset Type
            {isAutoFilled && (
              <span className="ml-1 font-normal text-emerald-700">(auto-filled)</span>
            )}
          </Label>
          {formOptions.assetTypes.length > 0 ? (
            <Select
              value={step1.assetType}
              onValueChange={handleAssetTypeChange}
              disabled={locked}
            >
              <SelectTrigger
                id="asset-type"
                className="w-full disabled:cursor-not-allowed disabled:opacity-70"
              >
                <SelectValue
                  placeholder={
                    isAutoFilled ? "Auto-filled from code" : "Select asset type"
                  }
                />
              </SelectTrigger>
                <SelectContent>
                  {(isAutoFilled && matchedCode
                    ? [matchedCode.assetType]
                    : formOptions.assetTypes
                  ).map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
            </Select>
          ) : (
            <Input
              id="asset-type"
              name="assetType"
              value={step1.assetType}
              onChange={(e) => handleAssetTypeChange(e.target.value)}
              placeholder={
                isAutoFilled ? "Auto-filled from code" : "e.g. Machinery and Equipment"
              }
              disabled={locked}
            />
          )}
        </div>
        <div>
          <Label htmlFor="account-title" className="mb-1 block text-sm font-medium">
            Account Title
            {isAutoFilled && (
              <span className="ml-1 font-normal text-emerald-700">(auto-filled)</span>
            )}
          </Label>
          {formOptions.accountTitles.length > 0 ? (
            <Select
              value={step1.accountTitle}
              onValueChange={(v) => handleStep1Change("accountTitle", v)}
              disabled={locked}
            >
              <SelectTrigger
                id="account-title"
                className="w-full disabled:cursor-not-allowed disabled:opacity-70"
              >
                <SelectValue
                  placeholder={
                    isAutoFilled ? "Auto-filled from code" : "Select account title"
                  }
                />
              </SelectTrigger>
                <SelectContent>
                  {(isAutoFilled && matchedCode
                    ? [matchedCode.accountTitle]
                    : formOptions.accountTitles
                  ).map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
            </Select>
          ) : (
            <Input
              id="account-title"
              name="accountTitle"
              value={step1.accountTitle}
              onChange={(e) => handleStep1Change("accountTitle", e.target.value)}
              placeholder={
                isAutoFilled ? "Auto-filled from code" : "e.g. OFFICE EQUIPMENT"
              }
              disabled={locked}
            />
          )}
        </div>
        {isAutoFilled && (
          <p className="text-xs text-navy-500">
            Showing {matchedCode?.assetType} • {matchedCode?.accountTitle}. To use a
            different type/title, change or clear the account code above.
          </p>
        )}
      </div>
    );
  };

  const renderStep2 = () => (
    <div className="flex flex-col gap-3">
      <div>
        <Label htmlFor="date-supplied" className="mb-1 block text-sm font-medium">
          Date Received
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
          Supplier/Payee
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
                  htmlFor={`item-article-${item.id}`}
                  className="mb-1 block text-sm font-medium"
                >
                  Article
                </Label>
                <Input
                  id={`item-article-${item.id}`}
                  value={item.description}
                  onChange={(e) =>
                    handleItemChange(item.id, "description", e.target.value)
                  }
                  placeholder="Article name"
                />
              </div>
              <div className="w-20">
                <Label
                  htmlFor={`item-qty-${item.id}`}
                  className="mb-1 block text-sm font-medium"
                >
                  Qty.
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
                  Unit
                </Label>
                <Select
                  value={item.units}
                  onValueChange={(v) => handleItemChange(item.id, "units", v)}
                >
                  <SelectTrigger id={`item-units-${item.id}`} className="w-full">
                    <SelectValue placeholder="Unit" />
                  </SelectTrigger>
                  <SelectContent>
                    {unitOptions.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
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
                className="mb-[0.25rem] p-1 text-sm font-medium text-red-600 hover:text-red-800 hover:underline"
                aria-label="Remove item"
              >
                Remove
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
      <input type="hidden" name="accountTitle" value={step1.accountTitle} />
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
