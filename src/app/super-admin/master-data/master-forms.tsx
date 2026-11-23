"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArchiveRestore, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/ui/action-button";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  CLIENT_CACHE_KEYS,
  bustClientCache,
} from "@/lib/client-cache";
import { resourcePrefix } from "@/lib/query-keys";
import {
  MASTER_DATA_ARCHIVE_RETENTION_DAYS,
  archiveDaysLeft,
} from "@/lib/master-data-archive";
import pageStyles from "./page.module.css";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createCatalogEntry,
  createDepartment,
  createStockType,
  createUnit,
  importCatalogFromExcel,
  setCatalogStatus,
  setDepartmentStatus,
  setStockTypeStatus,
  setUnitStatus,
  updateCatalogEntry,
  type CatalogRow,
  type DeletedMasterData,
  type DepartmentRow,
  type MasterDataKind,
  type RestoreSelection,
  type StockTypeRow,
  type UnitRow,
} from "./actions";

const MASTER_DATA_CACHE_KEYS = [
  CLIENT_CACHE_KEYS.adminMasterData,
  resourcePrefix("super-admin", "master-data"),
  "pgso:master-data:active",
];

/** Temporary client-side id for a row that is still being saved. */
function optimisticId() {
  return `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Friendly, non-technical fallback for a failed background save. */
export function failureDescription(error?: string) {
  if (!error) return "Please check your connection and try again.";
  if (/already exists/i.test(error)) return error;
  if (error.length > 140 || /prisma|sql|DATABASE|stack|ECONN|table is not ready/i.test(error)) {
    return "Something went wrong on our side. Please try again in a moment.";
  }
  return error;
}

interface OptimisticListProps<T> {
  triggerClassName?: string;
  /** Paint the new row immediately (dialog already closed). */
  onAdd?: (row: T) => void;
  /** Remove the optimistic row when the background save fails. */
  onRollback?: (tempId: string) => void;
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: "32px",
  borderRadius: "0.375rem",
  border: "1px solid var(--color-navy-300)",
  padding: "0.375rem 0.75rem",
  fontSize: "0.875rem",
};

// Dialog action: compact 24px yellow button matching the empty-card actions.
const dialogActionButton =
  "h-6 gap-1 rounded-[4px] border border-yellow-600 bg-yellow-500 px-2.5 text-[0.6875rem] font-semibold text-navy-900 hover:bg-yellow-600 hover:text-navy-900";

const rowStyle: React.CSSProperties = {
  display: "grid",
  gap: "0.75rem",
  gridTemplateColumns: "repeat(auto-fit, minmax(10rem, 1fr))",
  alignItems: "end",
};

export function AddUnitForm({ triggerClassName, onAdd, onRollback }: OptimisticListProps<UnitRow>) {
  const [open, setOpen] = useState(false);

  // Close + paint immediately, save in the background; roll back on failure.
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const tempId = optimisticId();
    onAdd?.({
      id: tempId,
      name: String(formData.get("name") ?? "").trim().toLowerCase(),
      abbreviation: String(formData.get("abbreviation") ?? "").trim() || null,
      status: "active",
      usage: 0,
      created_at: new Date().toISOString(),
      deleted_at: null,
    });
    form.reset();
    setOpen(false);

    const result = await createUnit({ ok: false }, formData);
    if (result.ok) {
      bustClientCache(MASTER_DATA_CACHE_KEYS);
      return;
    }
    onRollback?.(tempId);
    toast.error("Couldn't add unit", {
      description: failureDescription(result.error),
      duration: 4000,
      closeButton: true,
    });
  }

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className={triggerClassName ?? dialogActionButton}
      >
        Add unit
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={`bg-white sm:max-w-md dark:bg-white ${pageStyles.interFont}`}>
          <DialogHeader>
            <DialogTitle>Add unit</DialogTitle>
            <DialogDescription>
              Lowercase canonical names (e.g. piece, set, box). Abbreviations
              optional.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div style={rowStyle}>
              <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>
                Unit name *
                <input name="name" required placeholder="e.g. piece" style={inputStyle} />
              </label>
              <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>
                Abbreviation
                <input name="abbreviation" placeholder="e.g. pc" style={inputStyle} />
              </label>
            </div>
            <DialogFooter>
              <button type="submit" className={dialogActionButton}>
                Add unit
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

type StatusChangeHandler = (id: string, status: "active" | "inactive") => void;

/**
 * Optimistic status toggle: flips the button label and the row's STATUS badge
 * the moment the user confirms, runs the write in the background, and rolls
 * back + toasts if the server refuses (e.g. the record is still in use).
 */
function useOptimisticStatus(
  id: string,
  isActive: boolean,
  update: (nextActive: boolean) => Promise<{ ok: boolean; error?: string }>,
  onStatusChange?: StatusChangeHandler
) {
  const router = useRouter();
  // Override wins until the server refresh confirms the new status; a prop
  // change (authoritative value) clears it during render, no effect needed.
  const [override, setOverride] = useState<boolean | null>(null);
  const [lastProp, setLastProp] = useState(isActive);
  const [busy, setBusy] = useState(false);

  if (lastProp !== isActive) {
    setLastProp(isActive);
    setOverride(null);
  }

  const active = override ?? isActive;

  async function applyStatus() {
    if (busy) return;
    const next = !active;
    // Instant UI: flip the button and the STATUS badge before the write
    // completes. The parent patch keeps every copy of this row in sync.
    setOverride(next);
    onStatusChange?.(id, next ? "active" : "inactive");
    setBusy(true);
    const r = await update(next);
    setBusy(false);
    if (r.ok) {
      toast.success(next ? "Reactivated" : "Deactivated", { duration: 2000, closeButton: true });
      bustClientCache(MASTER_DATA_CACHE_KEYS);
      router.refresh();
    } else {
      // Roll back to the server's value.
      setOverride(null);
      onStatusChange?.(id, active ? "active" : "inactive");
      toast.error("Couldn't update status", {
        description: failureDescription(r.error),
        duration: 4000,
        closeButton: true,
      });
    }
  }

  return { active, busy, applyStatus };
}

export function UnitToggle({
  id,
  name,
  isActive,
  onStatusChange,
}: {
  id: string;
  name: string;
  isActive: boolean;
  onStatusChange?: StatusChangeHandler;
}) {
  const { confirm, confirmDialog } = useConfirm();
  const { active, busy, applyStatus } = useOptimisticStatus(
    id,
    isActive,
    (next) => setUnitStatus(id, next ? "active" : "inactive"),
    onStatusChange
  );

  return (
    <>
      <ActionButton
        disabled={busy}
        onClick={() => {
          if (!active) return applyStatus();
          confirm(
            {
              title: "Deactivate unit?",
              description: `"${name}" will be hidden from personnel pick-lists. Deactivation is blocked if it is still in use.`,
              confirmLabel: "Deactivate",
              danger: true,
            },
            applyStatus
          );
        }}
        loadingLabel={active ? "Deactivating…" : "Reactivating…"}
        style={toggleBtn(active)}
      >
        {active ? "Deactivate" : "Reactivate"}
      </ActionButton>
      {confirmDialog}
    </>
  );
}

export function AddStockTypeForm({ triggerClassName, onAdd, onRollback }: OptimisticListProps<StockTypeRow>) {
  const [open, setOpen] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const text = (key: string) => String(formData.get(key) ?? "").trim();
    const accountTitle = text("account_title");
    const tempId = optimisticId();
    onAdd?.({
      id: tempId,
      name: accountTitle,
      account_code: text("account_code") || null,
      asset_type: text("asset_type") || null,
      account_title: accountTitle || null,
      account_name: text("account_name") || null,
      description: text("description") || null,
      status: "active",
      usage: 0,
      created_at: new Date().toISOString(),
      deleted_at: null,
    });
    form.reset();
    setOpen(false);

    const result = await createStockType({ ok: false }, formData);
    if (result.ok) {
      bustClientCache(MASTER_DATA_CACHE_KEYS);
      return;
    }
    onRollback?.(tempId);
    toast.error("Couldn't add stock header", {
      description: failureDescription(result.error),
      duration: 4000,
      closeButton: true,
    });
  }

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className={triggerClassName ?? dialogActionButton}
      >
        Add stock header
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={`bg-white sm:max-w-lg dark:bg-white ${pageStyles.interFont}`}>
          <DialogHeader>
            <DialogTitle>Add stock header</DialogTitle>
            <DialogDescription>
              Stock headers group consumable supplies, like office or cleaning
              materials, under one account code.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div style={rowStyle}>
              <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>
                Account code *
                <input name="account_code" required placeholder="e.g. 1-07-05-010" style={inputStyle} />
              </label>
              <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>
                Stock type *
                <input name="asset_type" required placeholder="e.g. Office Supplies" style={inputStyle} />
              </label>
              <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>
                Account title *
                <input name="account_title" required maxLength={120} placeholder="e.g. OFFICE SUPPLIES" style={inputStyle} />
              </label>
              <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>
                Account name
                <input name="account_name" placeholder="e.g. OFFICE SUPPLY" style={inputStyle} />
              </label>
              <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>
                Description
                <input name="description" placeholder="Optional note" style={inputStyle} />
              </label>
            </div>
            <DialogFooter>
              <button type="submit" className={dialogActionButton}>
                Add stock header
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function StockTypeToggle({
  id,
  name,
  isActive,
  onStatusChange,
}: {
  id: string;
  name: string;
  isActive: boolean;
  onStatusChange?: StatusChangeHandler;
}) {
  const { confirm, confirmDialog } = useConfirm();
  const { active, busy, applyStatus } = useOptimisticStatus(
    id,
    isActive,
    (next) => setStockTypeStatus(id, next ? "active" : "inactive"),
    onStatusChange
  );

  return (
    <>
      <ActionButton
        disabled={busy}
        onClick={() => {
          if (!active) return applyStatus();
          confirm(
            {
              title: "Deactivate stock header?",
              description: `"${name}" will be hidden from deliveries and pick-lists. Deactivation is blocked while deliveries use it.`,
              confirmLabel: "Deactivate",
              danger: true,
            },
            applyStatus
          );
        }}
        loadingLabel={active ? "Deactivating…" : "Reactivating…"}
        style={toggleBtn(active)}
      >
        {active ? "Deactivate" : "Reactivate"}
      </ActionButton>
      {confirmDialog}
    </>
  );
}

export function AddCatalogForm({ triggerClassName, onAdd, onRollback }: OptimisticListProps<CatalogRow>) {
  const [open, setOpen] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const tempId = optimisticId();
    onAdd?.({
      id: tempId,
      account_code: String(formData.get("account_code") ?? "").trim(),
      account_title: String(formData.get("account_title") ?? "").trim().toUpperCase() || "GENERAL",
      account_name: String(formData.get("account_name") ?? "").trim() || null,
      asset_type: String(formData.get("asset_type") ?? "").trim() || "General",
      description: String(formData.get("description") ?? "").trim() || null,
      status: "active",
      usage: 0,
      created_at: new Date().toISOString(),
      deleted_at: null,
    });
    form.reset();
    setOpen(false);

    const result = await createCatalogEntry({ ok: false }, formData);
    if (result.ok) {
      bustClientCache(MASTER_DATA_CACHE_KEYS);
      return;
    }
    onRollback?.(tempId);
    toast.error("Couldn't add catalog entry", {
      description: failureDescription(result.error),
      duration: 4000,
      closeButton: true,
    });
  }

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className={triggerClassName ?? dialogActionButton}
      >
        Add catalog entry
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={`bg-white sm:max-w-lg dark:bg-white ${pageStyles.interFont}`}>
          <DialogHeader>
            <DialogTitle>Add catalog entry</DialogTitle>
            <DialogDescription>
              One record links code + title + name + asset type. Selecting a
              code auto-fills title and type in personnel forms.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div style={rowStyle}>
              <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>
                Account code *
                <input name="account_code" required placeholder="e.g. 1-07-05-010" style={inputStyle} />
              </label>
              <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>
                Asset type *
                <input name="asset_type" required placeholder="e.g. Machinery and Equipment" style={inputStyle} />
              </label>
              <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>
                Account title *
                <input name="account_title" required placeholder="e.g. MACHINERIES" style={inputStyle} />
              </label>
              <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>
                Account name
                <input name="account_name" placeholder="e.g. MACHINERY" style={inputStyle} />
              </label>
              <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>
                Description
                <input name="description" placeholder="Optional note" style={inputStyle} />
              </label>
            </div>
            <DialogFooter>
              <button type="submit" className={dialogActionButton}>
                Add catalog entry
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function CatalogToggle({
  id,
  code,
  isActive,
  onStatusChange,
}: {
  id: string;
  code: string;
  isActive: boolean;
  onStatusChange?: StatusChangeHandler;
}) {
  const { confirm, confirmDialog } = useConfirm();
  const { active, busy, applyStatus } = useOptimisticStatus(
    id,
    isActive,
    (next) => setCatalogStatus(id, next ? "active" : "inactive"),
    onStatusChange
  );

  return (
    <>
      <ActionButton
        disabled={busy}
        onClick={() => {
          if (!active) return applyStatus();
          confirm(
            {
              title: "Deactivate asset header?",
              description: `${code} will be hidden from pick-lists. Deactivation is blocked if it is referenced by assets or deliveries.`,
              confirmLabel: "Deactivate",
              danger: true,
            },
            applyStatus
          );
        }}
        loadingLabel={active ? "Deactivating…" : "Reactivating…"}
        style={toggleBtn(active)}
      >
        {active ? "Deactivate" : "Reactivate"}
      </ActionButton>
      {confirmDialog}
    </>
  );
}

export function CatalogEdit({
  id,
  title,
  name,
  type,
  description,
  onEdited,
}: {
  id: string;
  title: string;
  name: string | null;
  type: string;
  description: string | null;
  /** Patch the visible row immediately; call again with the old values to roll back. */
  onEdited?: (id: string, patch: Partial<CatalogRow>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [t, setT] = useState(title);
  const [n, setN] = useState(name ?? "");
  const [y, setY] = useState(type);
  const [d, setD] = useState(description ?? "");

  // Close + paint immediately, save in the background; restore on failure.
  async function handleSave() {
    const before: Partial<CatalogRow> = {
      account_title: title,
      account_name: name,
      asset_type: type,
      description,
    };
    const after: Partial<CatalogRow> = {
      account_title: t.trim().toUpperCase(),
      account_name: n.trim() || null,
      asset_type: y.trim(),
      description: d.trim() || null,
    };
    onEdited?.(id, after);
    setOpen(false);

    const r = await updateCatalogEntry(id, {
      account_title: t,
      account_name: n || null,
      asset_type: y,
      description: d || null,
    });
    if (r.ok) {
      toast.success("Changes saved", { duration: 2000, closeButton: true });
      bustClientCache(MASTER_DATA_CACHE_KEYS);
      return;
    }
    onEdited?.(id, before);
    toast.error("Couldn't save changes", {
      description: failureDescription(r.error),
      duration: 4000,
      closeButton: true,
    });
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} style={editBtn}>
        Edit
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={`bg-white sm:max-w-md dark:bg-white ${pageStyles.interFont}`}>
          <DialogHeader>
            <DialogTitle>Edit catalog entry</DialogTitle>
            <DialogDescription>
              Title is stored in uppercase. Account name is optional.
            </DialogDescription>
          </DialogHeader>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>
              Account title *
              <input
                value={t}
                onChange={(e) => setT(e.target.value)}
                aria-label="Account title"
                style={{ ...inputStyle, marginTop: "0.25rem" }}
              />
            </label>
            <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>
              Account name
              <input
                value={n}
                onChange={(e) => setN(e.target.value)}
                aria-label="Account name"
                placeholder="e.g. MACHINERY"
                style={{ ...inputStyle, marginTop: "0.25rem" }}
              />
            </label>
            <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>
              Asset type *
              <input
                value={y}
                onChange={(e) => setY(e.target.value)}
                aria-label="Asset type"
                style={{ ...inputStyle, marginTop: "0.25rem" }}
              />
            </label>
            <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>
              Description
              <input
                value={d}
                onChange={(e) => setD(e.target.value)}
                aria-label="Description"
                placeholder="Optional note"
                style={{ ...inputStyle, marginTop: "0.25rem" }}
              />
            </label>
          </div>
          <DialogFooter>
            <button type="button" onClick={handleSave} className={dialogActionButton}>
              Save
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ImportCatalogDialog() {
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [result, formAction] = useActionState(importCatalogFromExcel, {});
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  const lastToasted = useRef("");
  const [resultOpen, setResultOpen] = useState(false);

  // Side effects belong in an effect — never toast/refresh during render.
  // The full per-row report opens in a popup modal (not inline text).
  useEffect(() => {
    if (!result || (!result.ok && !result.error)) return;
    const key = `${result.ok}|${result.created ?? 0}|${result.skipped ?? 0}|${result.error ?? ""}`;
    if (lastToasted.current === key) return;
    lastToasted.current = key;
    setResultOpen(true);
    if (result.ok) {
      toast.success("Import complete", {
        description: `${result.created ?? 0} added · ${result.skipped ?? 0} skipped`,
        duration: 2000,
        closeButton: true,
      });
      bustClientCache([CLIENT_CACHE_KEYS.adminMasterData, resourcePrefix("super-admin", "master-data"), "pgso:master-data:active"]);
      router.refresh();
    } else if (result.error) {
      toast.error("Import failed", {
        description: result.error,
        duration: 2000,
        closeButton: true,
      });
    }
  }, [result, router]);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={dialogActionButton}>
        Import Excel
      </button>
    );
  }

  return (
    <>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className={`max-h-[90dvh] overflow-y-auto bg-white sm:max-w-xl dark:bg-white ${pageStyles.interFont}`}>
        <DialogHeader>
          <DialogTitle>Import account catalog from Excel</DialogTitle>
          <DialogDescription>
            Upload the template or the client&apos;s existing file — only columns
            matching ACCOUNT CODE, ASSET TYPE, ACCOUNT TITLE, ACCOUNT NAME are read
            (any order; extra columns ignored).
          </DialogDescription>
        </DialogHeader>
        <p style={{ fontSize: "0.8125rem", color: "var(--color-navy-600)" }}>
          Each row is checked: duplicates — repeated in the file or already in the
          catalog — are skipped with a message; only new codes are added. Imports
          never overwrite existing records.
        </p>
        <p style={{ fontSize: "0.8125rem", color: "var(--color-navy-600)" }}>
          <strong>1 · Get the template</strong> from <strong>Download Templates</strong> in the
          sidebar (Account Catalog Import Template).
        </p>
        <form
          ref={formRef}
          action={formAction}
          style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
        >
          <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>
            2 · Upload the filled file
            <input
              name="file"
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              required
              style={{ ...inputStyle, marginTop: "0.25rem" }}
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
            />
          </label>
          {fileName ? <p style={{ fontSize: "0.75rem", color: "var(--color-navy-600)" }}>Selected: {fileName}</p> : null}
          <p style={{ fontSize: "0.75rem", color: "var(--color-navy-500)" }}>
            Start records at row 2 · one catalog entry per row · ACCOUNT CODE required · max 10 MB.
          </p>
          {(result?.ok || result?.error) && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.5rem",
                border: "1px solid var(--color-navy-200)",
                borderRadius: "0.375rem",
                padding: "0.5rem 0.75rem",
                fontSize: "0.8125rem",
                background: "#fff",
              }}
            >
              <span>
                {result?.ok ? (
                  <strong>
                    {result.created ?? 0} added
                    {(result.skipped ?? 0) > 0 ? ` · ${result.skipped} skipped` : ""}
                  </strong>
                ) : (
                  <strong style={{ color: "#b91c1c" }}>No new rows added</strong>
                )}
              </span>
              <button type="button" onClick={() => setResultOpen(true)} style={smallBtn(false)}>
                View details
              </button>
            </div>
          )}
          <DialogFooter>
            <button type="button" onClick={() => setOpen(false)} style={smallBtn(true)}>
              {result?.ok ? "Close" : "Cancel"}
            </button>
            <SubmitButton variant="primary" pendingLabel="Importing…">
              Import file
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

      <Dialog open={resultOpen} onOpenChange={setResultOpen}>
        <DialogContent className={`max-h-[90dvh] overflow-y-auto bg-white sm:max-w-xl dark:bg-white ${pageStyles.interFont}`}>
          <DialogHeader>
            <DialogTitle>{result?.ok ? "Import complete" : "Nothing imported"}</DialogTitle>
            <DialogDescription>
              {result?.ok
                ? "Only new account codes were added — duplicates were skipped per row below."
                : (result?.error ??
                  "No rows were imported. See the per-row report below.")}
            </DialogDescription>
          </DialogHeader>

          <div
            className={
              result?.ok
                ? "rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900"
                : "rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
            }
          >
            <p className="font-semibold">
              {result?.ok ? (
                <>
                  {result.created ?? 0} added
                  {(result.skipped ?? 0) > 0 ? ` · ${result.skipped} skipped` : ""}
                </>
              ) : (
                <>{result?.skipped ?? 0} {(result?.skipped ?? 0) === 1 ? "row" : "rows"} skipped</>
              )}
            </p>
            {(result?.matched?.length ?? 0) > 0 && (
              <p className="mt-1 text-xs">Columns read: {result!.matched!.join(", ")}</p>
            )}
          </div>

          {(result?.errors?.length ?? 0) > 0 ? (
            <div className="grid gap-1.5">
              <p className="text-sm font-semibold text-navy-900">Per-row report</p>
              <ul className="max-h-64 list-disc overflow-y-auto rounded-md border border-navy-200 bg-navy-50 py-2 pr-3 pl-8 text-xs text-navy-800">
                {result!.errors!.map((m, i) => (
                  <li key={i} className="py-0.5">
                    {m}
                  </li>
                ))}
              </ul>
              {(result?.omitted ?? 0) > 0 && (
                <p className="text-xs text-navy-600">…and {result!.omitted} more rows not shown.</p>
              )}
            </div>
          ) : null}

          <DialogFooter>
            <button type="button" onClick={() => setResultOpen(false)} style={smallBtn(false)}>
              Close
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AddDepartmentForm({ triggerClassName, onAdd, onRollback }: OptimisticListProps<DepartmentRow>) {
  const [open, setOpen] = useState(false);

  // Close + paint immediately, save in the background; roll back on failure.
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const tempId = optimisticId();
    onAdd?.({
      id: tempId,
      name: String(formData.get("name") ?? "").trim(),
      description: String(formData.get("description") ?? "").trim() || null,
      status: "active",
      usage: 0,
      created_at: new Date().toISOString(),
      deleted_at: null,
    });
    form.reset();
    setOpen(false);

    const result = await createDepartment({ ok: false }, formData);
    if (result.ok) {
      bustClientCache(MASTER_DATA_CACHE_KEYS);
      return;
    }
    onRollback?.(tempId);
    toast.error("Couldn't add department", {
      description: failureDescription(result.error),
      duration: 4000,
      closeButton: true,
    });
  }

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className={triggerClassName ?? dialogActionButton}
      >
        Add department
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={`bg-white sm:max-w-md dark:bg-white ${pageStyles.interFont}`}>
          <DialogHeader>
            <DialogTitle>Add department</DialogTitle>
            <DialogDescription>
              Departments are saved to the database. Personnel pick their
              assigned department from the account menu.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>
              Department name *
              <input name="name" required maxLength={120} placeholder="e.g. General Services" style={{ ...inputStyle, marginTop: "0.25rem" }} />
            </label>
            <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>
              Description
              <input name="description" placeholder="Optional note" style={{ ...inputStyle, marginTop: "0.25rem" }} />
            </label>
            <DialogFooter>
              <button type="submit" className={dialogActionButton}>
                Add department
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function DepartmentToggle({
  id,
  name,
  isActive,
  onStatusChange,
}: {
  id: string;
  name: string;
  isActive: boolean;
  onStatusChange?: StatusChangeHandler;
}) {
  const { confirm, confirmDialog } = useConfirm();
  const { active, busy, applyStatus } = useOptimisticStatus(
    id,
    isActive,
    (next) => setDepartmentStatus(id, next ? "active" : "inactive"),
    onStatusChange
  );

  return (
    <>
      <ActionButton
        disabled={busy}
        onClick={() => {
          if (!active) return applyStatus();
          confirm(
            {
              title: "Deactivate department?",
              description: `"${name}" will be hidden from personnel pick-lists. Deactivation is blocked while personnel are assigned to it.`,
              confirmLabel: "Deactivate",
              danger: true,
            },
            applyStatus
          );
        }}
        loadingLabel={active ? "Deactivating…" : "Reactivating…"}
        style={toggleBtn(active)}
      >
        {active ? "Deactivate" : "Reactivate"}
      </ActionButton>
      {confirmDialog}
    </>
  );
}

function smallBtn(danger: boolean): React.CSSProperties {
  return {
    padding: "0.375rem 0.75rem",
    fontSize: "0.75rem",
    fontWeight: 600,
    borderRadius: "0.375rem",
    border: danger ? "1px solid #b91c1c" : "1px solid var(--color-navy-600)",
    background: danger ? "#fff" : "var(--color-navy-900)",
    color: danger ? "#b91c1c" : "#fff",
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}

function confirmBtn(danger: boolean): React.CSSProperties {
  return {
    height: "24px",
    padding: "0 0.625rem",
    fontSize: "0.6875rem",
    fontWeight: 600,
    lineHeight: 1,
    borderRadius: "4px",
    border: "1px solid transparent",
    background: danger ? "#dc2626" : "var(--color-navy-900)",
    color: "#fff",
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}

interface ConfirmRequest {
  title: string;
  description: string;
  confirmLabel: string;
  /** Destructive actions get a solid red confirm button. */
  danger?: boolean;
}

/**
 * In-app replacement for `window.confirm`: renders a styled dialog instead of
 * the browser alert, so confirmations match the rest of the Master Data UI.
 * Usage:
 *   const { confirm, confirmDialog } = useConfirm();
 *   confirm({ ... }, () => doSomething());
 *   return <>{...}{confirmDialog}</>;
 */
function useConfirm() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const actionRef = useRef<(() => void | Promise<void>) | null>(null);

  function confirm(next: ConfirmRequest, action: () => void | Promise<void>) {
    actionRef.current = action;
    setRequest(next);
  }

  function dismiss() {
    actionRef.current = null;
    setRequest(null);
  }

  function accept() {
    const action = actionRef.current;
    dismiss();
    void action?.();
  }

  const confirmDialog = request ? (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) dismiss();
      }}
    >
      <DialogContent
        className={`bg-white sm:max-w-md dark:bg-white ${pageStyles.interFont}`}
      >
        <DialogHeader>
          <DialogTitle>{request.title}</DialogTitle>
          <DialogDescription className="text-xs">{request.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button type="button" onClick={accept} style={confirmBtn(request.danger ?? false)}>
            {request.confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ) : null;

  return { confirm, confirmDialog };
}

/**
 * 24px status toggle for table rows: "Deactivate" is a solid red button with
 * a white label, "Reactivate" keeps the filled navy treatment.
 */
function toggleBtn(isActive: boolean): React.CSSProperties {
  return {
    height: "24px",
    padding: "0 0.5rem",
    fontSize: "0.6875rem",
    fontWeight: 600,
    lineHeight: 1,
    borderRadius: "4px",
    border: "none",
    background: isActive ? "#ef4444" : "var(--color-navy-900)",
    color: "#fff",
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}

/** 24px yellow "Edit" action used by table rows. */
const editBtn: React.CSSProperties = {
  height: "24px",
  padding: "0 0.5rem",
  fontSize: "0.6875rem",
  fontWeight: 600,
  lineHeight: 1,
  borderRadius: "4px",
  border: "1px solid var(--color-yellow-600)",
  background: "var(--color-yellow-500)",
  color: "var(--color-navy-900)",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

/** 24px square red-outline delete icon action used by table rows. */
const deleteBtn: React.CSSProperties = {
  width: "24px",
  height: "24px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  gap: 0,
  lineHeight: 1,
  borderRadius: "4px",
  border: "1px solid #ef4444",
  background: "#ffffff",
  color: "#b91c1c",
  cursor: "pointer",
  flexShrink: 0,
};

/**
 * Soft-delete row action: asks for confirmation, removes the row from the
 * visible list immediately (while the write is still running), then stamps
 * `deleted_at` in the background. Only failures surface a toast and put the
 * row back.
 */
export function DeleteRowButton({
  label,
  onDelete,
  onOptimisticRemove,
  onRollback,
}: {
  label: string;
  onDelete: () => Promise<{ ok: boolean; error?: string }>;
  onOptimisticRemove?: () => void;
  onRollback?: () => void;
}) {
  const router = useRouter();
  const { confirm, confirmDialog } = useConfirm();

  async function performDelete() {
    onOptimisticRemove?.();
    const r = await onDelete();
    if (r.ok) {
      bustClientCache(MASTER_DATA_CACHE_KEYS);
      toast.success("Deleted", {
        description: `"${label}" was moved to the archive and can be restored for ${MASTER_DATA_ARCHIVE_RETENTION_DAYS} days.`,
        duration: 2500,
        closeButton: true,
      });
      router.refresh();
    } else {
      onRollback?.();
      toast.error("Couldn't delete", {
        description: failureDescription(r.error),
        duration: 4000,
        closeButton: true,
      });
    }
  }

  return (
    <>
      <ActionButton
        onClick={() => {
          confirm(
            {
              title: "Delete record?",
              description: `"${label}" will be hidden from personnel pick-lists, but you can restore it from the archive for ${MASTER_DATA_ARCHIVE_RETENTION_DAYS} days.`,
              confirmLabel: "Delete",
              danger: true,
            },
            performDelete
          );
        }}
        loadingLabel={null}
        aria-label={`Delete ${label}`}
        title={`Delete ${label}`}
        style={deleteBtn}
      >
        <Trash2 size={13} aria-hidden="true" />
      </ActionButton>
      {confirmDialog}
    </>
  );
}

interface DeletedSection {
  key: MasterDataKind;
  title: string;
  rows: Array<{ id: string; primary: string; secondary?: string | null; deleted_at: string | null }>;
}

/**
 * Page-level archive: every soft-deleted record grouped per card, with
 * checkboxes for restoring many at once. Restoring is optimistic — the rows
 * move back to their cards immediately and the overlay closes; only a failed
 * background write rolls them back and shows a toast.
 *
 * Records also show how long they have left before the automatic purge, and
 * can be permanently deleted from the database immediately.
 */
export function DeletedRecordsDialog({
  deleted,
  onRestoreSelected,
  onDeletePermanently,
}: {
  deleted: DeletedMasterData;
  onRestoreSelected: (items: RestoreSelection[]) => void;
  onDeletePermanently: (items: RestoreSelection[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const { confirm, confirmDialog } = useConfirm();

  const sections: DeletedSection[] = [
    {
      key: "department",
      title: "Departments",
      rows: deleted.departments.map((d) => ({
        id: d.id,
        primary: d.name,
        secondary: d.description,
        deleted_at: d.deleted_at,
      })),
    },
    {
      key: "unit",
      title: "Units",
      rows: deleted.units.map((u) => ({
        id: u.id,
        primary: u.name,
        secondary: u.abbreviation,
        deleted_at: u.deleted_at,
      })),
    },
    {
      key: "stock_type",
      title: "Stock headers",
      rows: deleted.stockTypes.map((s) => ({
        id: s.id,
        primary: s.account_code ?? s.name,
        secondary: s.account_title ?? s.name,
        deleted_at: s.deleted_at,
      })),
    },
    {
      key: "catalog",
      title: "Asset headers",
      rows: deleted.catalog.map((c) => ({
        id: c.id,
        primary: c.account_code,
        secondary: c.account_title,
        deleted_at: c.deleted_at,
      })),
    },
  ].filter((section) => section.rows.length > 0) as DeletedSection[];

  const total = sections.reduce((n, section) => n + section.rows.length, 0);
  const keyOf = (kind: MasterDataKind, id: string) => `${kind}:${id}`;
  const isChecked = (kind: MasterDataKind, id: string) => selected.includes(keyOf(kind, id));

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setSelected([]);
  }

  function toggle(kind: MasterDataKind, id: string) {
    const key = keyOf(kind, id);
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  function toggleGroup(section: DeletedSection) {
    const keys = section.rows.map((row) => keyOf(section.key, row.id));
    const all = keys.every((key) => selected.includes(key));
    setSelected((prev) => (all ? prev.filter((k) => !keys.includes(k)) : [...new Set([...prev, ...keys])]));
  }

  function restoreSelected() {
    const items: RestoreSelection[] = selected.map((key) => {
      const idx = key.indexOf(":");
      return { kind: key.slice(0, idx) as MasterDataKind, id: key.slice(idx + 1) };
    });
    if (!items.length) return;
    onRestoreSelected(items);
    handleOpenChange(false);
  }

  function deletePermanently() {
    const items: RestoreSelection[] = selected.map((key) => {
      const idx = key.indexOf(":");
      return { kind: key.slice(0, idx) as MasterDataKind, id: key.slice(idx + 1) };
    });
    if (!items.length) return;
    const label = `${items.length} record${items.length === 1 ? "" : "s"}`;
    confirm(
      {
        title: "Permanently delete records?",
        description: `This will remove ${label} from the database forever. This cannot be undone.`,
        confirmLabel: "Delete permanently",
        danger: true,
      },
      () => {
        onDeletePermanently(items);
        handleOpenChange(false);
      }
    );
  }

  /** "Auto-deletes in 29 days" shown on each archived row. */
  function expiryLabel(deletedAt: string | null): string | null {
    const days = archiveDaysLeft(deletedAt);
    if (days === null) return null;
    if (days <= 0) return "Auto-deletes on the next cleanup";
    return `Auto-deletes in ${days} day${days === 1 ? "" : "s"}`;
  }

  if (total === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={pageStyles.deletedButton}
        aria-label={`Open archive — ${total} deleted record${total === 1 ? "" : "s"}`}
        title={`Archive — ${total} deleted record${total === 1 ? "" : "s"}`}
      >
        <ArchiveRestore size={13} aria-hidden="true" />
        <span>Archive ({total})</span>
      </button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className={`max-h-[85dvh] overflow-y-auto bg-white sm:max-w-xl dark:bg-white ${pageStyles.interFont}`}>
          <DialogHeader>
            <DialogTitle>Deleted records</DialogTitle>
            <DialogDescription>
              Select the records you want to restore, then restore them all at once. Deleted records are hidden from
              personnel pick-lists until restored, and are permanently deleted {MASTER_DATA_ARCHIVE_RETENTION_DAYS} days
              after they were removed.
            </DialogDescription>
          </DialogHeader>

          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {sections.map((section) => {
              const keys = section.rows.map((row) => keyOf(section.key, row.id));
              const all = keys.every((key) => selected.includes(key));
              const some = !all && keys.some((key) => selected.includes(key));
              return (
                <section key={section.key} style={{ border: "1px solid var(--color-navy-200)", borderRadius: "0.5rem" }}>
                  <header
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "0.75rem",
                      padding: "0.5rem 0.75rem",
                      background: "var(--color-navy-50, #f8fafc)",
                      borderBottom: "1px solid var(--color-navy-100)",
                    }}
                  >
                    <h3
                      style={{
                        margin: 0,
                        fontSize: "0.6875rem",
                        fontWeight: 700,
                        color: "var(--color-navy-900)",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      {section.title} · {section.rows.length}
                    </h3>
                    <label
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.375rem",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        color: "var(--color-navy-700, #2d4a7a)",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={all}
                        ref={(el) => {
                          if (el) el.indeterminate = some;
                        }}
                        onChange={() => toggleGroup(section)}
                      />
                      Select all
                    </label>
                  </header>
                  <ul style={{ listStyle: "none", margin: 0, padding: "0.25rem 0.75rem" }}>
                    {section.rows.map((row) => (
                      <li key={row.id} style={{ borderBottom: "1px solid var(--color-navy-100)" }}>
                        <label
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                            padding: "0.4375rem 0",
                            fontSize: "0.8125rem",
                            cursor: "pointer",
                            flexWrap: "wrap",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked(section.key, row.id)}
                            onChange={() => toggle(section.key, row.id)}
                          />
                          <span style={{ fontWeight: 600, color: "var(--color-navy-900)" }}>{row.primary}</span>
                          {row.secondary ? (
                            <span style={{ color: "var(--color-navy-500)", fontSize: "0.75rem" }}>{row.secondary}</span>
                          ) : null}
                          {expiryLabel(row.deleted_at) ? (
                            <span
                              style={{
                                marginLeft: "auto",
                                color: "#92400e",
                                fontSize: "0.6875rem",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {expiryLabel(row.deleted_at)}
                            </span>
                          ) : null}
                        </label>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={deletePermanently}
              disabled={selected.length === 0}
              style={{
                ...smallBtn(true),
                height: "24px",
                padding: "0 0.625rem",
                fontSize: "0.6875rem",
                lineHeight: 1,
                opacity: selected.length === 0 ? 0.5 : 1,
                cursor: selected.length === 0 ? "not-allowed" : "pointer",
              }}
            >
              Delete permanently ({selected.length})
            </button>
            <button
              type="button"
              onClick={restoreSelected}
              disabled={selected.length === 0}
              className={dialogActionButton}
              style={{
                opacity: selected.length === 0 ? 0.5 : 1,
                cursor: selected.length === 0 ? "not-allowed" : "pointer",
              }}
            >
              Restore selected ({selected.length})
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </>
  );
}
