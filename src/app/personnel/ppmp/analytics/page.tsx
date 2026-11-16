"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Table2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/personnel/PageHeader";
import { SummaryTiles, type SummaryTile } from "@/components/personnel/SummaryTiles";
import { PpmpBackLink } from "@/components/personnel/PpmpBackLink";
import { PpmpPanel } from "@/components/personnel/PpmpPanel";
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
import styles from "../workspace.module.css";

const STAGE_LABEL: Record<string, string> = {
  queued: "Preparing file…",
  reading: "Reading workbook…",
  processing: "Processing data…",
  calculating: "Calculating analytics…",
  complete: "Analysis complete.",
  failed: "Analysis failed.",
};

const YELLOW_BTN = "h-7 gap-1.5 rounded-[5px] px-3 text-xs font-semibold";

function Stepper({
  selected,
  inspected,
  result,
}: {
  selected: number;
  inspected: boolean;
  result: boolean;
}) {
  const steps = [
    {
      title: "Select workbooks",
      text: "Choose up to three PPMP files to compare.",
      state: selected > 0 ? "done" : "active",
    },
    {
      title: "Validate structure",
      text: "Confirm sheets, header rows, and fiscal years.",
      state: result ? "done" : inspected ? "active" : "idle",
    },
    {
      title: "Read the analysis",
      text: "Totals, trends, costs, forecasts, and evidence.",
      state: result ? "active" : "idle",
    },
  ] as const;

  return (
    <div className={styles.stepper} aria-label="Analysis progress">
      {steps.map((step, i) => (
        <div key={step.title} className={styles.step} data-state={step.state}>
          <span className={styles.stepIndex} aria-hidden="true">
            {step.state === "done" ? <CheckCircle2 size={13} /> : String(i + 1).padStart(2, "0")}
          </span>
          <div className={styles.stepBody}>
            <p className={styles.stepTitle}>{step.title}</p>
            <p className={styles.stepText}>{step.text}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

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

  const rows = files ?? [];
  const selectedRows = rows.filter((f) => selected.includes(f.id));
  const selectedYears = new Set(
    selectedRows
      .map((f) => f.fiscal_year)
      .filter((year): year is number => typeof year === "number")
  );
  const issueCount =
    inspected?.reduce(
      (sum, f) => sum + f.profile.issues.filter((i) => i.severity === "error").length,
      0
    ) ?? 0;

  const statusLabel = running
    ? stage || "Running analysis"
    : result
      ? "Analysis ready"
      : inspected
        ? "Validated — ready to run"
        : selected.length > 0
          ? "Awaiting validation"
          : "Select workbooks";
  const statusTone = running
    ? "info"
    : result
      ? "ok"
      : issueCount > 0
        ? "bad"
        : inspected
          ? "warn"
          : "neutral";

  const tiles: SummaryTile[] = [
    {
      label: "Workbooks",
      value: files === null ? "—" : rows.length.toLocaleString("en-PH"),
      hint: "Available to compare",
      icon: FileSpreadsheet,
      tone: "info",
    },
    {
      label: "Selected",
      value: `${selected.length} / ${MAX_SELECT}`,
      hint: selected.length === 0 ? "Pick files to begin" : "Within the run limit",
      icon: Table2,
      tone: "neutral",
    },
    {
      label: "Fiscal years",
      value: selectedYears.size > 0 ? selectedYears.size.toLocaleString("en-PH") : "—",
      hint:
        selectedYears.size > 0
          ? [...selectedYears].sort((a, b) => a - b).map((y) => `FY ${y}`).join(" · ")
          : "Covered by selection",
      icon: BarChart3,
      tone: "warn",
    },
    {
      label: "Status",
      value: statusLabel,
      hint:
        issueCount > 0
          ? `${issueCount} validation error(s) to review`
          : result
            ? `${result.report.overview.line_items.toLocaleString("en-PH")} line items analysed`
            : "No analysis run yet",
      icon: ShieldCheck,
      tone: statusTone === "neutral" ? "neutral" : statusTone,
    },
  ];

  return (
    <section className={styles.page}>
      <PpmpBackLink />

      <PageHeader
        eyebrow="PPMP · Analytics"
        title="PPMP analytics"
        subtitle="Compare uploaded PPMP workbooks across fiscal years. Validate the structure first, then read totals, trends, cost movements, forecasts, and the source rows behind every figure."
        meta={
          files === null
            ? "Loading your library…"
            : `${rows.length} workbook${rows.length === 1 ? "" : "s"} in your library · ${selected.length} selected`
        }
        actions={
          <Button
            type="button"
            variant="outline"
            className={YELLOW_BTN}
            onClick={refresh}
            disabled={files === null}
          >
            <RefreshCw size={13} aria-hidden="true" />
            Refresh
          </Button>
        }
      />

      <SummaryTiles tiles={tiles} ariaLabel="PPMP analytics summary" />

      <Stepper selected={selected.length} inspected={Boolean(inspected)} result={Boolean(result)} />

      <PpmpPanel
        step={1}
        icon={FileSpreadsheet}
        title="Select PPMP workbooks"
        text={`Choose up to ${MAX_SELECT} uploaded workbooks. Only files you own are listed — Super Admin can compare across all personnel.`}
        tone="info"
        actions={
          <span className={styles.status} data-tone={selected.length > 0 ? "ok" : "neutral"}>
            <span className={styles.statusDot} aria-hidden="true" />
            {selected.length} of {MAX_SELECT} selected
          </span>
        }
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <span className={styles.toolbarLine}>
              {selectedRows.length > 0
                ? selectedRows.map((f) => f.filename).join(" · ")
                : "Nothing selected yet"}
            </span>
            <Button
              type="button"
              variant="warning"
              className={YELLOW_BTN}
              onClick={inspect}
              disabled={inspecting || selected.length === 0}
            >
              {inspecting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                  Validating…
                </>
              ) : (
                <>
                  <ShieldCheck size={13} aria-hidden="true" />
                  Validate files
                </>
              )}
            </Button>
          </div>
        }
      >
        {files === null ? (
          <p className={styles.loadingInline} role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading files…
          </p>
        ) : (
          <FilePicker files={files} selected={selected} onToggle={toggle} />
        )}
        {error ? (
          <div className={styles.notice} data-tone="bad" role="alert" style={{ marginTop: "0.75rem" }}>
            <AlertTriangle size={15} aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}
      </PpmpPanel>

      {inspected ? (
        <PpmpPanel
          step={2}
          icon={ShieldCheck}
          title="Validation results"
          text="Confirm sheets, header rows, fiscal years, and issues before running the analysis."
          tone={issueCount > 0 ? "warn" : "ok"}
          actions={
            <span className={styles.status} data-tone={issueCount > 0 ? "bad" : "ok"}>
              <span className={styles.statusDot} aria-hidden="true" />
              {issueCount > 0 ? `${issueCount} error(s)` : "No blocking issues"}
            </span>
          }
          footer={
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <span className={styles.toolbarLine} role={running ? "status" : undefined}>
                {running
                  ? stage || "Preparing analysis…"
                  : "Validation does not modify the uploaded files."}
              </span>
              <Button
                type="button"
                variant="warning"
                className={YELLOW_BTN}
                onClick={runAnalysis}
                disabled={running}
              >
                {running ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                    {stage || "Preparing file…"}
                  </>
                ) : (
                  <>
                    <BarChart3 size={13} aria-hidden="true" />
                    Run analysis
                  </>
                )}
              </Button>
            </div>
          }
        >
          <ValidationPreview files={inspected} />
          {runError ? (
            <div className={styles.notice} data-tone="bad" role="alert" style={{ marginTop: "0.75rem" }}>
              <AlertTriangle size={15} aria-hidden="true" />
              <span>{runError}</span>
            </div>
          ) : null}
        </PpmpPanel>
      ) : null}

      {running && !result ? (
        <div className={styles.notice} data-tone="info" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          <span>{stage || STAGE_LABEL.queued} This can take a moment for large workbooks.</span>
        </div>
      ) : null}

      {result ? (
        <PpmpPanel
          step={3}
          icon={BarChart3}
          title="Analysis results"
          text="Every figure below is computed from the parsed rows — expand “How was this calculated?” on any item to see the work and its source rows."
          tone="ok"
          actions={
            <span className={styles.status} data-tone="ok">
              <span className={styles.statusDot} aria-hidden="true" />
              Analysis ready
            </span>
          }
        >
          <ResultsView result={result} />
        </PpmpPanel>
      ) : null}
    </section>
  );
}
