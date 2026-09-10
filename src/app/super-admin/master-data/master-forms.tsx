"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toaster";
import { SubmitButton } from "@/components/ui/submit-button";
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
  createUnit,
  importCatalogFromExcel,
  setCatalogStatus,
  setUnitStatus,
  updateCatalogEntry,
} from "./actions";

const inputStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: "0.375rem",
  border: "1px solid var(--color-navy-300)",
  padding: "0.5rem 0.75rem",
  fontSize: "0.875rem",
};

const rowStyle: React.CSSProperties = {
  display: "grid",
  gap: "0.75rem",
  gridTemplateColumns: "repeat(auto-fit, minmax(10rem, 1fr))",
  alignItems: "end",
};

export function AddUnitForm() {
  const [state, formAction] = useActionState(createUnit, { ok: false });
  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1rem" }}>
      <div style={rowStyle}>
        <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>
          Unit name *
          <input name="name" required placeholder="e.g. piece" style={inputStyle} />
        </label>
        <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>
          Abbreviation
          <input name="abbreviation" placeholder="e.g. pc" style={inputStyle} />
        </label>
        <div>
          <SubmitButton variant="primary" pendingLabel="Adding…">
            Add unit
          </SubmitButton>
        </div>
      </div>
      {state?.error && <p style={{ fontSize: "0.8125rem", color: "#b91c1c" }}>{state.error}</p>}
    </form>
  );
}

export function UnitToggle({ id, name, isActive }: { id: string; name: string; isActive: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (isActive && !confirm(`Deactivate unit "${name}"? Blocked if it is in use.`)) return;
        start(async () => {
          const r = await setUnitStatus(id, isActive ? "inactive" : "active");
          if (r.ok) {
            toast({ title: isActive ? "Deactivated" : "Reactivated", variant: "success" });
            router.refresh();
          } else {
            toast({ title: "Failed", description: r.error ?? "Try again.", variant: "error" });
          }
        });
      }}
      style={smallBtn(isActive)}
    >
      {isActive ? "Deactivate" : "Reactivate"}
    </button>
  );
}

export function AddCatalogForm() {
  const [state, formAction] = useActionState(createCatalogEntry, { ok: false });
  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1rem" }}>
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
      <div>
        <SubmitButton variant="primary" pendingLabel="Adding…">
          Add catalog entry
        </SubmitButton>
      </div>
      {state?.error && <p style={{ fontSize: "0.8125rem", color: "#b91c1c" }}>{state.error}</p>}
      {state?.ok && <p style={{ fontSize: "0.8125rem", color: "#166534" }}>Entry added.</p>}
    </form>
  );
}

export function CatalogToggle({ id, code, isActive }: { id: string; code: string; isActive: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (isActive && !confirm(`Deactivate ${code}? Blocked if it is referenced by assets or deliveries.`)) return;
        start(async () => {
          const r = await setCatalogStatus(id, isActive ? "inactive" : "active");
          if (r.ok) {
            toast({ title: isActive ? "Deactivated" : "Reactivated", variant: "success" });
            router.refresh();
          } else {
            toast({ title: "Failed", description: r.error ?? "Try again.", variant: "error" });
          }
        });
      }}
      style={smallBtn(isActive)}
    >
      {isActive ? "Deactivate" : "Reactivate"}
    </button>
  );
}

export function CatalogEdit({
  id,
  title,
  name,
  type,
  description,
}: {
  id: string;
  title: string;
  name: string | null;
  type: string;
  description: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [t, setT] = useState(title);
  const [n, setN] = useState(name ?? "");
  const [y, setY] = useState(type);
  const [d, setD] = useState(description ?? "");
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} style={smallBtn(false)}>
        Edit
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-white sm:max-w-md dark:bg-white">
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
            <button type="button" onClick={() => setOpen(false)} style={smallBtn(true)}>
              Cancel
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await updateCatalogEntry(id, { account_title: t, account_name: n || null, asset_type: y, description: d || null });
                  if (r.ok) {
                    toast({ title: "Saved", variant: "success" });
                    setOpen(false);
                    router.refresh();
                  } else {
                    toast({ title: "Save failed", description: r.error ?? "Try again.", variant: "error" });
                  }
                })
              }
              style={smallBtn(false)}
            >
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
  const { toast } = useToast();
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
      toast({
        title: "Import complete",
        description: `${result.created ?? 0} added · ${result.skipped ?? 0} skipped`,
        variant: "success",
      });
      router.refresh();
    }
  }, [result, router, toast]);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={smallBtn(false)}>
        Import Excel
      </button>
    );
  }

  return (
    <>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-white sm:max-w-xl dark:bg-white">
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
        <DialogContent className="max-h-[90vh] overflow-y-auto bg-white sm:max-w-xl dark:bg-white">
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
