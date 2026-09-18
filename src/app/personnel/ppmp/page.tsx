"use client";

import { useState, useRef, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { useToast } from "@/components/ui/toaster";
import { importPpmpFromExcel, type ImportPpmpState } from "./actions";
import { cn } from "@/lib/utils";

const inputCls = cn(
  "w-full min-w-0 rounded-md border border-navy-200 bg-transparent px-3 py-2 text-sm text-navy-900",
  "focus-visible:border-navy-600 focus-visible:ring-navy-600/50 focus-visible:ring-[3px]",
  "disabled:cursor-not-allowed disabled:opacity-50"
);

export default function PpmpPage() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ImportPpmpState | null>(null);
  const [fileName, setFileName] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const { toast } = useToast();

  function submit(formData: FormData) {
    setResult(null);
    startTransition(async () => {
      const res = await importPpmpFromExcel({} as ImportPpmpState, formData);
      setResult(res);
      if (res.success) {
        toast({
          title: "Import complete",
          description: `${res.imported ?? 0} row(s) imported.`,
          variant: "success",
        });
        setOpen(false);
        setFileName("");
        formRef.current?.reset();
      }
    });
  }

  return (
    <section>
      <p className="text-sm text-zinc-500">PPMP — placeholder</p>

      <Card className="mt-4 p-6">
        <h2 className="text-lg font-semibold">PPMP Import</h2>
        <p className="text-sm text-zinc-600 mt-1">
          Upload an Excel file to import PPMP records.
        </p>
        <Button type="button" className="mt-4" onClick={() => setOpen(true)}>
          Import Excel
        </Button>
      </Card>

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
              Upload the PPMP Excel file. Only .xlsx files are accepted (max 10 MB).
            </DialogDescription>
          </DialogHeader>

          <form ref={formRef} action={submit} className="mt-3 grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="ppmp-import-file">Upload file</Label>
              <Input
                id="ppmp-import-file"
                name="file"
                type="file"
                accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                required
                className={inputCls}
                onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
              />
              {fileName ? <p className="text-xs text-navy-600">Selected: {fileName}</p> : null}
              <p className="text-xs text-zinc-500">.xlsx only · max 10 MB.</p>
            </div>

            {result?.error ? (
              <p role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
                {result.error}
              </p>
            ) : null}
            {result?.success ? (
              <div className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900">
                <p className="font-semibold">
                  {result.imported ?? 0} row(s) imported
                </p>
              </div>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                {result?.success ? "Close" : "Cancel"}
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? (
                  <>
                    <Loader2 className="mr-1 size-4 animate-spin" />
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
    </section>
  );
}