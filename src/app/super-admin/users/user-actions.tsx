"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toaster";
import { approveEmployee, rejectEmployee, setUserActive } from "./actions";

export function PendingRowActions({ userId, name }: { userId: string; name: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  return (
    <div style={{ display: "flex", gap: "0.5rem" }}>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await approveEmployee(userId);
            if (r.ok) {
              toast({ title: "Approved", description: `${name} can now sign in.`, variant: "success" });
              router.refresh();
            } else {
              toast({ title: "Approval failed", description: r.error ?? "Try again.", variant: "error" });
            }
          })
        }
        style={btnPrimary}
      >
        Approve
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm(`Reject ${name}? They will not be able to sign in.`)) return;
          start(async () => {
            const r = await rejectEmployee(userId);
            if (r.ok) {
              toast({ title: "Rejected", description: `${name} was rejected.`, variant: "success" });
              router.refresh();
            } else {
              toast({ title: "Rejection failed", description: r.error ?? "Try again.", variant: "error" });
            }
          });
        }}
        style={btnDanger}
      >
        Reject
      </button>
    </div>
  );
}

export function ActiveToggle({
  userId,
  name,
  isActive,
}: {
  userId: string;
  name: string;
  isActive: boolean;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!isActive) {
          start(async () => {
            const r = await setUserActive(userId, true);
            if (r.ok) {
              toast({ title: "Reactivated", description: `${name} is active again.`, variant: "success" });
              router.refresh();
            } else {
              toast({ title: "Failed", description: r.error ?? "Try again.", variant: "error" });
            }
          });
          return;
        }
        if (!confirm(`Deactivate ${name}? They will be signed out immediately.`)) return;
        start(async () => {
          const r = await setUserActive(userId, false);
          if (r.ok) {
            toast({ title: "Deactivated", description: `${name} was signed out.`, variant: "success" });
            router.refresh();
          } else {
            toast({ title: "Failed", description: r.error ?? "Try again.", variant: "error" });
          }
        });
      }}
      style={isActive ? btnDanger : btnPrimary}
    >
      {isActive ? "Deactivate" : "Reactivate"}
    </button>
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
