"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toaster";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { approveEmployee, rejectEmployee, setUserActive } from "./actions";

export function PendingRowActions({ userId, name, onSuccess }: { userId: string; name: string; onSuccess?: () => void }) {
  const [pending, start] = useTransition();
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleApprove = () =>
    start(async () => {
      const r = await approveEmployee(userId);
      if (r.ok) {
        setApproveOpen(false);
        toast({ title: "Approved", description: `${name} can now sign in.`, variant: "success" });
        onSuccess?.();
        router.refresh();
      } else {
        toast({ title: "Approval failed", description: r.error ?? "Try again.", variant: "error" });
      }
    });

  const handleReject = () =>
    start(async () => {
      const r = await rejectEmployee(userId);
      if (r.ok) {
        setRejectOpen(false);
        toast({ title: "Rejected", description: `${name} was rejected.`, variant: "success" });
        onSuccess?.();
        router.refresh();
      } else {
        toast({ title: "Rejection failed", description: r.error ?? "Try again.", variant: "error" });
      }
    });

  return (
    <>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          type="button"
          disabled={pending}
          onClick={() => setApproveOpen(true)}
          style={btnPrimary}
        >
          Approve
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setRejectOpen(true)}
          style={btnDanger}
        >
          Reject
        </button>
      </div>

      <Dialog open={approveOpen} onOpenChange={(open) => !pending && setApproveOpen(open)}>
        <DialogContent className="bg-white sm:max-w-md dark:bg-white">
          <DialogHeader>
            <DialogTitle>Approve account?</DialogTitle>
            <DialogDescription>
              {name} will be able to sign in as an employee. Please confirm this
              registration is legitimate.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              disabled={pending}
              onClick={() => setApproveOpen(false)}
              style={btnSecondary}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={handleApprove}
              style={btnPrimary}
            >
              {pending ? "Approving…" : "Confirm approve"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={(open) => !pending && setRejectOpen(open)}>
        <DialogContent className="bg-white sm:max-w-md dark:bg-white">
          <DialogHeader>
            <DialogTitle>Reject account?</DialogTitle>
            <DialogDescription>
              {name} will not be able to sign in. Rejected accounts become
              inactive and are signed out.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              disabled={pending}
              onClick={() => setRejectOpen(false)}
              style={btnSecondary}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={handleReject}
              style={btnDanger}
            >
              {pending ? "Rejecting…" : "Confirm reject"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

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
  const [pending, start] = useTransition();
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const runToggle = (active: boolean) =>
    start(async () => {
      const r = await setUserActive(userId, active);
      if (r.ok) {
        setDeactivateOpen(false);
        toast({
          title: active ? "Reactivated" : "Deactivated",
          description: active ? `${name} is active again.` : `${name} was signed out.`,
          variant: "success",
        });
        onSuccess?.();
        router.refresh();
      } else {
        toast({ title: "Failed", description: r.error ?? "Try again.", variant: "error" });
      }
    });

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!isActive) {
            runToggle(true);
            return;
          }
          setDeactivateOpen(true);
        }}
        style={isActive ? btnDanger : btnPrimary}
      >
        {isActive ? "Deactivate" : "Reactivate"}
      </button>

      <Dialog open={deactivateOpen} onOpenChange={(open) => !pending && setDeactivateOpen(open)}>
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
              disabled={pending}
              onClick={() => setDeactivateOpen(false)}
              style={btnSecondary}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => runToggle(false)}
              style={btnDanger}
            >
              {pending ? "Deactivating…" : "Confirm deactivate"}
            </button>
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
