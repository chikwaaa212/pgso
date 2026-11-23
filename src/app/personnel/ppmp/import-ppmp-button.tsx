"use client";

import { useRef, useState, useTransition } from "react";
import { FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toaster";
import type { ImportPpmpState } from "./actions";
import styles from "./page.module.css";

const YELLOW_BTN = "h-7 gap-1.5 rounded-[5px] px-3 text-xs font-semibold";
const MAX_BYTES = 10 * 1024 * 1024;

/** Mirrors the server-side check so an oversized file never leaves the browser. */
function validateFile(file: File | null): string | null {
  if (!file || file.size === 0) return "Choose an .xlsx file to import.";
  if (file.size > MAX_BYTES) {
    return `That workbook is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 10 MB — remove large images or save a smaller copy.`;
  }
  if (/\.[^./\\]+$/i.test(file.name) && !/\.xlsx$/i.test(file.name)) {
    return "Only .xlsx files are supported. Re-save the workbook as .xlsx and try again.";
  }
  return null;
}

/**
 * "Import Excel" action used by the PPMP planning screen (which now lives at
 * /ppmp itself). Owns the upload dialog and reports success so the caller can
 * refresh its workbook list.
 */
export function ImportPpmpButton({ onImported }: { onImported?: () => void }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ImportPpmpState | null>(null);
  const [fileName, setFileName] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const { toast } = useToast();

  function submit(formData: FormData) {
    const file = formData.get("file");
    const selected = file instanceof File ? file : null;
    const problem = validateFile(selected);
    if (problem) {
      // Keep the dialog open so the user can pick another file.
      setResult({ success: false, error: problem });
      return;
    }

    const name = fileName;
    setResult(null);
    // Close the dialog right away — the upload continues in the background,
    // and the toast reports the outcome when the server finishes.
    setOpen(false);
    setFileName("");
    formRef.current?.reset();
    toast({
      title: "Import started",
      description: `${name || "The PPMP workbook"} is being processed.`,
    });
    startTransition(async () => {
      try {
        // Route handler (not a Server Action): uploads are not capped by the
        // action body limit, so large workbooks do not fail as "Failed to fetch".
        const response = await fetch("/api/personnel/ppmp/import", {
          method: "POST",
          body: formData,
        });
        const res: ImportPpmpState = await response
          .json()
          .catch(() => ({ success: false, error: "" }));
        if (!response.ok && !res.error) {
          res.error = `Import failed (HTTP ${response.status}). Try again.`;
        }
        setResult(res);
        if (res.success) {
          toast({
            title: res.duplicate ? "Workbook already imported" : "Import complete",
            description: res.duplicate
              ? "The same file is already in your library."
              : `${res.imported ?? 0} row(s) imported.`,
            variant: "success",
          });
          onImported?.();
        } else {
          toast({
            title: "Import failed",
            description: res.error || "The server could not import that workbook. Try again.",
            variant: "error",
          });
        }
      } catch {
        // A dropped request must not surface as an unhandled "Failed to fetch".
        setResult({
          error:
            "The upload could not reach the server. Check your connection and try again — the file was not saved.",
        });
        toast({
          title: "Import failed",
          description: "Could not reach the server. Check your connection and try again.",
          variant: "error",
        });
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="warning"
        className={YELLOW_BTN}
        onClick={() => setOpen(true)}
      >
        <Upload size={13} aria-hidden="true" />
        Import Excel
      </Button>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) {
            setResult(null);
            setFileName("");
          }
        }}
      >
        <DialogContent className="bg-white sm:max-w-xl dark:bg-white">
          <DialogHeader>
            <DialogTitle>Import PPMP from Excel</DialogTitle>
            <DialogDescription>
              Upload the PPMP workbook. We read the sheets, header rows, and
              fiscal year for you — only .xlsx files are accepted (max 10 MB).
            </DialogDescription>
          </DialogHeader>

          <form ref={formRef} action={submit} className={styles.form}>
            <label className={styles.dropzone} data-has-file={fileName ? "true" : "false"}>
              <input
                name="file"
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                required
                className={styles.fileInput}
                onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
              />
              <span className={styles.dropIcon} aria-hidden="true">
                {fileName ? <FileSpreadsheet size={20} /> : <Upload size={20} />}
              </span>
              <span className={styles.dropTitle}>
                {fileName || "Choose an .xlsx workbook"}
              </span>
              <span className={styles.dropHint}>
                {fileName ? "Click to replace the selected file" : ".xlsx only · up to 10 MB"}
              </span>
            </label>

            {result?.error ? (
              <p role="alert" className={styles.alertError}>
                {result.error}
              </p>
            ) : null}
            {result?.success ? (
              <div className={styles.alertSuccess}>
                <p className={styles.alertTitle}>
                  {result.duplicate
                    ? "This workbook is already in your library"
                    : `${result.imported ?? 0} row(s) imported`}
                </p>
                <p className={styles.alertText}>
                  {result.duplicate
                    ? "No duplicate copy was stored."
                    : "Your library is up to date."}
                </p>
              </div>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className={YELLOW_BTN}
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                {result?.success ? "Close" : "Cancel"}
              </Button>
              <Button
                type="submit"
                variant="warning"
                className={YELLOW_BTN}
                disabled={pending}
              >
                {pending ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                    Importing…
                  </>
                ) : (
                  "Import file"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
