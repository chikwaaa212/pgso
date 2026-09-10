"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toaster";
import { updateStock, type EditState, type StockRow } from "../../actions";
import styles from "../../../dashboard/page.module.css";
import assetStyles from "../../page.module.css";
import { cn } from "@/lib/utils";

const EDIT_FIELDS: {
  key: keyof StockRow;
  label: string;
  type: "text" | "number" | "date" | "textarea";
}[] = [
  { label: "Item Name", key: "item_name", type: "text" },
  { label: "Category", key: "category", type: "text" },
  { label: "Account Code", key: "account_code", type: "text" },
  { label: "Quantity", key: "quantity", type: "number" },
  { label: "Unit", key: "unit", type: "text" },
  { label: "Reorder Threshold", key: "reorder_threshold", type: "number" },
  { label: "Location", key: "location", type: "text" },
  { label: "Updated At", key: "updated_at", type: "date" },
];

const inputCls = cn(
  "w-full min-w-0 rounded-md border border-navy-200 bg-transparent px-3 py-2 text-sm text-navy-900",
  "focus-visible:border-navy-600 focus-visible:ring-navy-600/50 focus-visible:ring-[3px]",
  "disabled:cursor-not-allowed disabled:opacity-50",
);

function fmtDateInput(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().split("T")[0];
}

function fmtEditValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  return String(value);
}

function fmtDisplayValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (key.includes("date") || key.includes("updated")) {
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

function QrCard({ stock }: { stock: StockRow }) {
  return (
    <div className={assetStyles.qrCard}>
      {stock.qr_data_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={stock.qr_data_url}
          alt={`QR code for ${stock.item_name}`}
          className={assetStyles.qrImgLarge}
        />
      ) : (
        <span className={assetStyles.qrPlaceholder}>No QR code</span>
      )}
      <p className={assetStyles.qrLabel}>QR Data</p>
      <p className={assetStyles.qrValue}>
        {stock.item_name ?? stock.id}
      </p>
    </div>
  );
}

function EditField({ field, stock }: { field: (typeof EDIT_FIELDS)[number]; stock: StockRow }) {
  const { key, label, type } = field;
  const rawValue = stock[key];
  const inputId = `field-${key}`;
  const commonProps = {
    id: inputId,
    name: key,
    defaultValue: fmtEditValue(rawValue),
  };

  if (type === "date") {
    return (
      <div className={assetStyles.detailField}>
        <Label htmlFor={inputId} className={assetStyles.detailLabel}>
          {label}
        </Label>
        <input
          {...commonProps}
          type="date"
          defaultValue={fmtDateInput(typeof rawValue === "string" ? rawValue : null)}
          className={inputCls}
        />
      </div>
    );
  }

  const htmlType = type === "number" ? "number" : "text";

  return (
    <div className={assetStyles.detailField}>
      <Label htmlFor={inputId} className={assetStyles.detailLabel}>
        {label}
      </Label>
      <Input
        {...commonProps}
        type={htmlType}
      />
    </div>
  );
}

function ReadOnlyField({ field, stock }: { field: (typeof EDIT_FIELDS)[number]; stock: StockRow }) {
  const { key, label } = field;

  return (
    <div className={assetStyles.detailField}>
      <span className={assetStyles.detailLabel}>{label}</span>
      <span className={assetStyles.detailValue}>
        {fmtDisplayValue(key, stock[key])}
      </span>
    </div>
  );
}

export function StockDetailEditor({ stock }: { stock: StockRow }) {
  const router = useRouter();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (formData: FormData) => {
    startTransition(async () => {
      const result: EditState = await updateStock({} as EditState, formData);
      if (result.success) {
        toast({
          title: "Success",
          description: "Stock item updated successfully.",
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
        Personnel / Assets / Stocks / {stock.item_name ?? stock.id}
      </p>

      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Stock Detail</h1>
          <p className={styles.subtitle}>
            {stock.item_name ?? "Item"} — {stock.account_code ?? "—"}
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
            <input type="hidden" name="id" value={stock.id} />
            <div className={assetStyles.detailFields}>
              {EDIT_FIELDS.map((f) => (
                <EditField key={f.key} field={f} stock={stock} />
              ))}
            </div>
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
            <QrCard stock={stock} />
            <div className={assetStyles.detailFields}>
              {EDIT_FIELDS.map((f) => (
                <ReadOnlyField key={f.key} field={f} stock={stock} />
              ))}
            </div>
          </div>
        )}
      </Card>
    </section>
  );
}
