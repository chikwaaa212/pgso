"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, RotateCcw, UserX } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { approveEmployee, rejectEmployee, setUserActive } from "./actions";

/** 24px table action buttons — same rhythm as Assets / Stocks rows. */
const BTN_BASE =
  "inline-flex items-center justify-center gap-1 whitespace-nowrap h-7 rounded-[4px] px-3 text-xs font-semibold transition-colors disabled:opacity-50";

const BTN_REACTIVATE = `${BTN_BASE} border border-yellow-500 bg-yellow-500 text-navy-900 hover:bg-yellow-400`;
const BTN_DEACTIVATE = `${BTN_BASE} border border-red-300 bg-white text-red-700 hover:bg-red-50`;
const BTN_APPROVE = `${BTN_BASE} border border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700`;
const BTN_REJECT = `${BTN_BASE} border border-red-300 bg-white text-red-700 hover:bg-red-50`;
const BTN_SECONDARY =
  "h-8 rounded-[4px] border border-navy-200 bg-white px-3.5 text-xs font-semibold text-navy-700 hover:bg-navy-50";

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
        className={BTN_REACTIVATE}
      >
        <RotateCcw size={13} aria-hidden="true" />
        Reactivate
      </ActionButton>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setDeactivateOpen(true)}
        className={BTN_DEACTIVATE}
      >
        <UserX size={13} aria-hidden="true" />
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
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeactivateOpen(false)}
              className={BTN_SECONDARY}
            >
              Cancel
            </Button>
            <ActionButton
              onClick={() => runToggle(false)}
              loadingLabel="Deactivating…"
              disabled={busy}
              className={BTN_DEACTIVATE}
            >
              <UserX size={13} aria-hidden="true" />
              Confirm deactivate
            </ActionButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ApprovalActions({
  userId,
  name,
  role,
  onDone,
}: {
  userId: string;
  name: string;
  role: string;
  onDone?: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const run = async (kind: "approve" | "reject") => {
    setBusy(true);
    try {
      const r =
        kind === "approve"
          ? await approveEmployee(userId)
          : await rejectEmployee(userId);
      if (r.ok) {
        toast.success(kind === "approve" ? "Approved" : "Rejected", {
          description:
            kind === "approve"
              ? `${name} (${role}) can now sign in.`
              : `${name} (${role}) was rejected.`,
          duration: 2000,
          closeButton: true,
        });
        onDone?.();
      } else {
        toast.error("Failed", {
          description: r.error ?? "Try again.",
          duration: 2000,
          closeButton: true,
        });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <ActionButton
        onClick={() => run("approve")}
        loadingLabel="Approving…"
        disabled={busy}
        className={BTN_APPROVE}
      >
        <Check size={13} aria-hidden="true" />
        Approve
      </ActionButton>
      <ActionButton
        onClick={() => run("reject")}
        loadingLabel="Rejecting…"
        disabled={busy}
        className={BTN_REJECT}
      >
        <UserX size={13} aria-hidden="true" />
        Reject
      </ActionButton>
    </span>
  );
}
