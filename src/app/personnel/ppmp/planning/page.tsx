"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  AlertTriangle,
  CalendarRange,
  CheckCircle2,
  FileSpreadsheet,
  Gauge,
  Loader2,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Wallet,
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
} from "../analytics/actions";
import { FilePicker, MAX_SELECT } from "../analytics/file-picker";
import { ValidationPreview } from "../analytics/validation-preview";
import { PlanningView } from "./planning-view";
import { getPlanningItems, type PlanningItem } from "./actions";
import { fetchIssuanceConsumption } from "@/lib/prescriptive-actions";
import type { ConsumptionResult } from "@/lib/ppmp/analytics/consumption";
import type { PlanningMethod } from "@/lib/ppmp/analytics/planning";
import styles from "../workspace.module.css";

const YELLOW_BTN = "h-7 gap-1.5 rounded-[5px] px-3 text-xs font-semibold";

const STAGE_LABEL: Record<string, string> = {
  queued: "Preparing file…",
  reading: "Reading workbook…",
  processing: "Processing data…",
  calculating: "Calculating planning draft…",
  complete: "Planning complete.",
  failed: "Planning failed.",
};

const METHOD_LABEL: Record<PlanningMethod, string> = {
  average: "Average / carryover",
  trend: "Trend",
  growth: "Growth rate",
  consumption: "Issuance history",
};

