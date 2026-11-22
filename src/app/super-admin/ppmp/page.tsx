"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ChartColumn,
  CheckCircle2,
  Clock3,
  FileSpreadsheet,
  FileText,
  Layers3,
  Loader2,
  Sparkles,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/personnel/PageHeader";
import { SummaryTiles } from "@/components/personnel/SummaryTiles";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toaster";
import { useCachedAction } from "@/hooks/use-cached-action";
import { buildQueryKey, resourcePrefix } from "@/lib/query-keys";
import { bustClientCache } from "@/lib/client-cache";
import {
  listPpmpFiles,
  importPpmpFromExcel,
  type ImportPpmpState,
  type PpmpFileRow,
} from "@/app/personnel/ppmp/actions";
import { getPpmpFilesSummary } from "./actions";
import styles from "@/app/personnel/ppmp/page.module.css";

/** Shared shape for the 24px yellow action buttons used across Personnel. */
const YELLOW_BTN = "h-6 gap-1.5 rounded-[4px] px-3 text-xs font-semibold";

const MANILA = "Asia/Manila";

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: MANILA,
  });
}

function relTime(iso: string | null) {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diff = Date.now() - then;
  if (diff < 60_000) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return fmtDate(iso);
}

function fmtSize(bytes: number | null) {
  if (bytes === null || bytes === undefined) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const STEPS = [
  {
    title: "Upload the workbook",
    text: "Import the agency's PPMP .xlsx. Sheets, header rows, and the fiscal year are detected automatically.",
    icon: Upload,
  },
  {
    title: "Validate & analyze",
    text: "Confirm the detected structure, then compare categories, quantities, and prices across fiscal years.",
    icon: ChartColumn,
  },
  {
    title: "Plan the next year",
    text: "Build a forecast draft with growth rules and a budget ceiling, then export it back to Excel.",
    icon: Sparkles,
  },
] as const;

export default function SuperAdminPpmpFilesPage() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ImportPpmpState | null>(null);
  const [fileName, setFileName] = useState("");
  const [files, setFiles] = useState<PpmpFileRow[] | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const { toast } = useToast();
  const router = useRouter();

  const loadFiles = useCallback(() => {
    void listPpmpFiles().then(setFiles);
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  // Exact system-wide totals (the recent-workbook list is capped at 100).
  const { data: summary } = useCachedAction(
    buildQueryKey({ module: "super-admin", resource: "ppmp-files-summary" }),
    getPpmpFilesSummary,
    { staleTime: 60_000 }
  );

  function submit(formData: FormData) {
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
      const res = await importPpmpFromExcel({} as ImportPpmpState, formData);
      setResult(res);
      if (res.success) {
        toast({
          title: res.duplicate ? "Workbook already imported" : "Import complete",
          description: res.duplicate
            ? "The same file is already in the library."
            : `${res.imported ?? 0} row(s) imported.`,
          variant: "success",
        });
        bustClientCache(resourcePrefix("super-admin", "ppmp-files-summary"));
        loadFiles();
      } else if (res.error) {
        toast({
          title: "Import failed",
          description: res.error,
          variant: "error",
        });
      }
    });
  }

  const rows = files ?? [];
  const listedRows = rows.reduce((sum, f) => sum + (f.row_count ?? 0), 0);
  const listedYears = new Set(
    rows
      .map((f) => f.fiscal_year)
      .filter((year): year is number => typeof year === "number")
  );
  const latest = rows[0] ?? null;

  const totalWorkbooks = summary ? summary.files : rows.length;
  const totalRows = summary ? summary.rows : listedRows;
  const totalYears = summary ? summary.fiscalYears.length : listedYears.size;
  const loadingTiles = files === null && !summary;

  const tiles = [
    {
      label: "Workbooks",
      value: loadingTiles ? "—" : totalWorkbooks.toLocaleString("en-PH"),
      hint: "Uploaded PPMP files",
      icon: FileSpreadsheet,
      tone: "info" as const,
    },
    {
      label: "Rows ready",
      value: loadingTiles ? "—" : totalRows.toLocaleString("en-PH"),
      hint: "Parsed line items for analysis",
      icon: Layers3,
      tone: "ok" as const,
    },
    {
      label: "Fiscal years",
      value: loadingTiles ? "—" : totalYears.toLocaleString("en-PH"),
      hint: "Covered by all workbooks",
      icon: ChartColumn,
      tone: "warn" as const,
    },
    {
      label: "Last upload",
      value: files === null ? "—" : latest ? relTime(latest.created_at) : "None yet",
      hint: latest ? fmtDate(latest.created_at) : "Import a workbook to begin",
      icon: Clock3,
      tone: "neutral" as const,
    },
  ];

  return (
    <section className={styles.page}>
      <PageHeader
        eyebrow="Procurement planning"
        title="PPMP workspace"
        subtitle="Turn the agency's PPMP workbook into decisions — validate what was uploaded, compare fiscal years, and build next year's procurement plan in one place."
        meta={
          files === null && !summary
            ? "Loading the workspace…"
            : `${totalWorkbooks} workbook${totalWorkbooks === 1 ? "" : "s"} · ${totalRows.toLocaleString("en-PH")} rows ready`
        }
        actions={
          <Button
            type="button"
            variant="warning"
            className={YELLOW_BTN}
            onClick={() => setOpen(true)}
          >
            <Upload size={13} aria-hidden="true" />
            Import Excel
          </Button>
        }
      />

      <SummaryTiles tiles={tiles} ariaLabel="PPMP workspace summary" />

      <div className={styles.flow} aria-label="How the PPMP workspace works">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          return (
            <div key={step.title} className={styles.flowStep}>
              <span className={styles.flowIndex} aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className={styles.flowIcon} aria-hidden="true">
                <Icon size={16} />
              </span>
              <div className={styles.flowBody}>
                <p className={styles.flowTitle}>{step.title}</p>
                <p className={styles.flowText}>{step.text}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.grid}>
        <div className={styles.tools}>
          <article className={styles.tool} data-accent="blue">
            <div className={styles.toolHead}>
              <span className={styles.toolIcon} aria-hidden="true">
                <ChartColumn size={19} />
              </span>
              <div className={styles.toolHeading}>
                <div className={styles.toolTitleRow}>
                  <h2 className={styles.toolTitle}>PPMP analytics</h2>
                  <span className={styles.toolBadge} data-tone="info">
                    Compare
                  </span>
                </div>
                <p className={styles.toolText}>
                  Choose up to five workbooks and see how procurement has moved
                  — total cost, item counts, and year-over-year changes.
                </p>
              </div>
            </div>
            <ul className={styles.toolList}>
              <li>
                <CheckCircle2 size={13} aria-hidden="true" />
                Structure validation before every run
              </li>
              <li>
                <CheckCircle2 size={13} aria-hidden="true" />
                Cross-year comparison with clean totals
              </li>
              <li>
                <CheckCircle2 size={13} aria-hidden="true" />
                Category and item-level breakdowns
              </li>
            </ul>
            <div className={styles.toolFoot}>
              <span className={styles.toolHint}>
                {files === null
                  ? "Checking the library…"
                  : rows.length === 0
                    ? "Add a workbook to unlock analysis"
                    : `${rows.length} workbook${rows.length === 1 ? "" : "s"} available`}
              </span>
              <Button
                type="button"
                variant="warning"
                className={YELLOW_BTN}
                onClick={() => router.push("/super-admin/ppmp/analytics")}
              >
                Open analytics
                <ArrowRight size={13} aria-hidden="true" />
              </Button>
            </div>
          </article>

          <article className={styles.tool} data-accent="amber">
            <div className={styles.toolHead}>
              <span className={styles.toolIcon} aria-hidden="true">
                <Sparkles size={19} />
              </span>
              <div className={styles.toolHeading}>
                <div className={styles.toolTitleRow}>
                  <h2 className={styles.toolTitle}>PPMP planning</h2>
                  <span className={styles.toolBadge} data-tone="warn">
                    Forecast
                  </span>
                </div>
                <p className={styles.toolText}>
                  Draft next fiscal year’s PPMP using the uploaded history, growth
                  assumptions, and a budget ceiling you control.
                </p>
              </div>
            </div>
            <ul className={styles.toolList}>
              <li>
                <CheckCircle2 size={13} aria-hidden="true" />
                Growth and price-adjustment methods
              </li>
              <li>
                <CheckCircle2 size={13} aria-hidden="true" />
                Ceiling-aware recommendations
              </li>
              <li>
                <CheckCircle2 size={13} aria-hidden="true" />
                Export the draft back to Excel
              </li>
            </ul>
            <div className={styles.toolFoot}>
              <span className={styles.toolHint}>
                Plan any future fiscal year
              </span>
              <Button
                type="button"
                variant="warning"
                className={YELLOW_BTN}
                onClick={() => router.push("/super-admin/ppmp/planning")}
              >
                Open planning
                <ArrowRight size={13} aria-hidden="true" />
              </Button>
            </div>
          </article>
        </div>

        <aside className={styles.library} aria-label="Recent PPMP workbooks">
          <div className={styles.libraryHead}>
            <div>
              <h2 className={styles.libraryTitle}>Recent workbooks</h2>
              <p className={styles.librarySub}>
                Latest PPMP uploads across all personnel, newest first.
              </p>
            </div>
            <span className={styles.libraryCount} aria-hidden="true">
              {summary ? summary.files : files === null ? "…" : rows.length}
            </span>
          </div>

          {files === null ? (
            <div className={styles.fileList} aria-busy="true">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className={styles.fileSkeleton} aria-hidden="true">
                  <span className={styles.fileSkeletonIcon} />
                  <div className={styles.fileSkeletonBody}>
                    <span className={styles.fileSkeletonLine} />
                    <span className={styles.fileSkeletonMeta} />
                  </div>
                </div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className={styles.empty}>
              <span className={styles.emptyIcon} aria-hidden="true">
                <FileText size={20} />
              </span>
              <p className={styles.emptyTitle}>No workbooks yet</p>
              <p className={styles.emptyText}>
                Import the first PPMP Excel file to unlock analytics and
                planning.
              </p>
              <Button
                type="button"
                variant="warning"
                className={YELLOW_BTN}
                onClick={() => setOpen(true)}
              >
                <Upload size={13} aria-hidden="true" />
                Import Excel
              </Button>
            </div>
          ) : (
            <ul className={styles.fileList}>
              {rows.slice(0, 5).map((file) => (
                <li key={file.id} className={styles.fileRow}>
                  <span className={styles.fileIcon} aria-hidden="true">
                    <FileSpreadsheet size={15} />
                  </span>
                  <div className={styles.fileBody}>
                    <p className={styles.fileName} title={file.filename}>
                      {file.filename}
                    </p>
                    <p className={styles.fileMeta}>
                      {file.fiscal_year ? `FY ${file.fiscal_year}` : "FY unknown"}
                      <span aria-hidden="true">·</span>
                      {(file.row_count ?? 0).toLocaleString("en-PH")} rows
                      <span aria-hidden="true">·</span>
                      {fmtSize(file.file_size)}
                    </p>
                  </div>
                  <span className={styles.fileDate} title={fmtDate(file.created_at)}>
                    {relTime(file.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {rows.length > 0 ? (
            <button
              type="button"
              className={styles.libraryLink}
              onClick={() => router.push("/super-admin/ppmp/analytics")}
            >
              Compare these workbooks
              <ArrowRight size={13} aria-hidden="true" />
            </button>
          ) : null}
        </aside>
      </div>

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
                    ? "This workbook is already in the library"
                    : `${result.imported ?? 0} row(s) imported`}
                </p>
                <p className={styles.alertText}>
                  {result.duplicate
                    ? "No duplicate copy was stored."
                    : "The library is up to date."}
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
    </section>
  );
}
