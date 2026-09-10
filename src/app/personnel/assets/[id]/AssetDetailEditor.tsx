"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { useToast } from "@/components/ui/toaster";
import { updateUnifiedAsset, type EditState, type UnifiedAssetRow } from "../actions";
import styles from "../../dashboard/page.module.css";
import assetStyles from "../page.module.css";
import { cn } from "@/lib/utils";

type EditFieldType = {
  key: keyof UnifiedAssetRow;
  label: string;
  type: "text" | "number" | "currency" | "date" | "textarea" | "select";
  options?: string[];
  readOnly?: boolean;
};

const CONDITION_OPTIONS = ["serviceable", "unserviceable"];

const STATUS_OPTIONS = ["available", "retired", "in use", "maintenance"];

const FUEL_TYPE_OPTIONS = ["gasoline", "diesel", "electric", "hybrid"];

const FIELD_SECTIONS: { title: string; fields: EditFieldType[] }[] = [
  {
    title: "Identification",
    fields: [
      { label: "Account Code", key: "account_code", type: "text" },
      { label: "Identifier", key: "identifier", type: "text" },
      { label: "Account Title", key: "account_title", type: "text" },
      { label: "Account Name", key: "account_name", type: "text" },
      { label: "Asset Type", key: "category", type: "select" },
      { label: "Article", key: "article", type: "text" },
    ],
  },
  {
    title: "Item Details",
    fields: [
      { label: "Quantity", key: "quantity", type: "number" },
      { label: "Unit", key: "unit", type: "text" },
      { label: "Description", key: "description", type: "textarea" },
      { label: "Date Acquired", key: "date_acquired", type: "date" },
      { label: "Location", key: "location", type: "text" },
    ],
  },
  {
    title: "Financial",
    fields: [
      { label: "Total Cost", key: "total_cost", type: "currency" },
      { label: "Unit Cost", key: "unit_cost", type: "currency" },
      { label: "Condition", key: "condition", type: "select", options: CONDITION_OPTIONS },
      { label: "Status", key: "status", type: "select", options: STATUS_OPTIONS },
    ],
  },
  {
    title: "Vehicle / Equipment Details",
    fields: [
      { label: "Brand", key: "brand", type: "text" },
      { label: "Cylinders", key: "cylinders", type: "number" },
      { label: "Engine Displacement", key: "engine_displacement", type: "text" },
      { label: "Fuel Type", key: "fuel_type", type: "select", options: FUEL_TYPE_OPTIONS },
      { label: "Engine #", key: "engine_number", type: "text" },
      { label: "Chassis #", key: "chassis_number", type: "text" },
      { label: "Color", key: "color", type: "text" },
      { label: "Plate No.", key: "plate_number", type: "text" },
    ],
  },
  {
    title: "Funding & Documents",
    fields: [
      { label: "Fund", key: "fund", type: "text" },
      { label: "DV Tracking #", key: "dv_tracking_number", type: "text" },
      { label: "Supplier / Payee", key: "supplier_payee", type: "text" },
      { label: "Charge Account", key: "account_name_charge", type: "text" },
      { label: "Account Number", key: "account_number", type: "text" },
      { label: "OBR Number", key: "obr_number", type: "text" },
      { label: "DV Number", key: "dv_number", type: "text" },
      { label: "Date Received", key: "date_received", type: "date" },
    ],
  },
  {
    title: "Remarks",
    fields: [
      { label: "Remarks", key: "remarks", type: "textarea" },
    ],
  },
  {
    title: "System",
    fields: [
      { label: "Created", key: "created_at", type: "date", readOnly: true },
    ],
  },
];

const inputCls = cn(
  "w-full min-w-0 rounded-md border border-navy-200 bg-transparent px-3 py-2 text-sm text-navy-900",
  "focus-visible:border-navy-600 focus-visible:ring-navy-600/50 focus-visible:ring-[3px]",
  "disabled:cursor-not-allowed disabled:opacity-50",
);

function fmtEditValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  return String(value);
}

function fmtDisplayValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (key.includes("cost")) {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      minimumFractionDigits: 2,
    }).format(Number(value));
  }
  if (key.includes("date") || key.includes("created") || key.includes("acquired") || key.includes("received")) {
    const d = new Date(String(value));
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString("en-PH", {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "Asia/Manila",
    });
  }
  return String(value);
}

function statusLabel(status: string | null): string {
  if (!status) return "Unknown";
  return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");
}

function statusTone(status: string | null): "ok" | "warn" | "info" {
  if (status === "available") return "ok";
  if (status === "retired") return "warn";
  return "info";
}

function QrCard({ asset }: { asset: UnifiedAssetRow }) {
  return (
    <div className={assetStyles.qrCard}>
      {asset.qr_data_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={asset.qr_data_url}
          alt={`QR code for ${asset.account_code}`}
          className={assetStyles.qrImgLarge}
        />
      ) : (
        <span className={assetStyles.qrPlaceholder}>No QR code</span>
      )}
      <p className={assetStyles.qrLabel}>QR Data</p>
      <p className={assetStyles.qrValue}>
        {asset.qr_code ?? asset.account_code ?? asset.id}
      </p>
    </div>
  );
}

function DateEditField({ field, asset }: { field: EditFieldType; asset: UnifiedAssetRow }) {
  const { key, label, readOnly } = field;
  const rawValue = asset[key];
  const inputId = `field-${key}`;
  const [dateValue, setDateValue] = useState<Date | undefined>(
    rawValue ? new Date(String(rawValue)) : undefined
  );

  return (
    <div className={assetStyles.detailField}>
      <Label htmlFor={inputId} className={assetStyles.detailLabel}>
        {label}
      </Label>
      {readOnly ? (
        <Input
          id={inputId}
          type="text"
          value={rawValue ? fmtDisplayValue(key, rawValue) : "—"}
          disabled
          className={cn(inputCls, "bg-navy-50")}
        />
      ) : (
        <DatePicker
          id={inputId}
          value={dateValue}
          onChange={(date) => setDateValue(date)}
          placeholder="Pick a date"
        />
      )}
      <input type="hidden" name={key} value={dateValue ? dateValue.toISOString().slice(0, 10) : ""} />
    </div>
  );
}

