"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toaster";
import { CLIENT_CACHE_KEYS, bustClientCache } from "@/lib/client-cache";
import { resourcePrefix } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { logDelivery, updateDelivery, getDeliveryFormOptions, getPersonnelRecipients, generateAccountCode, type DeliveryFormOptions, type DeliveryDetails, type PersonnelRecipient } from "./actions";
import {
  addPendingDelivery,
  confirmPendingDelivery,
  removePendingDelivery,
  removePendingDeliveryEdit,
  upsertPendingDeliveryEdit,
} from "./optimistic-deliveries";
import { useMasterData } from "@/hooks/use-master-data";
import type { SignupState } from "@/types";

interface Step1Data {
  deliveryKind: string;
  assetType: string;
  stockType: string;
  accountCode: string;
  accountTitle: string;
}

interface Step2Data {
  dateSupplied: Date | undefined;
  expectedArrival: Date | undefined;
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

const FALLBACK_UNITS = ["pcs", "box", "set", "ltr", "kg"];

/** Calendar day as YYYY-MM-DD (local). Delivery dates are date-only columns
 * (`@db.Date`), so sending a full ISO timestamp shifts them a day west of
 * midnight in Manila.
 */
function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** YYYY-MM-DD → local Date for the picker (no UTC midnight shift). */
function fromDateKey(value: string | null): Date | undefined {
  if (!value) return undefined;
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

/** Read-only arrival date shown in the log form (today's calendar day). */
function formatArrivalDate(date: Date | undefined): string {
  const value = date ?? new Date();
  return value.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** System-generated PO reference: PGSO-XXXX-XXXX (no personnel input). */
function makePoReference(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const block = () =>
    Array.from(
      { length: 4 },
      () => chars[Math.floor(Math.random() * chars.length)]
    ).join("");
  return `PGSO-${block()}-${block()}`;
}

function StepperNav({ currentStep, deliveryKind }: { currentStep: number; deliveryKind: string }) {
  const steps = [
    deliveryKind === "stock" ? "Stock Details" : "Asset Details",
    "Delivery Details",
    "Recipient",
    "Items Delivered",
  ];
  return (
    <nav aria-label="Progress" className="mb-4">
      <ol role="list" className="flex items-center justify-between">
        {steps.map((label, index) => {
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
    deliveryKind: "",
    assetType: "",
    stockType: "",
    accountCode: "",
    accountTitle: "",
  });
  const [step2, setStep2] = useState<Step2Data>(() => ({
    dateSupplied: undefined,
    expectedArrival: new Date(),
    supplierName: "",
    poReference: makePoReference(),
    deliveryStatus: "Arrival",
  }));
  const [recipient, setRecipient] = useState<RecipientData>({
    recipientRole: "",
    recipientName: "",
  });
  const [step3, setStep3] = useState<Step3Data>({ items: [] });

  const reset = () => {
    setStep1({ deliveryKind: "", assetType: "", stockType: "", accountCode: "", accountTitle: "" });
    setStep2({
      dateSupplied: undefined,
      expectedArrival: new Date(),
      supplierName: "",
      poReference: makePoReference(),
      deliveryStatus: "Arrival",
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

/**
 * Seed the log stepper with an existing (pending) delivery. Used by Edit so
 * the user lands on a fully populated form instead of re-typing the record.
 */
export function hydrateDeliveryDraft(
  draft: LogDeliveryDraft,
  delivery: DeliveryDetails
) {
  draft.setStep1({
    deliveryKind: delivery.delivery_kind ?? "",
    assetType: delivery.asset_type ?? "",
    stockType: delivery.stock_type ?? "",
    accountCode: delivery.account_code ?? "",
    accountTitle: delivery.account_title ?? "",
  });
  draft.setStep2({
    dateSupplied: fromDateKey(delivery.date_delivered),
    expectedArrival: fromDateKey(delivery.expected_arrival_date) ?? new Date(),
    supplierName: delivery.supplier ?? "",
    poReference: delivery.po_reference ?? "",
    deliveryStatus: "Arrival",
  });
  draft.setRecipient({
    recipientRole: delivery.recipient_role ?? "PGSO Personnel",
    recipientName: delivery.recipient_name ?? "",
  });
  draft.setStep3({
    items: delivery.items.map((item) => ({
      id: item.id,
      description: item.item_name,
      units: item.unit ?? "",
      quantity: String(item.quantity),
      unitCost: item.unit_cost != null ? String(item.unit_cost) : "",
    })),
  });
  draft.setStep(1);
}

export interface SavedDelivery {
  data: PreviewData;
  deliveryId: string;
}

export function LogDeliveryMockForm({
  draft,
  editDeliveryId,
  onShowPreview,
  onClose,
  onReopen,
}: {
  draft: LogDeliveryDraft;
  /** When set, the stepper edits this pending delivery instead of creating one. */
  editDeliveryId?: string;
  onShowPreview: (show: boolean) => void;
  onClose: () => void;
  /** Reopen after a failed background save (draft is untouched). */
  onReopen: () => void;
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

  const [formOptions, setFormOptions] = useState<DeliveryFormOptions>({
    assetTypes: [],
    stockHeaders: [],
    accountTitles: [],
    codes: [],
    accountTitleTypes: {},
  });
  const [recipients, setRecipients] = useState<PersonnelRecipient[]>([]);

  /** Switching kinds clears the detail fields and allocates that kind's code. */
  const handleDeliveryKindChange = (value: string) => {
    setStep1((prev) =>
      prev.deliveryKind === value
        ? prev
        : {
            deliveryKind: value,
            assetType: "",
            stockType: "",
            accountCode: "",
            accountTitle: "",
          }
    );
    // Edits keep their stored system code — never re-allocate on an edit.
    if (editDeliveryId) return;
    void previewAccountCode(value);
  };

  /**
   * Account codes are system-owned: AST-xxx-xx-xx for assets, STK-xxx-xx-xx
   * for stocks. The form shows the next code and refuses typed input; the
   * server allocates the authority value again on save.
   */
  const [generatingCode, setGeneratingCode] = useState(false);
  // Only the latest request may write the code, so quickly toggling kinds
  // never leaves a stale (previous kind's) code behind.
  const codeRequestRef = useRef(0);
  const previewAccountCode = async (kind: string) => {
    const requestId = ++codeRequestRef.current;
    setGeneratingCode(true);
    const res = await generateAccountCode(kind === "stock" ? "stock" : "asset").catch(
      () => ({ error: "Could not reach the server — try again." })
    );
    if (requestId !== codeRequestRef.current) return;
    setGeneratingCode(false);
    if ("error" in res) {
      toast({ title: "Could not generate a code", description: res.error, variant: "error" });
      return;
    }
    setStep1((prev) => ({ ...prev, accountCode: res.code }));
  };

  const assetTypesForTitle = (title: string): string[] => {
    const key = title.trim().toUpperCase();
    if (!key) return [];
    const mapped = formOptions.accountTitleTypes?.[key];
    if (mapped && mapped.length > 0) return mapped;
    // Fallback for an older cached options payload without the title map.
    return [
      ...new Set(
        formOptions.codes
          .filter((c) => c.accountTitle.trim().toUpperCase() === key)
          .map((c) => c.assetType)
          .filter(Boolean)
      ),
    ];
  };

  /**
   * Picking an account title drives Asset Type (auto-filled from the catalog
   * row). The account code is independent of the title (system AST/STK).
   */
  const handleAccountTitleChange = (value: string) => {
    const derived = assetTypesForTitle(value);
    const assetType = derived.length > 0 ? derived[0] : "";
    setStep1((prev) => ({
      ...prev,
      accountTitle: value,
      assetType,
    }));
  };

  /** Choosing an asset type narrows the catalog row shown on the receipt. */
  const handleAssetTypeChange = (value: string) => {
    setStep1((prev) => ({
      ...prev,
      assetType: value,
    }));
  };

  /**
   * Stocks: title + type come from one Master Data stock header. Picking a
   * title fills the header's title/type; the code is system-generated.
   */
  const handleStockTypeChange = (value: string) => {
    setStep1((prev) => {
      const titleMatches = formOptions.stockHeaders.some(
        (h) =>
          h.title.trim().toUpperCase() === prev.accountTitle.trim().toUpperCase() &&
          h.type.trim().toLowerCase() === value.trim().toLowerCase()
      );
      return titleMatches
        ? { ...prev, stockType: value }
        : { ...prev, stockType: value, accountTitle: "" };
    });
  };

  const handleStockTitleChange = (title: string) => {
    const header =
      formOptions.stockHeaders.find(
        (h) =>
          h.title.trim().toUpperCase() === title.trim().toUpperCase() &&
          (!step1.stockType ||
            h.type.trim().toLowerCase() === step1.stockType.trim().toLowerCase())
      ) ??
      formOptions.stockHeaders.find(
        (h) => h.title.trim().toUpperCase() === title.trim().toUpperCase()
      );
    if (!header) return;
    setStep1((prev) => ({
      ...prev,
      accountTitle: header.title,
      stockType: header.type,
      assetType: "",
    }));
  };

  const handleStep2Change = (field: keyof Step2Data, value: Date | string | undefined) => {
    setStep2((prev) => ({ ...prev, [field]: value }));
  };

  /** Recipient is a live PGSO personnel account — the role is implied. */
  const handleRecipientChange = (name: string) => {
    setRecipient({ recipientRole: "PGSO Personnel", recipientName: name });
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
        { id: crypto.randomUUID(), description: "", units: "", quantity: "1", unitCost: "" },
      ],
    }));
  };

  const removeItem = (id: string) => {
    setStep3((prev) => ({ items: prev.items.filter((item) => item.id !== id) }));
  };

  const resetForm = () => {
    reset();
  };

  const { toast } = useToast();

  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const master = useMasterData();
  const unitOptions = master.loaded && master.units.length > 0 ? master.units : FALLBACK_UNITS;

  useEffect(() => {
    void getDeliveryFormOptions().then(setFormOptions);
    void getPersonnelRecipients().then(setRecipients);
  }, []);

  // Account codes are system-owned (AST/STK); the picker below shows the
  // selected title's asset types only.
  const selectedTitleTypes = assetTypesForTitle(step1.accountTitle);
  const isStockKind = step1.deliveryKind === "stock";
  const isAssetKind = step1.deliveryKind === "asset";
  const stockTypeOptions = [
    ...new Set(formOptions.stockHeaders.map((h) => h.type).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b));
  const stockHeadersForType = step1.stockType
    ? formOptions.stockHeaders.filter(
        (h) => h.type.trim().toLowerCase() === step1.stockType.trim().toLowerCase()
      )
    : formOptions.stockHeaders;
  const stockTitleOptions = [
    ...new Map(stockHeadersForType.map((h) => [h.title.toUpperCase(), h])).values(),
  ].sort((a, b) => a.title.localeCompare(b.title));
  const selectedStockHeader = formOptions.stockHeaders.find(
    (h) =>
      h.title.trim().toUpperCase() === step1.accountTitle.trim().toUpperCase() &&
      h.type.trim().toLowerCase() === step1.stockType.trim().toLowerCase()
  );
  const isStep1Valid =
    (isStockKind || isAssetKind) &&
    (isStockKind
      ? step1.accountCode.trim().length >= 2 && !!selectedStockHeader
      : step1.accountCode.trim().length >= 2 &&
        formOptions.accountTitles.some(
          (t) => t.toUpperCase() === step1.accountTitle.trim().toUpperCase()
        ) &&
        selectedTitleTypes.some(
          (t) => t.toLowerCase() === step1.assetType.trim().toLowerCase()
        ));
  // Every logged delivery is an arrival: the arrival date is set to today, so
  // there is no target date to pick. The PO reference is system-generated, so
  // it never blocks the step either.
  const isStep2Valid = !!step2.supplierName && !!step2.poReference;
  const isRecipientValid = !!recipient.recipientName;
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

  const isEdit = !!editDeliveryId;

  /**
   * Both modes close instantly. Create paints a placeholder row; Edit paints
   * an overlay over the existing row. The server action keeps running in the
   * background and only a toast reports the outcome — an edit failure reopens
   * the form with the draft intact.
   */
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isStep3Valid) return;

    const formData = new FormData(event.currentTarget);
    const po = step2.poReference;
    const supplier = step2.supplierName;

    if (isEdit && editDeliveryId) {
      // Instant UI — patch the row and close before the write finishes.
      upsertPendingDeliveryEdit({
        deliveryId: editDeliveryId,
        supplier,
        po,
        arrival: step2.expectedArrival ? toDateKey(step2.expectedArrival) : "",
        kind: step1.deliveryKind === "stock" ? "Stocks" : "Assets",
        itemCount: step3.items.length,
      });
      onClose();

      void (async () => {
        let result: SignupState;
        try {
          result = await updateDelivery(
            { success: false, error: undefined },
            formData
          );
        } catch {
          result = {
            success: false,
            error: "Could not reach the server. Please try again.",
          };
        }

        if (result.success) {
          // Revalidate the visible list; the overlay hides the old values
          // until that fetch lands.
          bustClientCache([
            CLIENT_CACHE_KEYS.deliveries,
            CLIENT_CACHE_KEYS.dashboard,
            resourcePrefix("personnel", "deliveries"),
            resourcePrefix("personnel", "dashboard"),
          ]);
          toast({
            title: "Delivery updated",
            description: `${po} · ${supplier} was saved.`,
            variant: "success",
          });
          // Safety net: the refetched row now matches, drop the overlay.
          setTimeout(
            () => removePendingDeliveryEdit(editDeliveryId),
            3_000
          );
          return;
        }

        // Roll back the optimistic overlay and reopen with the draft intact.
        removePendingDeliveryEdit(editDeliveryId);
        toast({
          title: "Update failed",
          description: result.error ?? "The delivery could not be updated.",
          variant: "error",
          duration: 8000,
        });
        onReopen();
      })();
      return;
    }

    const token = crypto.randomUUID();
    const arrival = step2.expectedArrival
      ? toDateKey(step2.expectedArrival)
      : "";

    addPendingDelivery({
      token,
      supplier,
      po,
      arrival,
      kind: step1.deliveryKind === "stock" ? "Stocks" : "Assets",
      itemCount: step3.items.length,
    });

    // Instant UI — the dialog closes before the write finishes.
    onClose();

    void (async () => {
      let result: SignupState;
      try {
        result = await logDelivery({ success: false, error: undefined }, formData);
      } catch {
        result = {
          success: false,
          error: "Could not reach the server. Please try again.",
        };
      }

      if (result.success) {
        if (result.deliveryId) confirmPendingDelivery(token, result.deliveryId);
        // New delivery — drop the cached lists + dashboard snapshot so the
        // page behind the dialog refetches fresh data.
        bustClientCache([
          CLIENT_CACHE_KEYS.deliveries,
          CLIENT_CACHE_KEYS.inspections,
          CLIENT_CACHE_KEYS.dashboard,
          resourcePrefix("personnel", "deliveries"),
          resourcePrefix("personnel", "inspections"),
          resourcePrefix("personnel", "inspections-air"),
          resourcePrefix("personnel", "inspections-counts"),
          resourcePrefix("personnel", "dashboard"),
        ]);
        toast({
          title: "Delivery saved",
          description: `${po} · ${supplier} was recorded.`,
          variant: "success",
        });
        // Safety net: if the refreshed list never shows the row (filtered
        // out, different page), drop the placeholder after a while.
        setTimeout(() => removePendingDelivery(token), 30_000);
        return;
      }

      removePendingDelivery(token);
      toast({
        title: "Save failed",
        description: result.error ?? "The delivery could not be saved.",
        variant: "error",
        duration: 8000,
      });
      onReopen();
    })();
  };

  const renderStep1 = () => {
    const catalogEmpty = formOptions.codes.length === 0;

    return (
      <div className="flex flex-col gap-3">
        <div>
          <Label className="mb-1 block text-sm font-medium">
            Stocks or Assets <span className="font-normal text-navy-500">(start here)</span>
          </Label>
          <div
            role="tablist"
            aria-label="Stocks or Assets"
            className="grid grid-cols-2 gap-2"
          >
            {[
              {
                value: "stock",
                title: "Stocks",
                description: "Consumables, tracked in inventory",
              },
              {
                value: "asset",
                title: "Assets",
                description: "Equipment, tracked in the registry",
              },
            ].map((tab) => {
              const selected = step1.deliveryKind === tab.value;
              return (
                <button
                  key={tab.value}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => handleDeliveryKindChange(tab.value)}
                  className={cn(
                    "flex flex-col items-start gap-0.5 rounded-[6px] border px-3 py-2.5 text-left transition-colors",
                    "focus-visible:outline-2 focus-visible:outline-offset-2",
                    selected
                      ? "border-yellow-500 bg-yellow-50 text-navy-900 shadow-sm"
                      : "border-navy-200 bg-white text-navy-700 hover:border-navy-300 hover:bg-navy-50"
                  )}
                >
                  <span className="text-sm font-semibold">{tab.title}</span>
                  <span
                    className={cn(
                      "text-xs",
                      selected ? "text-navy-700" : "text-navy-500"
                    )}
                  >
                    {tab.description}
                  </span>
                </button>
              );
            })}
          </div>
          {step1.deliveryKind === "" && (
            <p className="mt-1 text-xs text-navy-500">
              Pick one — stocks go to inventory, assets go to the registry after inspection.
            </p>
          )}
        </div>
        {isStockKind ? (
          <>
            <div>
              <Label htmlFor="stock-title" className="mb-1 block text-sm font-medium">
                Stock Title{" "}
                <span className="font-normal text-navy-500">(from Master Data)</span>
              </Label>
              <Select value={step1.accountTitle} onValueChange={handleStockTitleChange}>
                <SelectTrigger id="stock-title" className="w-full">
                  <SelectValue placeholder="Select stock title" />
                </SelectTrigger>
                <SelectContent>
                  {stockTitleOptions.map((h) => (
                    <SelectItem key={h.title} value={h.title}>
                      {h.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="stock-type" className="mb-1 block text-sm font-medium">
                Stock Type{" "}
                <span className="font-normal text-navy-500">(from Master Data)</span>
              </Label>
              <Select value={step1.stockType} onValueChange={handleStockTypeChange}>
                <SelectTrigger id="stock-type" className="w-full">
                  <SelectValue placeholder="Select stock type" />
                </SelectTrigger>
                <SelectContent>
                  {stockTypeOptions.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedStockHeader ? (
                <p className="mt-1 text-xs text-navy-500">
                  Stock header matched: {selectedStockHeader.title} (
                  {selectedStockHeader.type}).
                </p>
              ) : step1.accountTitle || step1.stockType ? (
                <p className="mt-1 text-xs font-medium text-amber-600">
                  Pick a stock title and stock type that belong to the same stock
                  header.
                </p>
              ) : (
                <p className="mt-1 text-xs text-navy-500">
                  Stock title and stock type come from Super Admin → Master Data →
                  Stock headers.
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="stock-code" className="mb-1 block text-sm font-medium">
                Stock Code{" "}
                <span className="font-normal text-navy-500">
                  (system-generated)
                </span>
              </Label>
              <Input
                id="stock-code"
                value={generatingCode ? "Generating…" : step1.accountCode}
                readOnly
                placeholder="Choose Stocks above to generate a code"
                className="bg-navy-50"
              />
              <p className="mt-1 text-xs text-navy-500">
                Generated automatically in the STK-xxx-xx-xx format — no typing or
                Generate button needed.
              </p>
            </div>
            {formOptions.stockHeaders.length === 0 && (
              <p className="text-xs font-medium text-red-600">
                No active stock headers — ask your Super Admin to add them in
                Master Data.
              </p>
            )}
          </>
        ) : (
          <>
            <div>
              <Label htmlFor="account-title" className="mb-1 block text-sm font-medium">
                Account Title <span className="font-normal text-navy-500">(from catalog)</span>
              </Label>
              <Select
                value={step1.accountTitle}
                onValueChange={handleAccountTitleChange}
              >
                <SelectTrigger id="account-title" className="w-full">
                  <SelectValue placeholder="Select account title" />
                </SelectTrigger>
                <SelectContent>
                  {formOptions.accountTitles.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="asset-type" className="mb-1 block text-sm font-medium">
                Asset Type{" "}
                <span className="font-normal text-navy-500">(auto-filled from account title)</span>
              </Label>
              {selectedTitleTypes.length > 1 ? (
                <Select value={step1.assetType} onValueChange={handleAssetTypeChange}>
                  <SelectTrigger id="asset-type" className="w-full">
                    <SelectValue placeholder="Select asset type" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedTitleTypes.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="asset-type"
                  value={step1.assetType}
                  readOnly
                  placeholder="Select an account title first"
                  className="bg-navy-50"
                />
              )}
              {selectedTitleTypes.length > 1 && (
                <p className="mt-1 text-xs text-navy-500">
                  This title is linked to more than one asset type — pick the one for
                  this delivery.
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="account-code" className="mb-1 block text-sm font-medium">
                Account Code{" "}
                <span className="font-normal text-navy-500">
                  (system-generated)
                </span>
              </Label>
              <Input
                id="account-code"
                value={generatingCode ? "Generating…" : step1.accountCode}
                readOnly
                placeholder="Choose Assets above to generate a code"
                className="bg-navy-50"
              />
              <p className="mt-1 text-xs text-navy-500">
                Generated automatically in the AST-xxx-xx-xx format — no typing or
                Generate button needed.
              </p>
            </div>
            {catalogEmpty && (
              <p className="text-xs font-medium text-red-600">
                No active catalog entries — ask your Super Admin to add asset types
                and account titles in Master Data.
              </p>
            )}
          </>
        )}
      </div>
    );
  };

  const renderStep2 = () => (
    <div className="flex flex-col gap-3">
      <div>
        <Label htmlFor="delivery-status" className="mb-1 block text-sm font-medium">
          Status
        </Label>
        <Input
          id="delivery-status"
          value="Arrival"
          readOnly
          className="bg-navy-50"
        />
        <p className="mt-1 text-xs text-navy-500">
          Deliveries are logged as an arrival — there is no waiting period.
        </p>
      </div>
      <div>
        <Label htmlFor="arrival-date" className="mb-1 block text-sm font-medium">
          Date of Arrival
        </Label>
        <Input
          id="arrival-date"
          value={formatArrivalDate(step2.expectedArrival)}
          readOnly
          className="bg-navy-50"
        />
        <p className="mt-1 text-xs text-navy-500">
          Set automatically to the current date when you log this delivery.
        </p>
      </div>
      <div>
        <Label htmlFor="supplier-name" className="mb-1 block text-sm font-medium">
          Supplier
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
          value={step2.poReference}
          readOnly
          className="bg-navy-50 font-mono"
        />
        <p className="mt-1 text-xs text-navy-500">
          System-generated — no input needed.
        </p>
      </div>
    </div>
  );

  const renderRecipient = () => (
    <div className="flex flex-col gap-3">
      <div>
        <Label htmlFor="recipient-account" className="mb-1 block text-sm font-medium">
          Received By <span className="font-normal text-navy-500">(personnel account)</span>
        </Label>
        <Select
          value={recipient.recipientName}
          onValueChange={handleRecipientChange}
        >
          <SelectTrigger id="recipient-account" className="w-full">
            <SelectValue placeholder="Select a PGSO personnel account" />
          </SelectTrigger>
          <SelectContent>
            {recipients.map((person) => (
              <SelectItem key={person.id} value={person.name}>
                {person.name}
                {person.position ? ` — ${person.position}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {recipients.length === 0 ? (
          <p className="mt-1 text-xs font-medium text-red-600">
            No active PGSO personnel accounts — ask your Super Admin to activate
            one in Users.
          </p>
        ) : (
          <p className="mt-1 text-xs text-navy-500">
            The selected account name is recorded as the recipient.
          </p>
        )}
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
                  htmlFor={`item-name-${item.id}`}
                  className="mb-1 block text-sm font-medium"
                >
                  Item Name
                </Label>
                <Input
                  id={`item-name-${item.id}`}
                  value={item.description}
                  onChange={(e) =>
                    handleItemChange(item.id, "description", e.target.value)
                  }
                  placeholder="Item name"
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
                  min="1"
                  step="1"
                  value={item.quantity}
                  onChange={(e) => {
                    const next = e.target.value;
                    if (next === "") {
                      handleItemChange(item.id, "quantity", "");
                      return;
                    }
                    const n = Number(next);
                    // Never accept a negative or zero quantity.
                    if (!Number.isFinite(n) || n < 1) return;
                    handleItemChange(item.id, "quantity", next);
                  }}
                  onBlur={() => {
                    const n = Number(item.quantity);
                    if (!Number.isFinite(n) || n < 1) {
                      handleItemChange(item.id, "quantity", "1");
                    }
                  }}
                  placeholder="1"
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
                  onChange={(e) => {
                    const next = e.target.value;
                    if (next === "") {
                      handleItemChange(item.id, "unitCost", "");
                      return;
                    }
                    const n = Number(next);
                    // Unit cost can be zero, but never negative.
                    if (!Number.isFinite(n) || n < 0) return;
                    handleItemChange(item.id, "unitCost", next);
                  }}
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
          "inline-flex items-center justify-center rounded-[4px] font-semibold",
          "focus-visible:outline-2 focus-visible:outline-offset-2",
          "disabled:pointer-events-none disabled:opacity-50",
          "h-8 px-3.5 text-xs",
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
    <form onSubmit={handleSubmit}>
      <input type="hidden" name="assetType" value={step1.assetType} />
      <input type="hidden" name="stockType" value={step1.stockType} />
      <input type="hidden" name="accountCode" value={step1.accountCode} />
      <input type="hidden" name="accountTitle" value={step1.accountTitle} />
      <input type="hidden" name="deliveryKind" value={step1.deliveryKind} />
      <input
        type="hidden"
        name="dateSupplied"
        value={step2.dateSupplied ? toDateKey(step2.dateSupplied) : ""}
      />
      <input
        type="hidden"
        name="expectedArrival"
        value={toDateKey(step2.expectedArrival ?? new Date())}
      />
      <input type="hidden" name="supplierName" value={step2.supplierName} />
      <input type="hidden" name="poReference" value={step2.poReference} />
      <input type="hidden" name="deliveryStatus" value={step2.deliveryStatus} />
      <input type="hidden" name="recipientRole" value={recipient.recipientRole} />
      <input type="hidden" name="recipientName" value={recipient.recipientName} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <input type="hidden" name="itemsJson" value={JSON.stringify(step3.items)} />
      <input type="hidden" name="deliveryId" value={editDeliveryId ?? ""} />

      <StepperNav currentStep={step} deliveryKind={step1.deliveryKind} />

      <div className="min-h-[180px]">{renderStep()}</div>

      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={handleBack}
          disabled={step === 1}
          className={cn(
            "inline-flex items-center justify-center rounded-[4px] font-semibold",
            "focus-visible:outline-2 focus-visible:outline-offset-2",
            "disabled:pointer-events-none disabled:opacity-50",
            "h-6 px-3 text-xs",
            "border border-navy-200 bg-transparent text-navy-700 hover:bg-navy-100"
          )}
        >
          Back
        </button>
        <div className="flex gap-2">
          {isEdit ? null : (
            <button
              type="button"
              onClick={resetForm}
              className={cn(
                "inline-flex items-center justify-center rounded-[4px] font-semibold",
                "focus-visible:outline-2 focus-visible:outline-offset-2",
                "disabled:pointer-events-none disabled:opacity-50",
                "h-6 px-3 text-xs",
                "border border-navy-200 bg-transparent text-navy-700 hover:bg-navy-100"
              )}
            >
              Reset
            </button>
          )}
          {step === 4 ? (
            <>
              <button
                type="button"
                onClick={() => onShowPreview(true)}
                className={cn(
                  "inline-flex items-center justify-center rounded-[4px] font-semibold",
                  "focus-visible:outline-2 focus-visible:outline-offset-2",
                  "disabled:pointer-events-none disabled:opacity-50",
                  "h-6 px-3 text-xs",
                  "border border-navy-200 bg-transparent text-navy-700 hover:bg-navy-100"
                )}
              >
                Preview Entry
              </button>
              <button
                type="submit"
                disabled={!isStep3Valid}
                className={cn(
                  "inline-flex items-center justify-center rounded-[4px] font-semibold",
                  "focus-visible:outline-2 focus-visible:outline-offset-2",
                  "disabled:pointer-events-none disabled:opacity-50",
                  "h-6 px-3 text-xs",
                  "bg-yellow-500 text-navy-900 hover:bg-yellow-400"
                )}
              >
                {isEdit ? "Save changes" : "Save delivery"}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleNext}
              disabled={!canGoNext}
              className={cn(
                "inline-flex items-center justify-center rounded-[4px] font-semibold",
                "focus-visible:outline-2 focus-visible:outline-offset-2",
                "disabled:pointer-events-none disabled:opacity-50",
                "h-6 px-3 text-xs",
                "bg-yellow-500 text-navy-900 hover:bg-yellow-400"
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
