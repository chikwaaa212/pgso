"use client";

import { useEffect, useMemo, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  Boxes,
  ClipboardList,
  Copy,
  History as HistoryIcon,
  Loader2,
  Lock,
  Pencil,
  Save,
  Search,
  X,
} from "lucide-react";
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
import { classifyCondition } from "@/lib/reporting";
import { patchRowInPage } from "@/lib/list-patch";
import { updateUnifiedAsset, type AssetHistory, type EditState, type UnifiedAssetRow } from "../actions";
import { CustomDetailSection } from "../custom-columns";
import { AssetHistorySection } from "./asset-history";
import { AssetUnitsList } from "@/components/personnel/AssetUnitsList";
import styles from "../../dashboard/page.module.css";
import assetStyles from "../page.module.css";
import tabStyles from "../../inspections/air-section.module.css";
import { cn } from "@/lib/utils";

type EditFieldType = {
  key: keyof UnifiedAssetRow;
  label: string;
  type: "text" | "number" | "currency" | "date" | "textarea" | "select" | "datalist";
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
      { label: "Property No. (QR)", key: "qr_code", type: "text" },
      { label: "Identifier", key: "identifier", type: "text" },
      { label: "Account Title", key: "account_title", type: "text" },
      { label: "Account Name", key: "account_name", type: "text" },
      { label: "Asset Type", key: "category", type: "datalist" },
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
      { label: "End User", key: "end_user", type: "text" },
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

/** 24px yellow action button used across the detail header + forms. */
const ACTION_BTN = cn(
  "inline-flex items-center justify-center h-6 gap-1.5 rounded-[4px] border border-yellow-600 bg-yellow-500 px-2.5 text-[11px] font-semibold",
  "text-navy-900 no-underline opacity-[0.9] transition-colors hover:bg-yellow-400 hover:opacity-100",
  "disabled:opacity-40"
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
  if (status === "retired" || status === "not available") return "warn";
  return "info";
}

/**
 * Display status for the record: an asset with a holder (or no units left)
 * reads "Assigned", never "Available" — there is nothing left to issue.
 * Unserviceable equipment reads "Not available"; other non-available states
 * (maintenance/retired) are shown as stored.
 */
function effectiveStatus(asset: UnifiedAssetRow): string | null {
  const stored = (asset.status ?? "available").trim().toLowerCase();
  if (stored !== "available") return asset.status;
  // Unserviceable equipment is never Available — read "Not available" so the
  // badge agrees with the assignment gate (stored value stays maintenance).
  if (classifyCondition(asset.condition) === "unserviceable") return "not available";
  const qty = asset.quantity;
  if (asset.assigned_to || (typeof qty === "number" && qty <= 0)) {
    return "assigned";
  }
  return asset.status;
}

function QrCard({ asset }: { asset: UnifiedAssetRow }) {
  const { toast } = useToast();
  const code = asset.qr_code ?? asset.account_code ?? asset.id;

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast({ title: "Copied", description: "Property number copied to clipboard.", variant: "success" });
    } catch {
      toast({ title: "Copy failed", description: "Your browser blocked clipboard access.", variant: "error" });
    }
  };

  return (
    <div className={assetStyles.qrCard}>
      <div className={assetStyles.qrCardHead}>
        <span className={assetStyles.qrLabel}>Scannable tag</span>
        <button
          type="button"
          className={cn(ACTION_BTN, "px-2")}
          onClick={() => void copyCode()}
          title="Copy property number"
        >
          <Copy size={12} aria-hidden="true" />
          Copy
        </button>
      </div>
      {asset.qr_data_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={asset.qr_data_url}
          alt={`QR code for ${asset.account_code}`}
          className={assetStyles.qrImgLarge}
          width={96}
          height={96}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span className={assetStyles.qrPlaceholder}>No QR code</span>
      )}
      <p className={assetStyles.qrLabel}>Scan for details + history</p>
      <p className={assetStyles.qrValue}>{code}</p>
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

