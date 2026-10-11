"use client";

import { useRef, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toaster";
import {
  createAsset,
  importAssetsFromExcel,
  type CreateAssetState,
  type ImportAssetsState,
  type UnifiedAssetRow,
} from "./actions";
import { useMasterData } from "@/hooks/use-master-data";
import { DatePicker } from "@/components/ui/date-picker";
import { cn } from "@/lib/utils";

const CONDITION_OPTIONS = ["serviceable", "unserviceable"];
const STATUS_OPTIONS = ["available", "in use", "maintenance", "retired"];
const FUEL_OPTIONS = ["gasoline", "diesel", "electric", "hybrid"];

const inputCls = cn(
  "w-full min-w-0 rounded-md border border-navy-200 bg-transparent px-3 py-2 text-sm text-navy-900",
  "focus-visible:border-navy-600 focus-visible:ring-navy-600/50 focus-visible:ring-[3px]",
  "disabled:cursor-not-allowed disabled:opacity-50"
);

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

/** Local YYYY-MM-DD (no UTC shift — toISOString would move the day back). */
function toLocalISODate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Shadcn calendar picker bridged into the uncontrolled dialog form —
 * the picked date is submitted through a hidden input.
 */
function FormDatePicker({
  name,
  value,
  onChange,
}: {
  name: string;
  value: Date | undefined;
  onChange: (date: Date | undefined) => void;
}) {
  return (
    <>
      <DatePicker value={value} onChange={onChange} placeholder="Pick a date" />
      <input
        type="hidden"
        name={name}
        value={value ? toLocalISODate(value) : ""}
      />
    </>
  );
}

function OptionSelect({  name,
  placeholder,
  options,
  defaultValue,
}: {
  name: string;
  placeholder: string;
  options: string[];
  defaultValue?: string;
}) {
  const [value, setValue] = useState<string | undefined>(defaultValue);
  return (
    <>
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger className={inputCls}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o.charAt(0).toUpperCase() + o.slice(1)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <input type="hidden" name={name} value={value ?? ""} />
    </>
  );
}

export interface AssetMutationEvent {
  phase: "start" | "success" | "error";
  /** Optimistic row (start) / reconcile base (settle). Never sent to the server. */
  temp: UnifiedAssetRow;
  tempId: string;
  /** Server record on success (carries the real id). */
  record?: { id: string; account_code: string | null; article: string | null };
  error?: string;
}

/**
 * Build the optimistic row for a create submit (pure, instant, <100ms).
 * Fields mirror the lean table columns; anything unknown renders "—" and
 * converges on the next revalidation. The temp id never collides with UUIDs.
 */
export function buildOptimisticAssetRow(formData: FormData): UnifiedAssetRow {
  const get = (k: string) => {
    const v = formData.get(k);
    const s = v === null || v === undefined ? "" : String(v).trim();
    return s === "" ? null : s.slice(0, 500);
  };
  const numOrNull = (k: string) => {
    const v = formData.get(k);
    if (v === null || v === undefined || String(v).trim() === "") return null;
    const n = Number(String(v));
    return Number.isNaN(n) ? null : Math.trunc(n);
  };
  const tempId = `optimistic-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id: tempId,
    source: "asset",
    account_code: get("account_code"),
    identifier: get("identifier"),
    account_title: get("account_title"),
    account_name: get("account_name"),
    category: get("category"),
    article: get("article"),
    quantity: numOrNull("quantity") ?? 1,
    unit: get("unit"),
    description: get("description"),
    date_acquired: get("date_acquired"),
    location: get("location"),
    total_cost: get("total_cost") != null ? Number(get("total_cost")) : null,
    remarks: get("remarks"),
    condition: get("condition") ?? "serviceable",
    unit_cost: get("unit_cost") != null ? Number(get("unit_cost")) : null,
    end_user: get("end_user"),
    brand: get("brand"),
    cylinders: numOrNull("cylinders"),
    engine_displacement: get("engine_displacement"),
    fuel_type: get("fuel_type"),
    engine_number: get("engine_number"),
    chassis_number: get("chassis_number"),
    color: get("color"),
    plate_number: get("plate_number"),
    fund: get("fund"),
    status: get("status") ?? "available",
    dv_tracking_number: get("dv_tracking_number"),
    supplier_payee: get("supplier_payee"),
    account_name_charge: get("account_name_charge"),
    account_number: get("account_number"),
    obr_number: get("obr_number"),
    dv_number: get("dv_number"),
    date_received: get("date_received"),
    created_at: new Date().toISOString(),
    qr_code: get("qr_code"),
    assigned_to: null,
    qr_data_url: "",
    custom_fields: {},
  };
}

export function AddAssetDialog({
  categories,
  onSuccess,
  onMutationEvent,
  triggerClassName,
}: {
  categories: string[];
  onSuccess?: () => void;
  /**
   * Optimistic lifecycle: `start` (temp row to prepend) → `success`
   * (server record to reconcile) / `error` (roll back the temp row).
   * The dialog still toasts + closes/resets itself; the parent patches
   * its cached window without a refetch.
   */
  onMutationEvent?: (e: AssetMutationEvent) => void;
  /** Extra classes for the trigger so header actions match Stocks/Dashboard sizing. */
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const { toast } = useToast();
  // Strict mode: code + unit come from Master Data; title + type auto-fill.
  const master = useMasterData();
  const [code, setCode] = useState<string | undefined>(undefined);
  const [unit, setUnit] = useState<string | undefined>(undefined);
  const [dateAcquired, setDateAcquired] = useState<Date | undefined>(undefined);
  const [dateReceived, setDateReceived] = useState<Date | undefined>(undefined);
  const selected = master.catalog.find((c) => c.account_code === code);
  const catalogMode = master.loaded && master.catalog.length > 0;

  function handleOpenChange(v: boolean) {
    setOpen(v);
    if (!v) {
      setCode(undefined);
      setUnit(undefined);
      setDateAcquired(undefined);
      setDateReceived(undefined);
      setError("");
    }
  }

  function submit(formData: FormData) {
    setError("");
    if (catalogMode && !code) {
      setError("Pick an ACCOUNT CODE from Master Data.");
      return;
    }
    const temp = buildOptimisticAssetRow(formData);
    onMutationEvent?.({ phase: "start", temp, tempId: temp.id });
    startTransition(async () => {
      const res: CreateAssetState = await createAsset({} as CreateAssetState, formData);
      if (res.success) {
        toast({ title: "Asset added", description: "The new asset is now in the registry.", variant: "success" });
        formRef.current?.reset();
        setCode(undefined);
        setUnit(undefined);
        setDateAcquired(undefined);
        setDateReceived(undefined);
        setOpen(false);
        onMutationEvent?.({
          phase: "success",
          temp,
          tempId: temp.id,
          record: res.record as AssetMutationEvent["record"],
        });
        onSuccess?.();
      } else {
        const msg = res.error ?? "Failed to add the asset.";
        setError(msg);
        toast({ title: "Error", description: msg, variant: "error" });
        onMutationEvent?.({ phase: "error", temp, tempId: temp.id, error: msg });
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className={triggerClassName}
      >
        Add asset
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="pgso-no-scrollbar max-h-[90vh] overflow-y-auto bg-white sm:max-w-3xl dark:bg-white">
          <DialogHeader>
            <DialogTitle>Add asset</DialogTitle>
            <DialogDescription>
              ACCOUNT CODE and ARTICLE are required. Pick the code from Master Data — title and type fill in automatically. PROPERTY No. becomes the QR code — leave it blank to assign later.
            </DialogDescription>
          </DialogHeader>
          <form ref={formRef} action={submit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="ACCOUNT CODE" required>
                {catalogMode ? (
                  <>
                    <Select value={code} onValueChange={setCode}>
                      <SelectTrigger className={inputCls}>
                        <SelectValue placeholder="Select account code" />
                      </SelectTrigger>
                      <SelectContent>
                        {master.catalog.map((c) => (
                          <SelectItem key={c.account_code} value={c.account_code}>
                            {c.account_code} — {c.account_title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <input type="hidden" name="account_code" value={code ?? ""} />
                  </>
                ) : (
                  <Input name="account_code" required placeholder="e.g. 1-07-05-010" className={inputCls} />
                )}
              </Field>
              <Field label="PROPERTY No. (QR)">
                <Input name="qr_code" placeholder="e.g. OFFICE-ITEM 001" className={inputCls} />
              </Field>
              <Field label="ASSET TYPE">
                {selected ? (
                  <>
                    <Input value={selected.asset_type} disabled className={inputCls} />
                    <input type="hidden" name="category" value={selected.asset_type} />
                  </>
                ) : (
                  <Input
                    name="category"
                    placeholder={categories.length > 0 ? `e.g. ${categories[0]}` : "e.g. Machinery and Equipment"}
                    className={inputCls}
                    list="asset-category-options"
                    disabled={catalogMode}
                  />
                )}
                <datalist id="asset-category-options">
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </Field>
              <Field label="ARTICLE" required>
                <Input name="article" required placeholder="e.g. TRACTOR" className={inputCls} />
              </Field>
              <Field label="ACCOUNT TITLE">
                {selected ? (
                  <>
                    <Input value={selected.account_title} disabled className={inputCls} />
                    <input type="hidden" name="account_title" value={selected.account_title} />
                  </>
                ) : (
                  <Input name="account_title" placeholder="e.g. MACHINERIES" className={inputCls} disabled={catalogMode} />
                )}
              </Field>
              <Field label="ACCOUNT NAME">
                <Input name="account_name" placeholder="e.g. MACHINERY" className={inputCls} />
              </Field>
              <Field label="IDENTIFIER">
                <Input name="identifier" className={inputCls} />
              </Field>
              <Field label="QTY.">
                <Input name="quantity" type="number" min={0} step={1} defaultValue="1" className={inputCls} />
              </Field>
              <Field label="UNIT">
                {master.loaded && master.units.length > 0 ? (
                  <>
                    <Select value={unit} onValueChange={setUnit}>
                      <SelectTrigger className={inputCls}>
                        <SelectValue placeholder="Select unit" />
                      </SelectTrigger>
                      <SelectContent>
                        {master.units.map((u) => (
                          <SelectItem key={u} value={u}>
                            {u}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <input type="hidden" name="unit" value={unit ?? ""} />
                  </>
                ) : (
                  <Input name="unit" placeholder="unit / pc / set" className={inputCls} />
                )}
              </Field>
              <Field label="CONDITION">
                <OptionSelect name="condition" placeholder="Select condition" options={CONDITION_OPTIONS} defaultValue="serviceable" />
              </Field>
              <Field label="STATUS">
                <OptionSelect name="status" placeholder="Select status" options={STATUS_OPTIONS} defaultValue="available" />
              </Field>
              <div className="grid gap-1.5 sm:col-span-2">
                <Field label="DESCRIPTION">
                  <textarea name="description" rows={2} placeholder="Full description…" className={inputCls} />
                </Field>
              </div>
              <Field label="DATE ACQUIRED">
                <FormDatePicker
                  name="date_acquired"
                  value={dateAcquired}
                  onChange={setDateAcquired}
                />
              </Field>
              <Field label="LOCATION">
                <Input name="location" placeholder="e.g. PGSO" className={inputCls} />
              </Field>
              <Field label="TOTAL COST">
                <Input name="total_cost" type="number" min={0} step="0.01" placeholder="0.00" className={inputCls} />
              </Field>
              <Field label="UNIT COST">
                <Input name="unit_cost" type="number" min={0} step="0.01" placeholder="0.00" className={inputCls} />
              </Field>
              <Field label="END USER">
                <Input name="end_user" placeholder="Accountable person" className={inputCls} />
              </Field>
              <Field label="FUND">
                <Input name="fund" className={inputCls} />
              </Field>
              <Field label="BRAND">
                <Input name="brand" className={inputCls} />
              </Field>
              <Field label="No. of Cyl.">
                <Input name="cylinders" type="number" min={0} step={1} className={inputCls} />
              </Field>
              <Field label="Engine Displacement">
                <Input name="engine_displacement" className={inputCls} />
              </Field>
              <Field label="Fuel Type">
                <OptionSelect name="fuel_type" placeholder="Select fuel type" options={FUEL_OPTIONS} />
              </Field>
              <Field label="ENGINE#">
                <Input name="engine_number" className={inputCls} />
              </Field>
              <Field label="CHASSIS#">
                <Input name="chassis_number" className={inputCls} />
              </Field>
              <Field label="COLOR">
                <Input name="color" className={inputCls} />
              </Field>
              <Field label="PLATE NO.">
                <Input name="plate_number" className={inputCls} />
              </Field>
              <Field label="REMARKS">
                <Input name="remarks" className={inputCls} />
              </Field>
              <Field label="DATE RECEIVED AT INVENTORY">
                <FormDatePicker
                  name="date_received"
                  value={dateReceived}
                  onChange={setDateReceived}
                />
              </Field>
              <Field label="DV TRACKING NUMBER">
                <Input name="dv_tracking_number" className={inputCls} />
              </Field>
              <Field label="SUPPLIER/PAYEE">
                <Input name="supplier_payee" className={inputCls} />
              </Field>
              <Field label="ACCOUNT NAME-CHARGE">
                <Input name="account_name_charge" className={inputCls} />
              </Field>
              <Field label="ACCOUNT NUMBER">
                <Input name="account_number" className={inputCls} />
              </Field>
              <Field label="OBR NUMBER">
                <Input name="obr_number" className={inputCls} />
              </Field>
              <Field label="DV NUMBER">
                <Input name="dv_number" className={inputCls} />
              </Field>
            </div>

            {error ? (
              <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            ) : null}

            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="h-8 rounded-[4px] px-3.5 text-xs font-semibold"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={pending}
                className="h-8 rounded-[4px] px-3.5 text-xs font-semibold"
              >
                {pending ? (
                  <>
                    <Loader2 className="mr-1 size-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  "Save asset"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ImportAssetsDialog({
  onSuccess,
  triggerClassName,
}: {
  onSuccess?: () => void;
  /** Extra classes for the trigger so header actions match Stocks/Dashboard sizing. */
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ImportAssetsState | null>(null);
  const [fileName, setFileName] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const { toast } = useToast();

  function submit(formData: FormData) {
    setResult(null);
    startTransition(async () => {
      const res = await importAssetsFromExcel({} as ImportAssetsState, formData);
      setResult(res);
      if (res.success) {
        const parts = [
          `${res.created ?? 0} new ${res.created === 1 ? "item" : "items"} added`,
          (res.updated ?? 0) > 0 ? `${res.updated} existing ${res.updated === 1 ? "item" : "items"} updated` : "",
          res.skipped ? `${res.skipped} ${res.skipped === 1 ? "row" : "rows"} skipped — see the notes below` : "",
        ].filter(Boolean);
        toast({
          title: "Import finished",
          description: `${parts.join(" · ")}.`,
          variant: "success",
        });
        onSuccess?.();
      } else if (res.error) {
        toast({
          title: "Import needs attention",
          description: "Nothing was saved yet. Please read the message below for what to fix.",
          variant: "error",
        });
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className={triggerClassName}
      >
        Import Excel
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) {
            setResult(null);
            setFileName("");
          }
        }}
      >
        <DialogContent className="pgso-no-scrollbar max-h-[90vh] overflow-y-auto bg-white sm:max-w-xl dark:bg-white">
          <DialogHeader>
            <DialogTitle>Import assets from Excel</DialogTitle>
            <DialogDescription>
              Upload your filled-in template and we&apos;ll check each row for you.
              New items are added, changed items are updated, and rows that are
              already correct or need a fix are skipped with a clear note telling
              you what to do next. Nothing is deleted by an import.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md border border-navy-200 bg-navy-50 p-3 text-sm">
            <p className="font-semibold text-navy-900">1 · Get the template</p>
            <p className="mt-1 text-navy-700">
              From <span className="font-semibold">Download Templates</span> in the sidebar
              (Asset Import Template).
            </p>
          </div>

          <form ref={formRef} action={submit} className="mt-3 grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="asset-import-file">2 · Upload the filled file</Label>
              <Input
                id="asset-import-file"
                name="file"
                type="file"
                accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                required
                className={inputCls}
                onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
              />
              {fileName ? <p className="text-xs text-navy-600">Selected: {fileName}</p> : null}
              <p className="text-xs text-zinc-500">
                Please keep row 1 as the column titles, start your records at row 2
                with one asset per row, and make sure every row has an ACCOUNT CODE.
                Max file size is 10 MB.
              </p>
            </div>

            {result?.error ? (
              <div role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
                <p className="font-semibold">What happened</p>
                <p className="mt-1">{result.error}</p>
                {(result.errors?.length ?? 0) > 0 ? (
                  <>
                    <p className="mt-2 font-semibold">Row-by-row notes — what to fix</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-xs">
                      {result.errors!.map((m, i) => (
                        <li key={i}>{m}</li>
                      ))}
                    </ul>
                    <p className="mt-2 text-xs">
                      Tip: fix only the rows listed above, save the file, and
                      re-import it — correct rows will not be duplicated.
                    </p>
                  </>
                ) : null}
              </div>
            ) : null}
            {result?.success ? (
              <div className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900">
                <p className="font-semibold">Import finished — here&apos;s what happened</p>
                <p className="mt-1">
                  {result.created ?? 0} new {(result.created ?? 0) === 1 ? "item" : "items"} added
                  {(result.updated ?? 0) > 0 ? ` · ${result.updated} existing ${(result.updated ?? 0) === 1 ? "item" : "items"} updated` : ""}
                  {(result.skipped ?? 0) > 0 ? ` · ${result.skipped} ${(result.skipped ?? 0) === 1 ? "row" : "rows"} skipped` : ""}
                  .
                </p>
                {(result.errors?.length ?? 0) > 0 ? (
                  <>
                    <p className="mt-2 font-semibold">Skipped rows — what to do next</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-xs">
                      {result.errors!.map((m, i) => (
                        <li key={i}>{m}</li>
                      ))}
                    </ul>
                    <p className="mt-2 text-xs">
                      Skipped rows were not lost. Fix only the rows above and
                      re-import the file — items already added will not be duplicated.
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-xs">Every row was imported cleanly — no action needed.</p>
                )}
              </div>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="h-8 rounded-[4px] px-3.5 text-xs font-semibold"
              >
                {result?.success ? "Close" : "Cancel"}
              </Button>
              <Button
                type="submit"
                disabled={pending}
                className="h-8 rounded-[4px] px-3.5 text-xs font-semibold"
              >
                {pending ? (
                  <>
                    <Loader2 className="mr-1 size-4 animate-spin" />
                    Importing…
                  </>
                ) : (
                  "Import file"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
