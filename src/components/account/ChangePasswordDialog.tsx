"use client";

import { useMemo, useState } from "react";
import { Check, Eye, EyeOff, Loader2, X } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export interface PasswordRule {
  id: string;
  label: string;
  test: (value: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  {
    id: "length",
    label: "At least 8 characters",
    test: (v) => v.length >= 8,
  },
  {
    id: "lowercase",
    label: "One lowercase letter (a–z)",
    test: (v) => /[a-z]/.test(v),
  },
  {
    id: "uppercase",
    label: "One uppercase letter (A–Z)",
    test: (v) => /[A-Z]/.test(v),
  },
  {
    id: "number",
    label: "One number (0–9)",
    test: (v) => /[0-9]/.test(v),
  },
  {
    id: "special",
    label: "One special character (!@#$%^&*…)",
    test: (v) => /[^A-Za-z0-9]/.test(v),
  },
];

export function validatePassword(value: string): {
  valid: boolean;
  failed: PasswordRule[];
} {
  const failed = PASSWORD_RULES.filter((r) => !r.test(value));
  return { valid: failed.length === 0, failed };
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
  show,
  onToggleShow,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoComplete: string;
  show: boolean;
  onToggleShow: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          disabled={disabled}
          className="w-full pr-10"
        />
        <button
          type="button"
          onClick={onToggleShow}
          disabled={disabled}
          aria-label={show ? `Hide ${label}` : `Show ${label}`}
          aria-pressed={show}
          className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-1 text-zinc-500 transition-colors hover:text-zinc-900 disabled:opacity-50"
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  );
}

export function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const ruleStates = useMemo(
    () =>
      PASSWORD_RULES.map((rule) => ({
        ...rule,
        passed: rule.test(newPassword),
      })),
    [newPassword]
  );
  const newValid = ruleStates.every((r) => r.passed);
  const confirmMatches =
    confirmPassword.length > 0 && newPassword === confirmPassword;
  const confirmMismatch =
    confirmPassword.length > 0 && newPassword !== confirmPassword;
  const newSameAsCurrent =
    currentPassword.length > 0 &&
    newPassword.length > 0 &&
    currentPassword === newPassword;

  const canSubmit =
    currentPassword.length > 0 &&
    newValid &&
    confirmMatches &&
    !newSameAsCurrent &&
    !saving;

  function reset() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);
    setError("");
    setSaving(false);
  }

  function handleOpenChange(v: boolean) {
    if (!v && !saving) reset();
    onOpenChange(v);
  }

  async function submit() {
    if (!canSubmit) return;
    setSaving(true);
    setError("");
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const email = user?.email;
      if (!user || !email) {
        setError("Session expired. Please sign in again and retry.");
        setSaving(false);
        return;
      }

      // Verify the current password by re-authenticating. This fails fast
      // with "Invalid login credentials" when the current password is wrong.
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });
      if (signInError) {
        setError("Current password is incorrect.");
        setSaving(false);
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) {
        setError(updateError.message || "Failed to change password.");
        setSaving(false);
        return;
      }

      toast({
        title: "Password changed",
        description: "Your password was updated successfully.",
        variant: "success",
      });
      handleOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to change password.");
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="bg-white sm:max-w-md dark:bg-white">
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>
            Enter your current password, then choose a new one.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <PasswordField
            id="current-password"
            label="Current password"
            value={currentPassword}
            onChange={(v) => setCurrentPassword(v)}
            placeholder="Enter current password"
            autoComplete="current-password"
            show={showCurrent}
            onToggleShow={() => setShowCurrent((v) => !v)}
            disabled={saving}
          />

          <PasswordField
            id="new-password"
            label="New password"
            value={newPassword}
            onChange={(v) => setNewPassword(v)}
            placeholder="Enter new password"
            autoComplete="new-password"
            show={showNew}
            onToggleShow={() => setShowNew((v) => !v)}
            disabled={saving}
          />

          {/* Live password-strength checklist */}
          <ul aria-label="Password requirements" className="grid gap-1">
            {ruleStates.map((rule) => {
              const showState = newPassword.length > 0;
              const passed = showState && rule.passed;
              return (
                <li
                  key={rule.id}
                  className={cn(
                    "flex items-center gap-2 text-xs",
                    !showState
                      ? "text-zinc-500"
                      : passed
                        ? "text-green-700"
                        : "text-red-700"
                  )}
                >
                  {showState ? (
                    passed ? (
                      <Check size={14} aria-hidden="true" />
                    ) : (
                      <X size={14} aria-hidden="true" />
                    )
                  ) : (
                    <span
                      aria-hidden="true"
                      className="inline-block size-3.5 rounded-full border border-zinc-300"
                    />
                  )}
                  {rule.label}
                </li>
              );
            })}
          </ul>

          <div className="grid gap-1.5">
            <PasswordField
              id="confirm-password"
              label="Confirm new password"
              value={confirmPassword}
              onChange={(v) => setConfirmPassword(v)}
              placeholder="Re-enter new password"
              autoComplete="new-password"
              show={showConfirm}
              onToggleShow={() => setShowConfirm((v) => !v)}
              disabled={saving}
            />
            {confirmMismatch ? (
              <p role="alert" className="text-xs font-medium text-red-700">
                Passwords do not match.
              </p>
            ) : confirmMatches ? (
              <p role="status" className="text-xs font-medium text-green-700">
                Passwords match.
              </p>
            ) : null}
            {newSameAsCurrent ? (
              <p role="alert" className="text-xs font-medium text-red-700">
                New password must be different from the current password.
              </p>
            ) : null}
          </div>

          {error ? (
            <p
              role="alert"
              className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
            >
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={saving}
            className="h-8 rounded-[4px] px-3.5 text-xs font-semibold"
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canSubmit}
            onClick={() => void submit()}
            className="h-8 gap-2 rounded-[4px] px-3.5 text-xs font-semibold"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Updating…
              </>
            ) : (
              "Update password"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
