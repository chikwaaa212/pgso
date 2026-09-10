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
} from "./actions";
import { useMasterData } from "@/hooks/use-master-data";
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

function OptionSelect({
  name,
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

export function AddAssetDialog({
  categories,
  onSuccess,
}: {
  categories: string[];
  onSuccess?: () => void;
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
  const selected = master.catalog.find((c) => c.account_code === code);
  const catalogMode = master.loaded && master.catalog.length > 0;

  function handleOpenChange(v: boolean) {
    setOpen(v);
    if (!v) {
      setCode(undefined);
      setUnit(undefined);
      setError("");
    }
  }

  function submit(formData: FormData) {
    setError("");
    if (catalogMode && !code) {
      setError("Pick an ACCOUNT CODE from Master Data.");
      return;
    }
    startTransition(async () => {
      const res: CreateAssetState = await createAsset({} as CreateAssetState, formData);
      if (res.success) {
        toast({ title: "Asset added", description: "The new asset is now in the registry.", variant: "success" });
        formRef.current?.reset();
        setCode(undefined);
        setUnit(undefined);
        setOpen(false);
        onSuccess?.();
      } else {
        setError(res.error ?? "Failed to add the asset.");
      }
    });
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        Add asset
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto bg-white sm:max-w-3xl dark:bg-white">
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
                <Input name="date_acquired" type="date" className={inputCls} />
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
                <Input name="date_received" type="date" className={inputCls} />
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
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
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

export function ImportAssetsDialog({ onSuccess }: { onSuccess?: () => void }) {
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
        toast({
          title: "Import complete",
          description: `${res.created ?? 0} added · ${res.updated ?? 0} updated${res.skipped ? ` · ${res.skipped} skipped` : ""}.`,
          variant: "success",
        });
        onSuccess?.();
      }
    });
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
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
        <DialogContent className="max-h-[90vh] overflow-y-auto bg-white sm:max-w-xl dark:bg-white">
          <DialogHeader>
            <DialogTitle>Import assets from Excel</DialogTitle>
            <DialogDescription>
              Fill the template, then upload it here. Existing ACCOUNT CODEs are updated; new ones are added. Rows with unknown ACCOUNT CODEs are skipped — those codes must come from Master Data.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md border border-navy-200 bg-navy-50 p-3 text-sm">
            <p className="font-semibold text-navy-900">1 · Download the template</p>
            <p className="mt-1 text-navy-700">
              Keep its 34 headers exactly — do not rename, reorder, or add columns.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <a href="/api/personnel/assets/template-xlsx" download>
                <Button type="button" size="sm" variant="outline">
                  Download template (.xlsx)
                </Button>
              </a>
              <a href="/templates/ASSET-TEMPLATE.xlsx" download className="text-xs font-medium text-navy-600 underline underline-offset-2">
                mirror: /templates/ASSET-TEMPLATE.xlsx
              </a>
            </div>
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
                Start records at row 2 · one asset per row · ACCOUNT CODE required · max 10 MB.
              </p>
            </div>

            {result?.error ? (
              <p role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
                {result.error}
              </p>
            ) : null}
            {result?.success ? (
              <div className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900">
                <p className="font-semibold">
                  {result.created ?? 0} added · {result.updated ?? 0} updated
                  {(result.skipped ?? 0) > 0 ? ` · ${result.skipped} skipped` : ""}
                </p>
                {(result.errors?.length ?? 0) > 0 ? (
                  <ul className="mt-1 list-disc pl-5">
                    {result.errors!.map((m, i) => (
                      <li key={i}>{m}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : (result?.errors?.length ?? 0) > 0 ? (
              <ul className="list-disc pl-5 text-xs text-amber-900">
                {result!.errors!.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                {result?.success ? "Close" : "Cancel"}
              </Button>
              <Button type="submit" disabled={pending}>
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
