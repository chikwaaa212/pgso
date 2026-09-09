"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import {
  attachIarImage,
  removeIarImage,
} from "@/app/personnel/inspections/actions";

const BUCKET = "iar-attachments";
const MAX_BYTES = 8 * 1024 * 1024;

function storagePathFromUrl(imageUrl: string) {
  const marker = `/${BUCKET}/`;
  const i = imageUrl.indexOf(marker);
  return i >= 0 ? imageUrl.slice(i + marker.length) : null;
}

export function IarAttachButton({
  deliveryId,
  label = "Attach IAR scan",
  onDone,
}: {
  deliveryId: string;
  label?: string;
  /** Called after a successful attach (e.g. to refresh a list). */
  onDone?: () => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onPick(file: File | undefined) {
    if (!file) return;
    setError("");
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file (JPG or PNG).");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Image must be 8 MB or smaller.");
      return;
    }
    setBusy(true);
    try {
      const safeName = file.name.replace(/[^A-Za-z0-9._-]+/g, "_") || "scan";
      const path = `iar/${deliveryId}/${Date.now()}-${safeName}`;
      const supabase = createClient();
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (upErr) throw new Error(upErr.message);
      const {
        data: { publicUrl },
      } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const res = await attachIarImage(deliveryId, publicUrl);
      if (!res.success) {
        // best-effort cleanup of the orphaned upload
        await supabase.storage
          .from(BUCKET)
          .remove([path])
          .catch(() => undefined);
        throw new Error(res.error ?? "Failed to attach the IAR image.");
      }
      router.refresh();
      onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label="Choose IAR scan image"
        onChange={(e) => void onPick(e.target.files?.[0])}
      />
      <Button
        type="button"
        variant="outline"
        className="gap-2"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ImagePlus className="h-4 w-4" />
        )}
        {busy ? "Uploading…" : label}
      </Button>
      {error ? (
        <span role="alert" className="text-xs font-medium text-red-700">
          {error}
        </span>
      ) : null}
    </span>
  );
}

export function IarRemoveButton({
  deliveryId,
  recordId,
  imageUrl,
}: {
  deliveryId: string;
  /** History record to delete; omit for legacy images stored on the inspection. */
  recordId?: string;
  imageUrl: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onRemove() {
    if (!window.confirm("Remove the attached IAR scan?")) return;
    setError("");
    setBusy(true);
    try {
      // best-effort: delete the stored file too
      const path = storagePathFromUrl(imageUrl);
      if (path) {
        await createClient()
          .storage.from(BUCKET)
          .remove([path])
          .catch(() => undefined);
      }
      const res = await removeIarImage(deliveryId, recordId);
      if (!res.success) throw new Error(res.error ?? "Remove failed.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Remove failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        className="gap-2"
        disabled={busy}
        onClick={() => void onRemove()}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="h-4 w-4" />
        )}
        {busy ? "Removing…" : "Remove scan"}
      </Button>
      {error ? (
        <span role="alert" className="text-xs font-medium text-red-700">
          {error}
        </span>
      ) : null}
    </span>
  );
}
