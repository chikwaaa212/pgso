"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import type { PlanningMethod } from "@/lib/ppmp/analytics/planning";
import { cn } from "@/lib/utils";

const inputCls = cn(
  "w-full min-w-0 rounded-md border border-navy-200 bg-transparent px-3 py-2 text-sm text-navy-900",
  "focus-visible:border-navy-600 focus-visible:ring-navy-600/50 focus-visible:ring-[3px]",
  "disabled:cursor-not-allowed disabled:opacity-50"
);

const STAGE_LABEL: Record<string, string> = {
  queued: "Preparing file…",
  reading: "Reading workbook…",
  processing: "Processing data…",
  calculating: "Calculating planning draft…",
  complete: "Planning complete.",
  failed: "Planning failed.",
};

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

  return (
    <section>
      <p className="text-sm text-zinc-500">PPMP / Planning</p>

      <Card className="mt-4 p-6">
        <h2 className="text-lg font-semibold">1. Select PPMP files</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Choose up to {MAX_SELECT} uploaded workbooks. Existing analytics is untouched — this page only adds a forward-looking draft.
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
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="grid gap-1.5">
            <Label htmlFor="planning-agency">Agency / office (general allowed)</Label>
            <Input id="planning-agency" value={agency} onChange={(e) => setAgency(e.target.value)} className={inputCls} placeholder="General" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="planning-year">Fiscal year to plan (future)</Label>
            <Input id="planning-year" inputMode="numeric" value={targetYear} onChange={(e) => setTargetYear(e.target.value)} className={inputCls} placeholder="2027" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="planning-ceiling">Budget ceiling PHP (optional)</Label>
            <Input id="planning-ceiling" inputMode="decimal" value={ceiling} onChange={(e) => setCeiling(e.target.value)} className={inputCls} placeholder="Unknown" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="planning-method">Forecast method</Label>
            <select
              id="planning-method"
              value={method}
              onChange={(e) => setMethod(e.target.value as PlanningMethod)}
              className={inputCls}
            >
              <option value="average">Average / carryover</option>
              <option value="trend">Trend (statistical where available)</option>
              <option value="growth">Growth rate</option>
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="planning-growth">Qty growth %/yr (base plan)</Label>
            <Input id="planning-growth" inputMode="decimal" value={growthPct} onChange={(e) => setGrowthPct(e.target.value)} className={inputCls} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="planning-price">Price increase %/yr (unit costs)</Label>
            <Input id="planning-price" inputMode="decimal" value={pricePct} onChange={(e) => setPricePct(e.target.value)} className={inputCls} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="planning-category">Category filter (supplies first)</Label>
            <Input id="planning-category" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className={inputCls} placeholder="all" />
          </div>
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
            <span className="text-xs text-zinc-500">{selected.length} selected</span>
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
            Confirm sheets, header rows, fiscal years, and issues before building the draft.
          </p>
          <div className="mt-4">
            <ValidationPreview files={inspected} />
          </div>
          <div className="mt-4 flex items-center gap-3 border-t border-navy-100 pt-4">
            <Button type="button" onClick={runPlanning} disabled={running}>
              {running ? (
                <>
                  <Loader2 className="mr-1 size-4 animate-spin" />
                  {stage || "Preparing file…"}
                </>
              ) : (
                "Build planning draft"
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
          <h2 className="text-lg font-semibold">3. Planning draft</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Upload clean spreadsheet PDFs where possible. Run one category at a time for large histories. Have budget and procurement staff check this output before submission.
            {itemsNote ? ` ${itemsNote}` : ""}
          </p>
          <div className="mt-3">
            <PlanningView
              result={result}
              items={items}
              agency={agency.trim() || "General"}
              targetYear={Number.isInteger(targetYearNum) && targetYearNum >= 1990 && targetYearNum <= 2100 ? targetYearNum : null}
              ceilingPesos={ceilingNum !== null && Number.isFinite(ceilingNum) && ceilingNum >= 0 ? ceilingNum : null}
              method={method}
              growthPct={Number.isFinite(growthNum) ? growthNum : 5}
              pricePct={Number.isFinite(priceNum) ? priceNum : 0}
              categoryFilter={categoryFilter.trim() || "all"}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}
