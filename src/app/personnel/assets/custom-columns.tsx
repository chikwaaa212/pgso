"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
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
import { useCachedAction } from "@/hooks/use-cached-action";
import { CLIENT_CACHE_KEYS } from "@/lib/client-cache";
import {
  createCustomField,
  deleteCustomField,
  getCustomFields,
  setCustomValue,
  type CustomFieldDef,
  type CustomFieldType,
} from "./custom-fields";
import type { UnifiedAssetRow } from "./actions";
import assetStyles from "./page.module.css";

const FIELD_TYPE_OPTIONS: { value: CustomFieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
];

/**
 * Shared custom-column model for the personnel + admin asset registries:
 * definitions are cached client-side (same SWR policy as the lists) and
 * refreshed after add / delete.
 */
export function useCustomFields() {
  const {
    data: fields,
    loading,
    refresh,
  } = useCachedAction(CLIENT_CACHE_KEYS.assetCustomFields, getCustomFields, {
    staleTime: 300_000,
  });
  return { fields: fields ?? [], loadingFields: loading, refreshFields: refresh };
}

export function formatCustomValue(def: CustomFieldDef, raw: string): string {
  if (!raw) return "—";
  if (def.type === "date") {
    const d = new Date(`${raw}T00:00:00`);
    if (Number.isNaN(d.getTime())) return raw;
    return d.toLocaleDateString("en-PH", {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "Asia/Manila",
    });
  }
  return raw;
}

/** Searchable text for a row's custom values (same haystack pattern). */
export function customSearchText(row: UnifiedAssetRow): string {
  const bag = row.custom_fields ?? {};
  return Object.values(bag).join(" ");
}

/**
 * Add-column dialog: name + type form plus the existing custom columns
 * with two-click delete. Used identically on both registries.
 */
export function AddColumnDialog({
  onSuccess,
  triggerClassName,
}: {
  onSuccess?: () => void;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [fieldType, setFieldType] = useState<CustomFieldType>("text");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const { fields, refreshFields } = useCustomFields();

  function reset() {
    setLabel("");
    setFieldType("text");
    setError("");
    setConfirmKey(null);
  }

  function submit() {
    setError("");
    startTransition(async () => {
      const res = await createCustomField({ label, field_type: fieldType });
      if (res.success) {
        reset();
        setOpen(false);
        refreshFields();
        onSuccess?.();
      } else {
        setError(res.error ?? "Failed to add the column.");
      }
    });
  }

  function remove(key: string) {
    if (confirmKey !== key) {
      setConfirmKey(key);
      return;
    }
    setConfirmKey(null);
    setError("");
    startTransition(async () => {
      const res = await deleteCustomField(key);
      if (res.success) {
        refreshFields();
        onSuccess?.();
      } else {
        setError(res.error ?? "Failed to delete the column.");
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          reset();
          setOpen(true);
        }}
        className={triggerClassName}
      >
        <Plus size={14} aria-hidden="true" />
        Add column
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) reset();
        }}
      >
        <DialogContent className="pgso-no-scrollbar bg-white sm:max-w-md dark:bg-white">
          <DialogHeader>
            <DialogTitle>Custom columns</DialogTitle>
            <DialogDescription>
              Add an extra field to assets — it is stored in the database
              and shows for personnel and admin alike. It appears in the
              Additional Details section of each asset&apos;s detail page —
              open any asset to fill in values.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="custom-col-label">Column name</Label>
              <Input
                id="custom-col-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Warranty expiry"
                maxLength={80}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="custom-col-type">Type</Label>
              <Select
                value={fieldType}
                onValueChange={(v) => setFieldType(v as CustomFieldType)}
              >
                <SelectTrigger id="custom-col-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {error ? (
              <p className="text-sm font-medium text-red-700">{error}</p>
            ) : null}
            <Button
              type="button"
              disabled={pending || !label.trim()}
              onClick={submit}
              className="h-8 rounded-[4px] px-3.5 text-xs font-semibold"
            >
              {pending ? "Adding…" : "Add column"}
            </Button>
          </div>
          {fields.length > 0 ? (
            <div className="grid gap-1.5">
              <p className="text-xs font-semibold tracking-wide text-navy-500 uppercase">
                Existing columns
              </p>
              <ul className="grid gap-1">
                {fields.map((f) => (
                  <li
                    key={f.key}
                    className="flex items-center justify-between gap-2 rounded-md border border-navy-200 px-2.5 py-1.5 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {f.label}
                      <span className="ml-1.5 text-xs text-navy-500">
                        {f.type}
                      </span>
                    </span>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => remove(f.key)}
                      className={`inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs font-semibold ${
                        confirmKey === f.key
                          ? "border-red-300 bg-red-50 text-red-700"
                          : "border-navy-200 text-navy-700 hover:bg-navy-100"
                      }`}
                      aria-label={
                        confirmKey === f.key
                          ? `Confirm delete of ${f.label}`
                          : `Delete ${f.label}`
                      }
                    >
                      <Trash2 size={13} aria-hidden="true" />
                      {confirmKey === f.key ? "Sure?" : "Delete"}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              className="h-8 rounded-[4px] px-3.5 text-xs font-semibold"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Inline custom-value cell: click to edit (Enter / blur commits,
 * Escape cancels), same editor on both registries.
 */
export function CustomCell({
  row,
  field,
  onSaved,
  startEditing = false,
}: {
  row: UnifiedAssetRow;
  field: CustomFieldDef;
  onSaved: () => void;
  /** Renders the input directly (used in the detail page's Edit mode). */
  startEditing?: boolean;
}) {
  const raw = row.custom_fields?.[field.key] ?? "";
  const [editing, setEditing] = useState(startEditing);
  const [val, setVal] = useState(raw);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  function commit(next: string) {
    if (next.trim() === raw.trim()) {
      setEditing(startEditing);
      return;
    }
    setSaving(true);
    setFailed(false);
    void setCustomValue({
      source: row.source,
      id: row.id,
      key: field.key,
      value: next,
    }).then((res) => {
      setSaving(false);
      if (res.success) {
        // In Edit mode the input stays open so all fields look editable.
        setEditing(startEditing);
        onSaved();
      } else {
        setFailed(true);
        setVal(raw);
      }
    });
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setVal(raw);
          setFailed(false);
          setEditing(true);
        }}
        title={raw ? `Edit ${field.label}` : `Add ${field.label}`}
        aria-label={raw ? `Edit ${field.label}` : `Add ${field.label}`}
        className="block max-w-44 truncate text-left hover:underline"
        style={{ opacity: saving ? 0.5 : 1 }}
      >
        {raw ? (
          formatCustomValue(field, raw)
        ) : (
          <span style={{ color: "var(--color-navy-400)" }}>—</span>
        )}
      </button>
    );
  }

  return (
    <input
      autoFocus
      type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
      value={val}
      disabled={saving}
      onChange={(e) => {
        setVal(e.target.value);
        setFailed(false);
      }}
      onBlur={() => commit(val)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setVal(raw);
          setEditing(startEditing);
        }
      }}
      onClick={(e) => e.stopPropagation()}
      aria-label={`${field.label} value`}
      title={failed ? "Could not save — check the value and try again." : field.label}
      style={{
        width: "9rem",
        border: `1px solid ${failed ? "#f87171" : "var(--color-navy-300)"}`,
        borderRadius: "0.375rem",
        padding: "0.25rem 0.5rem",
        fontSize: "0.8125rem",
      }}
    />
  );
}

