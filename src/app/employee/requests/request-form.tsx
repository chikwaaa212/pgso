"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toaster";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { requestTypeLabel } from "@/app/personnel/requests/request-types";
import { createMyRequest } from "../actions";

const TYPES = ["transfer", "new_assignment", "repair"] as const;

const inputStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: "0.375rem",
  border: "1px solid var(--color-navy-300)",
  padding: "0.5rem 0.75rem",
  fontSize: "0.875rem",
  marginTop: "0.25rem",
};

const labelStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 600,
  display: "block",
};

export function NewRequestForm({
  assets,
  personnel,
}: {
  assets: {
    id: string;
    label: string;
    disabledReason: string | null;
    kind?: "asset" | "stock";
    quantity?: number | null;
    heldByMe?: boolean;
  }[];
  personnel: { id: string; label: string }[];
}) {
  const [type, setType] = useState<string>("new_assignment");
  const [assetId, setAssetId] = useState<string>("");
  const [recipientId, setRecipientId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const { toast } = useToast();

  const needsAsset = type === "transfer" || type === "repair";
  const isTransfer = type === "transfer";
  // Transfers move custody: only items currently assigned to this employee
  // (in their hand) can be picked — never other people's items or PGSO stock.
  const heldAssets = assets.filter((a) => a.kind === "asset" && a.heldByMe);
  const itemOptions = isTransfer ? heldAssets : assets;
  // Every delivered item is an asset; "stock" is just its quantity on hand —
  // transfer / assignment / repair can all pick either kind.
  const selected = assets.find((a) => a.id === assetId) ?? null;
  const isStockPick = selected?.kind === "stock";
  const stockMax = selected?.quantity ?? 0;

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (!recipientId) {
          setError("Select the personnel to send this request to.");
          return;
        }
        if (needsAsset && !assetId) {
          setError(
            isTransfer
              ? "Select one of your assigned items to transfer."
              : "Select an item for this request type."
          );
          return;
        }
        if (isTransfer && !heldAssets.some((a) => a.id === assetId)) {
          setError("You can only transfer items currently assigned to you.");
          return;
        }
        const fd = new FormData(e.currentTarget);
        if (type === "transfer" && isStockPick) {
          const q = Number(fd.get("quantity") || 0);
          if (!Number.isInteger(q) || q < 1) {
            setError("Enter a quantity of at least 1.");
            return;
          }
          if (q > stockMax) {
            setError(`Only ${stockMax} on hand for this stock item.`);
            return;
          }
        }
        start(async () => {
          const res = await createMyRequest({
            requestType: type,
            recipientId,
            assetId: assetId || undefined,
            quantity: Number(fd.get("quantity") || 1),
            transferTo: (fd.get("transferTo") as string) || undefined,
            newLocation: (fd.get("newLocation") as string) || undefined,
            itemNeeded: (fd.get("itemNeeded") as string) || undefined,
            reason: String(fd.get("reason") ?? ""),
          });
          if (res.success) {
            toast({ title: "Request filed", description: "PGSO personnel will review it.", variant: "success" });
            formRef.current?.reset();
            setType("new_assignment");
            setAssetId("");
            setRecipientId("");
            router.refresh();
          } else {
            setError(res.error ?? "Failed to submit the request.");
          }
        });
      }}
      style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1rem" }}
    >
      <div style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "repeat(auto-fit, minmax(12rem, 1fr))" }}>
        <span style={labelStyle}>
          Send to (personnel) *
          <Select value={recipientId || undefined} onValueChange={setRecipientId}>
            <SelectTrigger style={{ ...inputStyle, display: "flex" }} aria-label="Personnel recipient">
              <SelectValue placeholder="Select personnel…" />
            </SelectTrigger>
            <SelectContent>
              {personnel.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </span>
        <span style={labelStyle}>
          Request type *
          <Select value={type} onValueChange={(v) => { setType(v); setAssetId(""); }}>
            <SelectTrigger style={{ ...inputStyle, display: "flex" }} aria-label="Request type">
              <SelectValue placeholder="Select type…" />
            </SelectTrigger>
            <SelectContent>
              {TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {requestTypeLabel(t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </span>
        <span style={labelStyle}>
          {isTransfer
            ? "Your item (assigned to you) *"
            : needsAsset
              ? "Item (asset / stock) *"
              : "Item (asset / stock, optional)"}
          <Select value={assetId || undefined} onValueChange={setAssetId}>
            <SelectTrigger style={{ ...inputStyle, display: "flex" }} aria-label="Item">
              <SelectValue
                placeholder={
                  isTransfer
                    ? heldAssets.length > 0
                      ? "Select one of your items…"
                      : "No items assigned to you"
                    : needsAsset
                      ? "Select an item…"
                      : "No specific item"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {itemOptions.map((a) => (
                <SelectItem
                  key={a.id}
                  value={a.id}
                  disabled={isTransfer ? false : !!a.disabledReason}
                >
                  {a.label}
                  {!isTransfer && a.disabledReason ? ` — ${a.disabledReason}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isTransfer && (
            <span style={{ fontWeight: 400, fontSize: "0.6875rem", color: "var(--color-navy-500)" }}>
              Only assets currently in your hand can be transferred.
            </span>
          )}
        </span>
        {type === "transfer" && (
          <>
            <label style={labelStyle}>
              Transfer to (person / office) *
              <input name="transferTo" required placeholder="e.g. Juan Dela Cruz — Accounting" style={inputStyle} />
            </label>
            <label style={labelStyle}>
              New location
              <input name="newLocation" placeholder="Optional" style={inputStyle} />
            </label>
          </>
        )}
        {type === "new_assignment" && (
          <>
            <label style={labelStyle}>
              Item needed *
              <input name="itemNeeded" required placeholder="e.g. Laptop for new hire" style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Quantity
              <input name="quantity" type="number" min={1} defaultValue={1} style={inputStyle} />
            </label>
          </>
        )}
        {type === "transfer" && isStockPick && (
          <label style={labelStyle}>
            Quantity * <span style={{ fontWeight: 400 }}>({stockMax} on hand)</span>
            <input
              name="quantity"
              type="number"
              min={1}
              max={stockMax}
              defaultValue={1}
              style={inputStyle}
            />
          </label>
        )}
      </div>
      <label style={labelStyle}>
        Reason *
        <textarea name="reason" required rows={3} placeholder="Why do you need this?" style={inputStyle} />
      </label>
      {error && <p role="alert" style={{ fontSize: "0.8125rem", color: "#b91c1c" }}>{error}</p>}
      <div>
        <button
          type="submit"
          disabled={pending}
          style={{
            padding: "0.5rem 1.25rem",
            fontSize: "0.875rem",
            fontWeight: 600,
            borderRadius: "0.375rem",
            border: "1px solid var(--color-navy-600)",
            background: "var(--color-navy-900)",
            color: "#fff",
            cursor: pending ? "wait" : "pointer",
            opacity: pending ? 0.7 : 1,
          }}
        >
          {pending ? "Filing…" : "File request"}
        </button>
      </div>
    </form>
  );
}