/** Fields that belong to the accountability record once an item is assigned. */
const LOCKED_WHEN_ASSIGNED = new Set<keyof UnifiedAssetRow>([
  "quantity",
  "unit",
  "status",
  "end_user",
]);

function SelectEditField({
  field,
  asset,
  disabled = false,
  noun = "asset",
  valueOverride,
  onValueChange,
}: {
  field: EditFieldType;
  asset: UnifiedAssetRow;
  disabled?: boolean;
  /** Record noun shown in placeholders ("asset" / "stock"). */
  noun?: string;
  /** Forces the selection (used when condition makes a status invalid). */
  valueOverride?: string;
  onValueChange?: (value: string | undefined) => void;
}) {
  const { key, label, options } = field;
  const rawValue = asset[key];
  const inputId = `field-${key}`;
  const rawString = rawValue !== null && rawValue !== undefined ? String(rawValue) : "";
  const [value, setValue] = useState<string | undefined>(
    rawString.trim() ? rawString : undefined
  );
  // Keep a forced value in sync (e.g. Available → Maintenance when the item
  // is marked unserviceable). Only runs when the override itself changes so a
  // manual selection is never stomped.
  useEffect(() => {
    if (valueOverride === undefined) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync forced selection
    setValue((current) => (current === valueOverride ? current : valueOverride));
  }, [valueOverride]);

  return (
    <div className={assetStyles.detailField}>
      <Label htmlFor={inputId} className={assetStyles.detailLabel}>
        {label}
      </Label>
      <Select
        value={value}
        onValueChange={(next) => {
          setValue(next);
          onValueChange?.(next);
        }}
        disabled={disabled}
      >
        <SelectTrigger
          id={inputId}
          className={cn(inputCls, disabled && "bg-navy-50")}
        >
          <SelectValue
            placeholder={
              key === "category"
                ? `Select ${noun} type`
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

function EditField({
  field,
  asset,
  disabled = false,
  noun = "asset",
  selectValueOverride,
  onSelectChange,
}: {
  field: EditFieldType;
  asset: UnifiedAssetRow;
  disabled?: boolean;
  /** Record noun shown in placeholders ("asset" / "stock"). */
  noun?: string;
  selectValueOverride?: string;
  onSelectChange?: (value: string | undefined) => void;
}) {
  const { key, label, type } = field;
  const rawValue = asset[key];
  const inputId = `field-${key}`;
  const commonProps = {
    id: inputId,
    name: key,
    defaultValue: fmtEditValue(key, rawValue),
    disabled,
  };

  if (type === "textarea") {
    return (
      <div className={assetStyles.detailField}>
        <Label htmlFor={inputId} className={assetStyles.detailLabel}>
          {label}
        </Label>
        <textarea
          {...commonProps}
          rows={3}
          className={cn(inputCls, disabled && "bg-navy-50")}
        />
      </div>
    );
  }

  if (type === "select") {
    return (
      <SelectEditField
        field={field}
        asset={asset}
        disabled={disabled}
        noun={noun}
        valueOverride={selectValueOverride}
        onValueChange={onSelectChange}
      />
    );
  }

  // Free-text with suggestions: an existing Master Data value can be picked,
  // but a new Asset Type can also be typed. The server adds it to Master Data
  // automatically, so a new type doesn't need to wait for a Super Admin.
  if (type === "datalist") {
    const listId = `${inputId}-options`;
    return (
      <div className={assetStyles.detailField}>
        <Label htmlFor={inputId} className={assetStyles.detailLabel}>
          {label}
        </Label>
        <Input
          {...commonProps}
          type="text"
          list={listId}
          className={cn(disabled && "bg-navy-50")}
        />
        <datalist id={listId}>
          {field.options?.map((opt) => (
            <option key={opt} value={opt} />
          ))}
        </datalist>
      </div>
    );
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
        className={cn(disabled && "bg-navy-50")}
      />
    </div>
  );
}

function ReadOnlyField({ field, asset }: { field: EditFieldType; asset: UnifiedAssetRow }) {
  const { key, label } = field;
  const statusValue = key === "status" ? effectiveStatus(asset) : null;
  const tone = statusTone(statusValue);
  const statusClass = assetStyles[`status${tone.charAt(0).toUpperCase() + tone.slice(1)}`];

  return (
    <div className={assetStyles.detailField}>
      <span className={assetStyles.detailLabel}>{label}</span>
      <span className={assetStyles.detailValue}>
        {key === "status" ? (
          <span className={cn(assetStyles.statusBadge, statusClass)}>
            {statusLabel(statusValue)}
          </span>
        ) : (
          fmtDisplayValue(key, asset[key])
        )}
      </span>
    </div>
  );
}

/** Shown when the field-label search matches nothing on this record. */
function FieldSearchEmpty({
  query,
  onClear,
}: {
  query: string;
  onClear: () => void;
}) {
  return (
    <div className={assetStyles.fieldSearchEmpty} role="status">
      <p className={assetStyles.fieldSearchEmptyText}>
        No field labels match “{query.trim()}”.
      </p>
      <button
        type="button"
        className={assetStyles.fieldSearchEmptyClear}
        onClick={onClear}
      >
        Clear search
      </button>
    </div>
  );
}

export function AssetDetailEditor({
  asset,
  categories,
  readOnly = false,
  backHref,
  crumbBase,
  history = null,
  noun = "asset",
}: {
  asset: UnifiedAssetRow;
  categories: string[];
  /** Hides the Edit action for oversight (read-only) views. */
  readOnly?: boolean;
  /** Overrides the back link (defaults to the personnel list). */
  backHref?: string;
  /** Leading crumb segments; omit to render no breadcrumb. */
  crumbBase?: string;
  /** Assignment + repair timeline; each event opens its receipt. */
  history?: AssetHistory | null;
  /** Record noun used in copy ("asset" on the registry, "stock" in stocks). */
  noun?: string;
}) {
  const { toast } = useToast();
  const nounLabel = noun.charAt(0).toUpperCase() + noun.slice(1);
  const [isEditing, setIsEditing] = useState(false);
  const [tab, setTab] = useState<"information" | "history">("information");
  const [isPending, startTransition] = useTransition();
  // Optimistic overlay: submitted values paint instantly (<100ms feel);
  // rolled back on failure, kept on success. Cleared on record change.
  const [optimistic, setOptimistic] = useState<Record<string, string | null> | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clear stale optimistic overlay on record change
    setOptimistic(null);
  }, [asset.id]);
  const displayed = useMemo(
    () => (optimistic ? ({ ...asset, ...optimistic } as UnifiedAssetRow) : asset),
    [asset, optimistic]
  );

  // Live draft of the condition while editing, so Status can drop "Available"
  // the moment the item is marked unserviceable (before the server round-trip).
  const [draftCondition, setDraftCondition] = useState<string | null>(asset.condition);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resync draft on record change
    setDraftCondition(asset.condition);
  }, [asset.id, asset.condition]);
  const draftUnserviceable = classifyCondition(draftCondition) === "unserviceable";

  const sections = FIELD_SECTIONS.map((s) =>
    s.fields.map((f) => {
      if (f.key === "category") return { ...f, options: categories };
      // Unserviceable equipment cannot be Available — hide that option so the
      // edit form itself enforces the rule (the server enforces it too).
      if (f.key === "status" && draftUnserviceable) {
        return { ...f, options: STATUS_OPTIONS.filter((o) => o !== "available") };
      }
      return f;
    })
  );

  // Field search: filters the labeled inputs/sections in place. Pure client
  // state — no fetch, no debounce, no stale results. Fields stay mounted so
  // any in-progress edits survive while filtering.
  const [fieldQuery, setFieldQuery] = useState("");
  const fieldNeedle = fieldQuery.trim().toLowerCase();
  const fieldMatches = useMemo(() => {
    const perSection = FIELD_SECTIONS.map((s) => {
      const sectionHit =
        fieldNeedle !== "" && s.title.toLowerCase().includes(fieldNeedle);
      const hits = s.fields.map(
        (f) =>
          fieldNeedle === "" ||
          sectionHit ||
          f.label.toLowerCase().includes(fieldNeedle) ||
          String(f.key).replace(/_/g, " ").includes(fieldNeedle)
      );
      const matched = hits.filter(Boolean).length;
      return { hits, matched, total: s.fields.length };
    });
    return {
      perSection,
      total: perSection.reduce((n, s) => n + s.matched, 0),
      active: fieldNeedle !== "",
    };
  }, [fieldNeedle]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    // Snapshot submitted values as the optimistic overlay ("" → null matches
    // the server's normalization, so the display converges on save).
    const overrides: Record<string, string | null> = {};
    for (const [k, v] of formData.entries()) {
      if (k === "id" || k === "source") continue;
      const s = typeof v === "string" ? v.trim() : "";
      overrides[k] = s === "" ? null : s.slice(0, 500);
    }
    // Mirror the server rule locally so the optimistic read view is already
    // consistent: unserviceable equipment cannot stay Available.
    const nowUnserviceable = classifyCondition(overrides.condition) === "unserviceable";
    if (nowUnserviceable && (overrides.status ?? "").toLowerCase() === "available") {
      overrides.status = "maintenance";
    }
    // Optimistic-first: close the editor and paint the new values right away,
    // while the server action runs in the background. On failure the overlay
    // rolls back to server truth and a message explains what happened.
    // NOTE: this must be a plain submit handler (not `<form action>`), because
    // React treats form actions as transitions and would defer these updates
    // until the server action resolves — leaving the editor open on "Saving…".
    setOptimistic(overrides);
    setIsEditing(false);
    startTransition(async () => {
      try {
        const result: EditState = await updateUnifiedAsset({} as EditState, formData);
        if (result.success) {
          toast({
            title: "Success",
            description: nowUnserviceable
              ? `${nounLabel} updated. Unserviceable items are kept in Maintenance and cannot be assigned until marked serviceable.`
              : `${nounLabel} updated successfully.`,
            variant: "success",
          });
          // Patch every cached registry window holding this row (personnel +
          // admin lists) — no refetch. Next revalidation converges any
          // server-side normalization (catalog title snap, unit canonicalization).
          void import("@/lib/client-cache").then((m) =>
            import("@/lib/query-keys").then(({ resourcePrefix }) =>
              m.patchClientCache(
                [
                  "pgso:assets:unified",
                  "pgso:admin-assets:unified",
                  resourcePrefix("personnel", "assets"),
                  resourcePrefix("super-admin", "assets"),
                ],
                (data) => patchRowInPage(data, asset.id, overrides)
              )
            )
          );
        }
        if (result.error) {
          // Roll back the optimistic overlay to server truth.
          setOptimistic(null);
          toast({
            title: "Error",
            description: result.error,
            variant: "error",
          });
        }
      } catch {
        // Network/action failure: roll back and say so instead of leaving the
        // optimistic values on screen.
        setOptimistic(null);
        toast({
          title: "Error",
          description: `Could not save ${noun}. Please try again.`,
          variant: "error",
        });
      }
    });
  };

  const displayStatus = effectiveStatus(displayed);
  const toneKey = statusTone(displayStatus);
  const statusClass = assetStyles[`status${toneKey.charAt(0).toUpperCase() + toneKey.slice(1)}`];
  // Once a unit is issued the accountability record owns the quantity, unit,
  // status and end user — editing them here would desync the PAR/ICS.
  const assigned = displayStatus === "assigned";
  const lockField = (key: keyof UnifiedAssetRow) =>
    assigned && LOCKED_WHEN_ASSIGNED.has(key);
  const historyCount = history
    ? history.issuances.length +
      history.repairs.length +
      history.requests.length +
      // A holder with no linked issuance still renders an assignment card.
      (history.assignedToName && history.issuances.length === 0 ? 1 : 0)
    : 0;
  const holderName = history?.assignedToName ?? null;
  const assignments = history?.issuances ?? [];
  const assigneeCount = new Set(assignments.map((i) => i.employee_name)).size;
  const holderNote =
    holderName === null
      ? null
      : history?.assignedToName
        ? "Current holder of this item"
        : assigneeCount > 1
          ? `Most recent of ${assignments.length} assignments · ${assigneeCount} assignees`
          : assignments.length > 1
            ? `Most recent of ${assignments.length} assignments`
            : "Assigned through PAR/ICS";
  const facts: { label: string; value: string }[] = [
    {
      label: "Record created",
      value: fmtDisplayValue("created_at", displayed.created_at),
    },
  ];

  const openHistory = () => {
    setIsEditing(false);
    setTab("history");
    // Wait for the history panel to mount before scrolling to it.
    window.requestAnimationFrame(() => {
      document
        .getElementById("asset-history")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <section className={styles.section}>
      {crumbBase ? (
        <p className={styles.crumb}>
          {crumbBase} / {displayed.account_code ?? displayed.id}
        </p>
      ) : null}

      {/* ── Identity header ─────────────────────────────────────────── */}
      <header className={assetStyles.detailHero}>
        <div className={assetStyles.detailHeroMain}>
          <span className={assetStyles.detailHeroIcon} aria-hidden="true">
            <Boxes size={22} />
          </span>
          <div className={assetStyles.detailHeroText}>
            <div className={assetStyles.detailHeroTitleRow}>
              <h1 className={assetStyles.detailHeroTitle}>
                {displayed.article ?? displayed.description ?? nounLabel}
              </h1>
              <span className={cn(assetStyles.statusBadge, statusClass)}>
                {statusLabel(displayStatus)}
              </span>
            </div>
            <div className={assetStyles.detailHeroActions}>
              {!isEditing ? (
                <Link href={backHref ?? "/personnel/assets"} className={ACTION_BTN}>
                  <ArrowLeft size={13} aria-hidden="true" />
                  Back
                </Link>
              ) : null}
              {!readOnly &&
                (isEditing ? (
                  <Button type="button" variant="primary" className={ACTION_BTN} onClick={() => setIsEditing(false)}>
                    <X size={13} aria-hidden="true" />
                    Cancel
                  </Button>
                ) : isPending ? (
                  <Button type="button" variant="primary" className={ACTION_BTN} disabled aria-busy="true">
                    <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                    Saving…
                  </Button>
                ) : (
                  <Button type="button" variant="primary" className={ACTION_BTN} onClick={() => setIsEditing(true)}>
                    <Pencil size={13} aria-hidden="true" />
                    Edit {noun}
                  </Button>
                ))}
            </div>
          </div>
        </div>

        <dl className={assetStyles.detailStats}>
          {[
            { label: "Code", value: displayed.account_code },
            {
              label: "Type",
              value: displayed.category ? statusLabel(displayed.category) : null,
            },
            {
              label: "Quantity",
              value:
                displayed.quantity !== null && displayed.quantity !== undefined
                  ? `${displayed.quantity}${displayed.unit ? ` ${displayed.unit}` : ""}`
                  : null,
            },
            { label: "Property", value: displayed.qr_code },
          ].map((stat) => (
            <div key={stat.label} className={assetStyles.detailStat}>
              <dt className={assetStyles.detailStatLabel}>{stat.label}</dt>
              <dd
                className={assetStyles.detailStatValue}
                title={stat.value ?? undefined}
              >
                {stat.value ?? "—"}
              </dd>
            </div>
          ))}
        </dl>
      </header>

      {/* ── Tabs ────────────────────────────────────────────────────── */}
      <div className={assetStyles.detailTabsBar}>
        <div className={tabStyles.tabs} role="tablist" aria-label={`${nounLabel} sections`}>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "information"}
            data-active={tab === "information"}
            className={tabStyles.tab}
            onClick={() => setTab("information")}
          >
            <ClipboardList size={13} aria-hidden="true" className="mr-1.5" />
            Information
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "history"}
            data-active={tab === "history"}
            className={tabStyles.tab}
            disabled={isEditing}
            title={isEditing ? "Save or cancel your edits first" : undefined}
            onClick={() => setTab("history")}
          >
            <HistoryIcon size={13} aria-hidden="true" className="mr-1.5" />
            History
            <span className={assetStyles.tabCount}>{historyCount}</span>
          </button>
        </div>
        <div className={assetStyles.tabTools}>
          {fieldMatches.active && tab === "information" ? (
            <span className={assetStyles.tabMeta}>
              {fieldMatches.total} field{fieldMatches.total === 1 ? "" : "s"}{" "}
              match “{fieldQuery.trim()}”
            </span>
          ) : isEditing ? (
            <span className={assetStyles.tabMeta}>
              Editing — changes apply to every record view
            </span>
          ) : null}
          {tab === "information" ? (
            <div className={assetStyles.fieldSearch}>
              <Search
                size={13}
                className={assetStyles.fieldSearchIcon}
                aria-hidden="true"
              />
              <Input
                type="search"
                value={fieldQuery}
                onChange={(e) => setFieldQuery(e.target.value)}
                placeholder="Find a field — e.g. supplier, cost, plate…"
                aria-label={`Search ${noun} fields by label`}
                className={assetStyles.fieldSearchInput}
              />
              {fieldQuery !== "" ? (
                <button
                  type="button"
                  className={assetStyles.fieldSearchClear}
                  onClick={() => setFieldQuery("")}
                  aria-label="Clear field search"
                >
                  <X size={12} aria-hidden="true" />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {tab === "history" ? (
        <div id="asset-history" className={assetStyles.tabPanel}>
          {history ? (
            <AssetHistorySection asset={displayed} history={history} embedded noun={noun} />
          ) : (
            <Card className={styles.panel}>
              <p className={styles.panelSub}>No history available for this {noun}.</p>
            </Card>
          )}
        </div>
      ) : (
        <Card className={cn(styles.panel, assetStyles.detailPanel)}>
          {isEditing ? (
            <>
              <form id="asset-edit-form" onSubmit={handleSubmit}>
                <input type="hidden" name="id" value={asset.id} />
                <input type="hidden" name="source" value={asset.source} />
                {assigned ? (
                  <p className={assetStyles.lockNotice}>
                    <Lock size={13} aria-hidden="true" />
                    <span>
                      This item is <strong>assigned</strong>. Quantity, unit,
                      status, and end user are locked to the issued PAR/ICS and
                      cannot be edited here.
                    </span>
                  </p>
                ) : null}
                {fieldMatches.active && fieldMatches.total === 0 ? (
                  <FieldSearchEmpty
                    query={fieldQuery}
                    onClear={() => setFieldQuery("")}
                  />
                ) : null}
                {sections.map((fields, i) => {
                  const match = fieldMatches.perSection[i];
                  return (
                    <div
                      key={i}
                      className="mb-6 last:mb-0"
                      hidden={match.matched === 0}
                    >
                      <h3 className={assetStyles.sectionTitle}>
                        {FIELD_SECTIONS[i].title}
                      </h3>
                      <div className={assetStyles.detailFields}>
                        {fields.map((f, idx) => (
                          <div
                            key={f.key}
                            style={
                              match.hits[idx]
                                ? { display: "contents" }
                                : { display: "none" }
                            }
                          >
                            <EditField
                              field={f}
                              asset={displayed}
                              disabled={lockField(f.key)}
                              noun={noun}
                              onSelectChange={
                                f.key === "condition"
                                  ? (value) => setDraftCondition(value ?? null)
                                  : undefined
                              }
                              selectValueOverride={
                                f.key === "status" &&
                                draftUnserviceable &&
                                (displayed.status ?? "").trim().toLowerCase() === "available"
                                  ? "maintenance"
                                  : undefined
                              }
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </form>
              <div className="mt-6">
                <CustomDetailSection row={displayed} readOnly={readOnly} editMode searchNeedle={fieldQuery} />
              </div>
              <div className={assetStyles.editActions}>
                <Button type="button" variant="outline" className={ACTION_BTN} onClick={() => setIsEditing(false)}>
                  <X size={13} aria-hidden="true" />
                  Cancel
                </Button>
                <Button
                  type="submit"
                  form="asset-edit-form"
                  variant="primary"
                  disabled={isPending}
                  aria-busy={isPending}
                  className={ACTION_BTN}
                >
                  {isPending ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <Save size={13} aria-hidden="true" />
                      Save changes
                    </>
                  )}
                </Button>
              </div>
            </>
          ) : (
            <div className={assetStyles.infoLayout}>
              <aside className={assetStyles.infoAside}>
                <QrCard asset={displayed} />
                <div className={assetStyles.qrCard}>
                  <div className={assetStyles.qrCardHead}>
                    <span className={assetStyles.qrLabel}>Per-piece tags</span>
                  </div>
                  <AssetUnitsList
                    recordId={displayed.id}
                    fallbackQr={displayed.qr_data_url}
                    fallbackCode={displayed.qr_code ?? displayed.account_code}
                  />
                </div>
              </aside>

              <div className={assetStyles.infoMain}>
                <button
                  type="button"
                  className={assetStyles.factsBanner}
                  onClick={openHistory}
                  aria-label="View assignment history"
                >
                  <span className={assetStyles.factsBannerMain}>
                    <span className={assetStyles.factsKicker}>
                      Accountability
                    </span>
                    {holderName ? (
                      <>
                        <span className={assetStyles.factsHolder}>
                          {holderName}
                        </span>
                        {holderNote ? (
                          <span className={assetStyles.factsHolderNote}>
                            {holderNote}
                          </span>
                        ) : null}
                      </>
                    ) : null}
                  </span>

                  <span className={assetStyles.factsBannerMeta}>
                    {facts.map((fact) => (
                      <span key={fact.label} className={assetStyles.factsMetaItem}>
                        <span className={assetStyles.factsMetaLabel}>
                          {fact.label}
                        </span>
                        <span className={assetStyles.factsMetaValue}>
                          {fact.value}
                        </span>
                      </span>
                    ))}
                  </span>

                  <span className={assetStyles.factsBannerCta}>
                    <HistoryIcon size={13} aria-hidden="true" />
                    View history
                    {historyCount > 0 ? (
                      <span className={assetStyles.factsCtaCount}>
                        {historyCount}
                      </span>
                    ) : null}
                    <ArrowUpRight size={12} aria-hidden="true" />
                  </span>
                </button>

                {fieldMatches.active && fieldMatches.total === 0 ? (
                  <FieldSearchEmpty
                    query={fieldQuery}
                    onClear={() => setFieldQuery("")}
                  />
                ) : null}
                {sections.map((fields, i) => {
                  const match = fieldMatches.perSection[i];
                  if (match.matched === 0) return null;
                  return (
                    <section key={i} className={assetStyles.infoSection}>
                      <div className={assetStyles.infoSectionHead}>
                        <h2 className={assetStyles.infoSectionTitle}>
                          {FIELD_SECTIONS[i].title}
                        </h2>
                        <span className={assetStyles.infoSectionCount}>
                          {fieldMatches.active
                            ? `${match.matched} of ${match.total}`
                            : match.total}{" "}
                          {match.total === 1 ? "field" : "fields"}
                        </span>
                      </div>
                      <div className={assetStyles.detailFields}>
                        {fields.map((f, idx) =>
                          match.hits[idx] ? (
                            <ReadOnlyField key={f.key} field={f} asset={displayed} />
                          ) : null
                        )}
                      </div>
                    </section>
                  );
                })}
                <CustomDetailSection
                  row={displayed}
                  readOnly={readOnly}
                  searchNeedle={fieldQuery}
                />
              </div>
            </div>
          )}
        </Card>
      )}
    </section>
  );
}
