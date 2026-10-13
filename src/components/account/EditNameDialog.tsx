"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
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

export interface EditNameResult {
  ok: boolean;
  error?: string;
  /** Canonical stored name (echoed by the server). */
  name?: string;
}

/**
 * Shared "edit my display name" dialog for every role's account menu.
 * The caller supplies the role-guarded save action; this dialog only owns
 * the input, validation messaging, and busy state. On success it reports
 * the stored name via onSaved (caller toasts + refreshes its shell).
 */
export function EditNameDialog({
  open,
  onOpenChange,
  initialName,
  onSave,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialName: string;
  onSave: (name: string) => Promise<EditNameResult>;
  onSaved?: (name: string) => void;
}) {
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Fresh value every time the dialog opens (the wrapper stays mounted while
  // only Radix's inner content unmounts, so initial state alone goes stale).
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional form reset from latest prop on open
      setName(initialName);
      setError("");
      setSaving(false);
    }
  }, [open, initialName]);

  const trimmed = name.replace(/\s+/g, " ").trim();
  const valid = trimmed.length >= 2 && trimmed.length <= 80;

  async function submit() {
    if (!valid || saving) return;
    setSaving(true);
    setError("");
    try {
      const res = await onSave(trimmed);
      if (!res.ok) {
        setError(res.error ?? "Could not update your name.");
        setSaving(false);
        return;
      }
      onSaved?.(res.name ?? trimmed);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update your name.");
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="bg-white sm:max-w-md dark:bg-white">
        <DialogHeader>
          <DialogTitle>Edit display name</DialogTitle>
          <DialogDescription>
            This is the name shown in the navbar, greetings, and filed-by labels.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-1.5">
          <Label htmlFor="display-name">Display name</Label>
          <Input
            id="display-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. MARIO GENTILES"
            autoComplete="name"
            maxLength={80}
            disabled={saving}
            className="w-full"
          />
          {name.length > 0 && !valid ? (
            <p role="alert" className="text-xs font-medium text-red-700">
              Name must be 2–80 characters.
            </p>
          ) : null}
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
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="h-8 rounded-[4px] px-3.5 text-xs font-semibold"
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!valid || saving}
            onClick={() => void submit()}
            className="h-8 gap-2 rounded-[4px] px-3.5 text-xs font-semibold"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Save name"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