/** Header cells for the custom columns (appended after Created). */
export function CustomHeaderCells({ fields }: { fields: CustomFieldDef[] }) {
  return (
    <>
      {fields.map((f) => (
        <th key={f.key} className={assetStyles.colBase}>
          {f.label}
        </th>
      ))}
    </>
  );
}

/** Body cells for the custom columns (same order as the headers). */
export function CustomRowCells({
  row,
  fields,
  onSaved,
}: {
  row: UnifiedAssetRow;
  fields: CustomFieldDef[];
  onSaved: () => void;
}) {
  return (
    <>
      {fields.map((f) => (
        <td
          key={f.key}
          className={assetStyles.colBase}
          onClick={(e) => e.stopPropagation()}
        >
          <CustomCell row={row} field={f} onSaved={onSaved} />
        </td>
      ))}
    </>
  );
}

/**
 * Additional-details section for the asset detail page: every custom
 * column renders as a labelled field with the same click-to-edit cell.
 * Returns null when no custom columns exist yet.
 */
export function CustomDetailSection({
  row,
  readOnly = false,
  editMode = false,
}: {
  row: UnifiedAssetRow;
  readOnly?: boolean;
  /** Renders every field as a direct input (used in Edit mode). */
  editMode?: boolean;
}) {
  const { fields } = useCustomFields();
  const router = useRouter();
  if (fields.length === 0) return null;
  return (
    <div className="mb-6 last:mb-0">
      <h3 className={assetStyles.sectionTitle}>Additional Details</h3>
      <div className={assetStyles.detailFields}>
        {fields.map((f) => (
          <div key={f.key} className={assetStyles.detailField}>
            <span className={assetStyles.detailLabel}>{f.label}</span>
            <span className={assetStyles.detailValue}>
              {readOnly ? (
                formatCustomValue(f, row.custom_fields?.[f.key] ?? "")
              ) : (
                <CustomCell
                  row={row}
                  field={f}
                  onSaved={() => router.refresh()}
                  startEditing={editMode}
                />
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
