"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toaster";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  createCatalogEntry,
  createUnit,
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
          Account title *
          <input name="account_title" required placeholder="e.g. MACHINERIES" style={inputStyle} />
        </label>
        <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>
          Asset type *
          <input name="asset_type" required placeholder="e.g. Machinery and Equipment" style={inputStyle} />
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
  type,
  description,
}: {
  id: string;
  title: string;
  type: string;
  description: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [t, setT] = useState(title);
  const [y, setY] = useState(type);
  const [d, setD] = useState(description ?? "");
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={smallBtn(false)}>
        Edit
      </button>
    );
  }

  return (
    <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap", alignItems: "center" }}>
      <input value={t} onChange={(e) => setT(e.target.value)} aria-label="Account title" style={{ ...inputStyle, width: "9rem" }} />
      <input value={y} onChange={(e) => setY(e.target.value)} aria-label="Asset type" style={{ ...inputStyle, width: "11rem" }} />
      <input value={d} onChange={(e) => setD(e.target.value)} aria-label="Description" placeholder="Note" style={{ ...inputStyle, width: "8rem" }} />
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await updateCatalogEntry(id, { account_title: t, asset_type: y, description: d || null });
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
      <button type="button" onClick={() => setOpen(false)} style={smallBtn(true)}>
        Cancel
      </button>
    </div>
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
