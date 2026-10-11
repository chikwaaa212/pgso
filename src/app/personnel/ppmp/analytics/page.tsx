"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { listPpmpFiles, type PpmpFileRow } from "../actions";
import {
  getAnalysisResult,
  getAnalysisStatus,
  inspectPpmpFiles,
  runPpmpAnalysis,
  type InspectedFile,
  type SessionResult,
} from "./actions";
import { FilePicker, MAX_SELECT } from "./file-picker";
import { ValidationPreview } from "./validation-preview";
import { ResultsView } from "./results-view";

const STAGE_LABEL: Record<string, string> = {
  queued: "Preparing file…",
  reading: "Reading workbook…",
  processing: "Processing data…",
  calculating: "Calculating analytics…",
  complete: "Analysis complete.",
  failed: "Analysis failed.",
};

export default function PpmpAnalyticsPage() {
  const [files, setFiles] = useState<PpmpFileRow[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [inspected, setInspected] = useState<InspectedFile[] | null>(null);
  const [error, setError] = useState("");
  const [inspecting, startInspect] = useTransition();
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState("");
  const [runError, setRunError] = useState("");
  const [result, setResult] = useState<SessionResult | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { toast } = useToast();

  const refresh = useCallback(() => {
    void listPpmpFiles().then((rows) => {
      setFiles(rows);
      setSelected((prev) => prev.filter((id) => rows.some((r) => r.id === id)));
    });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) {
        setInspected(null);
        return prev.filter((x) => x !== id);
      }
      if (prev.length >= MAX_SELECT) {
        toast({
          title: "Selection limit",
          description: `Select at most ${MAX_SELECT} files per analysis.`,
          variant: "error",
        });
        return prev;
      }
      setInspected(null);
      return [...prev, id];
    });
  }

  function inspect() {
    setError("");
    setInspected(null);
    setResult(null);
    setRunError("");
    stopPolling();
    startInspect(async () => {
      const res = await inspectPpmpFiles(selected);
      if (!res.success || !res.files) {
        setError(res.error ?? "Inspection failed. Try again.");
        return;
      }
      setInspected(res.files);
      const errors = res.files.flatMap((f) =>
        f.profile.issues.filter((i) => i.severity === "error")
      );
      if (errors.length > 0) {
        toast({
          title: "Validation issues found",
          description: `${errors.length} sheet(s) need attention before analysis.`,
          variant: "error",
        });
      }
    });
  }

  async function runAnalysis() {
    setRunError("");
    setResult(null);
    setRunning(true);
    setStage(STAGE_LABEL.queued);
    try {
      const started = await runPpmpAnalysis(selected);
      if (!started.success || !started.sessionId) {
        setRunError(started.error ?? "Analysis failed to start. Try again.");
        setRunning(false);
        return;
      }
      const sessionId = started.sessionId;
      pollRef.current = setInterval(async () => {
        const status = await getAnalysisStatus(sessionId);
        if ("error" in status) {
          stopPolling();
          setRunError(status.error);
          setRunning(false);
          return;
        }
        setStage(STAGE_LABEL[status.stage] ?? status.stage);
        if (status.status === "succeeded") {
          stopPolling();
          const res = await getAnalysisResult(sessionId);
          if ("error" in res) {
            setRunError(res.error);
          } else {
            setResult(res);
            toast({ title: "Analysis complete", variant: "success" });
          }
          setRunning(false);
        } else if (status.status === "failed") {
          stopPolling();
          const res = await getAnalysisStatus(sessionId);
          setRunError(
            `Analysis failed${"errorCode" in res && res.errorCode ? ` (${res.errorCode})` : ""}. Check the validation preview and try again.`
          );
          setRunning(false);
        }
      }, 2000);
    } catch {
      setRunError("Analysis failed unexpectedly. Try again.");
      setRunning(false);
    }
  }

  return (
    <section>
      {/* Plain-text crumb (no role-specific href): this page is shared by
          the personnel and super-admin routes, whose role guards differ. */}
      <p className="text-sm text-zinc-500">PPMP / Analytics</p>

      <Card className="mt-4 p-6">
        <h2 className="text-lg font-semibold">1. Select PPMP files</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Choose up to {MAX_SELECT} uploaded workbooks. Only files you own
          (or all files, for Super Admin) are listed.
        </p>
        <div className="mt-4">
          {files === null ? (
            <p className="flex items-center gap-2 text-sm text-zinc-500" role="status">
              <Loader2 className="size-4 animate-spin" /> Loading files…
            </p>
          ) : (
            <FilePicker files={files} selected={selected} onToggle={toggle} />
          )}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button type="button" onClick={inspect} disabled={inspecting || selected.length === 0}>
            {inspecting ? (
              <>
                <Loader2 className="mr-1 size-4 animate-spin" />
                Validating…
              </>
            ) : (
              "Validate files"
            )}
          </Button>
          {selected.length > 0 ? (
            <span className="text-xs text-zinc-500">
              {selected.length} selected
            </span>
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}
      </Card>

      {inspected ? (
        <Card className="mt-4 p-6">
          <h2 className="text-lg font-semibold">2. Validation results</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Confirm sheets, header rows, fiscal years, and issues before running
            analysis.
          </p>
          <div className="mt-4">
            <ValidationPreview files={inspected} />
          </div>
          <div className="mt-4 flex items-center gap-3 border-t border-navy-100 pt-4">
            <Button type="button" onClick={runAnalysis} disabled={running}>
              {running ? (
                <>
                  <Loader2 className="mr-1 size-4 animate-spin" />
                  {stage || "Preparing file…"}
                </>
              ) : (
                "Run analysis"
              )}
            </Button>
            {running && stage ? (
              <span className="text-xs text-zinc-500" role="status">{stage}</span>
            ) : null}
          </div>
          {runError ? (
            <p role="alert" className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
              {runError}
            </p>
          ) : null}
        </Card>
      ) : null}

      {result ? (
        <div className="mt-4">
          <h2 className="text-lg font-semibold">3. Analysis results</h2>
          <div className="mt-3">
            <ResultsView result={result} />
          </div>
        </div>
      ) : null}
    </section>
  );
}
