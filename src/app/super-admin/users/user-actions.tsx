"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ActionButton } from "@/components/ui/action-button";
import { setUserActive } from "./actions";

export function ActiveToggle({
  userId,
  name,
  isActive,
  onSuccess,
}: {
  userId: string;
  name: string;
  isActive: boolean;
  onSuccess?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);

  const runToggle = async (active: boolean) => {
    setBusy(true);
    try {
      const r = await setUserActive(userId, active);
      if (r.ok) {
        setDeactivateOpen(false);
        toast.success(active ? "Reactivated" : "Deactivated", {
          description: active ? `${name} is active again.` : `${name} was signed out.`,
          duration: 2000,
          closeButton: true,
        });
        onSuccess?.();
      } else {
        toast.error("Failed", { description: r.error ?? "Try again.", duration: 2000, closeButton: true });
      }
    } finally {
      setBusy(false);
    }
  };

  // Reactivate has no confirmation — its own spinner prevents double-clicks.
  if (!isActive) {
    return (
      <ActionButton
        onClick={() => runToggle(true)}
        loadingLabel="Reactivating…"
        disabled={busy}
        style={btnPrimary}
      >
        Reactivate
      </ActionButton>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setDeactivateOpen(true)}
        style={btnDanger}
      >
        Deactivate
      </button>

      <Dialog open={deactivateOpen} onOpenChange={(open) => !busy && setDeactivateOpen(open)}>
        <DialogContent className="bg-white sm:max-w-md dark:bg-white">
          <DialogHeader>
            <DialogTitle>Deactivate account?</DialogTitle>
            <DialogDescription>
              {name} will be signed out immediately and won&apos;t be able to
              sign in until reactivated.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setDeactivateOpen(false)}
              style={btnSecondary}
            >
              Cancel
            </button>
            <ActionButton
              onClick={() => runToggle(false)}
              loadingLabel="Deactivating…"
              disabled={busy}
              style={btnDanger}
            >
              Confirm deactivate
            </ActionButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const btnPrimary: React.CSSProperties = {
  padding: "0.375rem 0.75rem",
  fontSize: "0.75rem",
  fontWeight: 600,
  borderRadius: "0.375rem",
  border: "1px solid var(--color-navy-600)",
  background: "var(--color-navy-900)",
  color: "#fff",
  cursor: "pointer",
};

const btnDanger: React.CSSProperties = {
  ...btnPrimary,
  border: "1px solid #b91c1c",
  background: "#fff",
  color: "#b91c1c",
};

const btnSecondary: React.CSSProperties = {
  ...btnPrimary,
  border: "1px solid var(--color-navy-200)",
  background: "transparent",
  color: "var(--color-navy-700)",
};