function SelectEditField({ field, asset }: { field: EditFieldType; asset: UnifiedAssetRow }) {
  const { key, label, options } = field;
  const rawValue = asset[key];
  const inputId = `field-${key}`;
  const rawString = rawValue !== null && rawValue !== undefined ? String(rawValue) : "";
  const [value, setValue] = useState<string | undefined>(
    rawString.trim() ? rawString : undefined
  );

  return (
    <div className={assetStyles.detailField}>
      <Label htmlFor={inputId} className={assetStyles.detailLabel}>
        {label}
      </Label>
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger id={inputId} className={inputCls}>
          <SelectValue
            placeholder={
              key === "category"
                ? "Select asset type"
                : key === "condition"
                  ? "Select condition"
                  : `Select ${label.toLowerCase()}`
            }
          />
        </SelectTrigger>
        <SelectContent>
          {options?.map((opt) => (
            <SelectItem key={opt} value={opt}>
              {opt.charAt(0).toUpperCase() + opt.slice(1)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <input type="hidden" name={key} value={value ?? ""} />
    </div>
  );
}

function EditField({ field, asset }: { field: EditFieldType; asset: UnifiedAssetRow }) {
  const { key, label, type, options } = field;
  const rawValue = asset[key];
  const inputId = `field-${key}`;
  const commonProps = {
    id: inputId,
    name: key,
    defaultValue: fmtEditValue(key, rawValue),
  };

  if (type === "textarea") {
    return (
      <div className={assetStyles.detailField}>
        <Label htmlFor={inputId} className={assetStyles.detailLabel}>
          {label}
        </Label>
        <textarea {...commonProps} rows={3} className={inputCls} />
      </div>
    );
  }

  if (type === "select") {
    return <SelectEditField field={field} asset={asset} />;
  }

  if (type === "date") {
    return <DateEditField field={field} asset={asset} />;
  }

  const htmlType = type === "number" ? "number" : type === "currency" ? "number" : "text";
  const step = type === "currency" ? "0.01" : undefined;

  return (
    <div className={assetStyles.detailField}>
      <Label htmlFor={inputId} className={assetStyles.detailLabel}>
        {label}
      </Label>
      <Input
        {...commonProps}
        type={htmlType}
        step={step}
      />
    </div>
  );
}

function ReadOnlyField({ field, asset }: { field: EditFieldType; asset: UnifiedAssetRow }) {
  const { key, label } = field;
  const tone = statusTone(asset.status);
  const statusClass = assetStyles[`status${tone.charAt(0).toUpperCase() + tone.slice(1)}`];

  return (
    <div className={assetStyles.detailField}>
      <span className={assetStyles.detailLabel}>{label}</span>
      <span className={assetStyles.detailValue}>
        {key === "status" ? (
          <span className={cn(assetStyles.statusBadge, statusClass)}>
            {statusLabel(asset[key])}
          </span>
        ) : (
          fmtDisplayValue(key, asset[key])
        )}
      </span>
    </div>
  );
}

export function AssetDetailEditor({ asset, categories }: { asset: UnifiedAssetRow; categories: string[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  const sections = FIELD_SECTIONS.map((s) =>
    s.fields.map((f) =>
      f.key === "category" ? { ...f, options: categories } : f
    )
  );

  const handleSubmit = (formData: FormData) => {
    startTransition(async () => {
      const result: EditState = await updateUnifiedAsset({} as EditState, formData);
      if (result.success) {
        toast({
          title: "Success",
          description: "Asset updated successfully.",
          variant: "success",
        });
        setIsEditing(false);
        router.refresh();
      }
      if (result.error) {
        toast({
          title: "Error",
          description: result.error,
          variant: "error",
        });
      }
    });
  };

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>
        Personnel / Assets / {asset.account_code ?? asset.id}
      </p>

      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Asset Detail</h1>
          <p className={styles.subtitle}>
            {asset.article ?? asset.description ?? "Asset"} — {asset.account_code ?? "—"}
          </p>
        </div>
        <div className={styles.actions}>
          {!isEditing && (
            <Link href="/personnel/assets">
              <Button type="button" variant="outline" size="sm">
                Back to Assets
              </Button>
            </Link>
          )}
          {isEditing ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsEditing(false)}
            >
              Cancel
            </Button>
          ) : (
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => setIsEditing(true)}
            >
              Edit
            </Button>
          )}
        </div>
      </div>

      <Card className={styles.panel}>
        {isEditing ? (
          <form action={handleSubmit}>
            <input type="hidden" name="id" value={asset.id} />
            <input type="hidden" name="source" value={asset.source} />
            {sections.map((fields, i) => (
              <div key={i} className="mb-6 last:mb-0">
                <h3 className={assetStyles.sectionTitle}>{FIELD_SECTIONS[i].title}</h3>
                <div className={assetStyles.detailFields}>
                  {fields.map((f) => (
                    <EditField key={f.key} field={f} asset={asset} />
                  ))}
                </div>
              </div>
            ))}
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={isPending}
                aria-busy={isPending}
              >
                {isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  "Save All Changes"
                )}
              </Button>
            </div>
          </form>
        ) : (
          <div className={assetStyles.detailGrid}>
            <QrCard asset={asset} />
            <div className={assetStyles.detailFields}>
              {sections.map((fields, i) => (
                <div key={i} className="mb-6 last:mb-0">
                  <h3 className={assetStyles.sectionTitle}>{FIELD_SECTIONS[i].title}</h3>
                  <div className={assetStyles.detailFields}>
                    {fields.map((f) => (
                      <ReadOnlyField key={f.key} field={f} asset={asset} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </section>
  );
}