function compactPeso(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `₱${value.toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;
}

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
      text: "Choose up to three historical PPMP files.",
      state: selected > 0 ? "done" : "active",
    },
    {
      title: "Set assumptions",
      text: "Target year, method, growth, and budget ceiling.",
      state: result ? "done" : inspected ? "active" : "idle",
    },
    {
      title: "Review the draft",
      text: "Check the basis, consumption, and GPPB export.",
      state: result ? "active" : "idle",
    },
  ] as const;

  return (
    <div className={styles.stepper} aria-label="Planning progress">
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

export default function PpmpPlanningPage() {
  const [files, setFiles] = useState<PpmpFileRow[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [inspected, setInspected] = useState<InspectedFile[] | null>(null);
  const [error, setError] = useState("");
  const [inspecting, startInspect] = useTransition();
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState("");
  const [runError, setRunError] = useState("");
  const [result, setResult] = useState<SessionResult | null>(null);
  const [items, setItems] = useState<PlanningItem[] | null>(null);
  const [itemsNote, setItemsNote] = useState("");
  const [consumption, setConsumption] = useState<ConsumptionResult | null>(null);
  const [consumptionNote, setConsumptionNote] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { toast } = useToast();

  const [agency, setAgency] = useState("General");
  const [targetYear, setTargetYear] = useState(String(new Date().getFullYear() + 1));
  const [ceiling, setCeiling] = useState("");
  const [method, setMethod] = useState<PlanningMethod>("growth");
  const [growthPct, setGrowthPct] = useState("5");
  const [pricePct, setPricePct] = useState("3");
  const [categoryFilter, setCategoryFilter] = useState("all");

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
        setResult(null);
        setItems(null);
        return prev.filter((x) => x !== id);
      }
      if (prev.length >= MAX_SELECT) {
        toast({
          title: "Selection limit",
          description: `Select at most ${MAX_SELECT} files per planning run.`,
          variant: "error",
        });
        return prev;
      }
      setInspected(null);
      setResult(null);
      return [...prev, id];
    });
  }

  function inspect() {
    setError("");
    setInspected(null);
    setResult(null);
    setItems(null);
    setItemsNote("");
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
          description: `${errors.length} sheet(s) need attention before planning.`,
          variant: "error",
        });
      }
    });
  }

  async function runPlanning() {
    setRunError("");
    setResult(null);
    setItems(null);
    setItemsNote("");
    setConsumption(null);
    setConsumptionNote("");
    setRunning(true);
    setStage(STAGE_LABEL.queued);
    try {
      const started = await runPpmpAnalysis(selected);
      if (!started.success || !started.sessionId) {
        setRunError(started.error ?? "Planning failed to start. Try again.");
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
            // Full line coverage for future planning (all rows, not top-10).
            // Runs after analysis so the parse cache is warm; never blocks the report.
            void getPlanningItems(selected).then((pi) => {
              if (pi.success && pi.items) {
                setItems(pi.items);
                setItemsNote(
                  `Full coverage: ${pi.items.length} planned items from ${pi.totalLines ?? 0} uploaded entries.`
                );
              } else {
                setItems(null);
                setItemsNote(
                  pi.error ?? "Full item list unavailable — planning falls back to top items."
                );
              }
            });
            // Issuance history (Objective 5): powers the consumption method and
            // the consumption-check panel. Failure never blocks the draft.
            void fetchIssuanceConsumption()
              .then((res) => {
                setConsumption(res);
                setConsumptionNote(
                  res.suggestions.length > 0
                    ? `Issuance history: ${res.suggestions.length} item(s) with usage across FY ${res.years.join(", ")}.`
                    : "No issuance history matched the last three fiscal years."
                );
              })
              .catch(() => {
                setConsumption(null);
                setConsumptionNote("Issuance history unavailable — consumption suggestions are off.");
              });
            toast({ title: "Planning draft ready", variant: "success" });
          }
          setRunning(false);
        } else if (status.status === "failed") {
          stopPolling();
          setRunError("Planning run failed. Check the validation preview and try again.");
          setRunning(false);
        }
      }, 2000);
    } catch {
      setRunError("Planning failed unexpectedly. Try again.");
      setRunning(false);
    }
  }

  const targetYearNum = Number.parseInt(targetYear, 10);
  const ceilingNum = ceiling.trim() === "" ? null : Number(ceiling.replace(/,/g, ""));
  const growthNum = Number.parseFloat(growthPct);
  const priceNum = Number.parseFloat(pricePct);
  const yearValid =
    Number.isInteger(targetYearNum) && targetYearNum >= 1990 && targetYearNum <= 2100;
  const issueCount =
    inspected?.reduce(
      (sum, f) => sum + f.profile.issues.filter((i) => i.severity === "error").length,
      0
    ) ?? 0;

  const tiles: SummaryTile[] = [
    {
      label: "Selected",
      value: `${selected.length} / ${MAX_SELECT}`,
      hint: selected.length === 0 ? "Pick historical files" : "Files feeding the forecast",
      icon: FileSpreadsheet,
      tone: "info",
    },
    {
      label: "Target fiscal year",
      value: yearValid ? `FY ${targetYearNum}` : "—",
      hint: yearValid ? "Forward-looking plan" : "Enter a year between 1990 and 2100",
      icon: CalendarRange,
      tone: yearValid ? "ok" : "bad",
    },
    {
      label: "Budget ceiling",
      value: ceilingNum !== null && Number.isFinite(ceilingNum) ? compactPeso(ceilingNum) : "Not set",
      hint:
        ceilingNum !== null && Number.isFinite(ceilingNum)
          ? "Draft stays within this cap"
          : "Optional — the draft can run uncapped",
      icon: Wallet,
      tone: "warn",
    },
    {
      label: "Forecast method",
      value: METHOD_LABEL[method],
      hint: `Growth ${Number.isFinite(growthNum) ? growthNum : 5}% · price ${Number.isFinite(priceNum) ? priceNum : 0}%`,
      icon: Gauge,
      tone: "neutral",
    },
  ];

  return (
    <section className={styles.page}>
      <PpmpBackLink />

      <PageHeader
        eyebrow="PPMP · Planning"
        title="PPMP planning"
        subtitle="Build next fiscal year's PPMP draft from your own workbook history. Choose a forecast method and assumptions, validate the source files, then review every line and export in GPPB format."
        meta={
          files === null
            ? "Loading your library…"
            : `${selected.length} of ${MAX_SELECT} workbooks selected · planning FY ${yearValid ? targetYearNum : "TBD"}`
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

      <SummaryTiles tiles={tiles} ariaLabel="PPMP planning summary" />

      <Stepper selected={selected.length} inspected={Boolean(inspected)} result={Boolean(result)} />

      <PpmpPanel
        step={1}
        icon={FileSpreadsheet}
        title="Select PPMP workbooks"
        text={`Choose up to ${MAX_SELECT} historical workbooks. Existing analytics is untouched — this page only adds a forward-looking draft.`}
        tone="info"
        actions={
          <span className={styles.status} data-tone={selected.length > 0 ? "ok" : "neutral"}>
            <span className={styles.statusDot} aria-hidden="true" />
            {selected.length} of {MAX_SELECT} selected
          </span>
        }
      >
        {files === null ? (
          <p className={styles.loadingInline} role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading files…
          </p>
        ) : (
          <FilePicker files={files} selected={selected} onToggle={toggle} />
        )}
      </PpmpPanel>

      <PpmpPanel
        step={2}
        icon={SlidersHorizontal}
        title="Planning assumptions"
        text="These assumptions drive the projection. Agency and fiscal year label the exported PPMP; method, growth, and price adjust quantities and unit costs."
        tone="warn"
      >
        <div className={styles.settings}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Agency / office</span>
            <input
              className={styles.control}
              value={agency}
              onChange={(e) => setAgency(e.target.value)}
              placeholder="General"
            />
            <span className={styles.fieldHint}>Printed on the GPPB export header.</span>
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Fiscal year to plan</span>
            <input
              className={styles.control}
              inputMode="numeric"
              value={targetYear}
              onChange={(e) => setTargetYear(e.target.value)}
              placeholder="2027"
              aria-invalid={!yearValid}
            />
            <span className={styles.fieldHint}>
              {yearValid ? "Forward-looking target year." : "Use a year between 1990 and 2100."}
            </span>
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Budget ceiling (PHP)</span>
            <input
              className={styles.control}
              inputMode="decimal"
              value={ceiling}
              onChange={(e) => setCeiling(e.target.value)}
              placeholder="Optional"
            />
            <span className={styles.fieldHint}>Leave blank to plan without a cap.</span>
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Forecast method</span>
            <select
              className={styles.control}
              value={method}
              onChange={(e) => setMethod(e.target.value as PlanningMethod)}
            >
              <option value="average">Average / carryover</option>
              <option value="trend">Trend (statistical where available)</option>
              <option value="growth">Growth rate</option>
              <option value="consumption">Issuance history (actual usage)</option>
            </select>
            <span className={styles.fieldHint}>How next year&apos;s quantity is estimated.</span>
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Quantity growth % / year</span>
            <input
              className={styles.control}
              inputMode="decimal"
              value={growthPct}
              onChange={(e) => setGrowthPct(e.target.value)}
            />
            <span className={styles.fieldHint}>Applied to the base plan quantity.</span>
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Price increase % / year</span>
            <input
              className={styles.control}
              inputMode="decimal"
              value={pricePct}
              onChange={(e) => setPricePct(e.target.value)}
            />
            <span className={styles.fieldHint}>Applied to recorded unit costs.</span>
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Category filter</span>
            <input
              className={styles.control}
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              placeholder="all"
            />
            <span className={styles.fieldHint}>Use “all” or a category name (supplies first).</span>
          </label>
        </div>

        <div className={styles.divider} style={{ margin: "0.875rem 0" }} />

        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <span className={styles.toolbarLine}>
            {selected.length === 0
              ? "Select workbooks first, then validate."
              : `${selected.length} workbook(s) ready to validate against these assumptions.`}
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

        {error ? (
          <div className={styles.notice} data-tone="bad" role="alert" style={{ marginTop: "0.75rem" }}>
            <AlertTriangle size={15} aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}

        {inspected ? (
          <div style={{ marginTop: "0.875rem" }}>
            <div className={styles.divider} style={{ marginBottom: "0.875rem" }} />
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-navy-900">Validation results</h3>
                <p className="mt-0.5 text-xs text-zinc-500">
                  Confirm sheets, header rows, fiscal years, and issues before building the draft.
                </p>
              </div>
              <span className={styles.status} data-tone={issueCount > 0 ? "bad" : "ok"}>
                <span className={styles.statusDot} aria-hidden="true" />
                {issueCount > 0 ? `${issueCount} error(s)` : "No blocking issues"}
              </span>
            </div>
            <ValidationPreview files={inspected} />

            <div className="mt-4 flex w-full flex-wrap items-center justify-between gap-2 border-t border-navy-100 pt-3">
              <span className={styles.toolbarLine} role={running ? "status" : undefined}>
                {running
                  ? stage || "Preparing planning draft…"
                  : "Validation does not modify the uploaded files."}
              </span>
              <Button
                type="button"
                variant="warning"
                className={YELLOW_BTN}
                onClick={runPlanning}
                disabled={running}
              >
                {running ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                    {stage || "Preparing file…"}
                  </>
                ) : (
                  <>
                    <Sparkles size={13} aria-hidden="true" />
                    Build planning draft
                  </>
                )}
              </Button>
            </div>
            {runError ? (
              <div className={styles.notice} data-tone="bad" role="alert" style={{ marginTop: "0.75rem" }}>
                <AlertTriangle size={15} aria-hidden="true" />
                <span>{runError}</span>
              </div>
            ) : null}
          </div>
        ) : null}
      </PpmpPanel>

      {running && !result ? (
        <div className={styles.notice} data-tone="info" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          <span>{stage || STAGE_LABEL.queued} This can take a moment for large workbooks.</span>
        </div>
      ) : null}

      {result ? (
        <PpmpPanel
          step={3}
          icon={Sparkles}
          title="Planning draft"
          text="Upload clean spreadsheet PDFs where possible and run one category at a time for large histories. Have budget and procurement staff check this output before submission."
          tone="ok"
          actions={
            <span className={styles.status} data-tone="ok">
              <span className={styles.statusDot} aria-hidden="true" />
              Projection — not final
            </span>
          }
          footer={
            itemsNote || consumptionNote ? (
              <div className="grid w-full gap-1 text-xs text-zinc-500">
                {itemsNote ? <span>{itemsNote}</span> : null}
                {consumptionNote ? <span>{consumptionNote}</span> : null}
              </div>
            ) : undefined
          }
        >
          <PlanningView
            result={result}
            items={items}
            consumption={consumption}
            agency={agency.trim() || "General"}
            targetYear={yearValid ? targetYearNum : null}
            ceilingPesos={
              ceilingNum !== null && Number.isFinite(ceilingNum) && ceilingNum >= 0
                ? ceilingNum
                : null
            }
            method={method}
            growthPct={Number.isFinite(growthNum) ? growthNum : 5}
            pricePct={Number.isFinite(priceNum) ? priceNum : 0}
            categoryFilter={categoryFilter.trim() || "all"}
          />
        </PpmpPanel>
      ) : null}
    </section>
  );
}
