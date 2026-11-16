"use client";

import { AlertTriangle, CheckCircle2, Info, Table2 } from "lucide-react";
import type { InspectedFile } from "./actions";
import type { SheetKind } from "@/lib/ppmp/types";
import styles from "../workspace.module.css";

const KIND_STYLE: Record<SheetKind, string> = {
  LINE_LIST:
    "inline-flex rounded-full border border-green-300 bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-900",
  PIVOT_SUMMARY:
    "inline-flex rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900",
  SKIP:
    "inline-flex rounded-full border border-zinc-300 bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600",
};

const KIND_LABEL: Record<SheetKind, string> = {
  LINE_LIST: "line items",
  PIVOT_SUMMARY: "budget matrix",
  SKIP: "skipped",
};

function severityCls(severity: string): string {
  if (severity === "error")
    return "flex items-start gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800";
  if (severity === "warning")
    return "flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900";
  return "flex items-start gap-2 rounded-md border border-navy-200 bg-navy-50 px-3 py-2 text-sm text-navy-900";
}

function SeverityIcon({ severity }: { severity: string }) {
  if (severity === "error") return <AlertTriangle size={14} aria-hidden="true" />;
  if (severity === "warning") return <AlertTriangle size={14} aria-hidden="true" />;
  return <Info size={14} aria-hidden="true" />;
}

export function ValidationPreview({ files }: { files: InspectedFile[] }) {
  return (
    <div className="grid gap-3">
      {files.map((f) => {
        const usable = f.profile.sheets.filter((s) => s.kind === "LINE_LIST").length;
        const year = f.storedYear ?? f.profile.fiscalYear;
        const errors = f.profile.issues.filter((i) => i.severity === "error").length;
        const warnings = f.profile.issues.filter((i) => i.severity === "warning").length;
        return (
          <section
            key={f.fileId}
            className="overflow-hidden rounded-lg border border-navy-200 bg-white"
            aria-label={`Validation for ${f.filename}`}
          >
            <header className="flex flex-wrap items-start justify-between gap-2 border-b border-navy-100 bg-navy-50/50 px-3.5 py-2.5">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-navy-900" title={f.filename}>
                  {f.filename}
                </h3>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500">
                  <span className="inline-flex items-center gap-1">
                    <Table2 size={12} aria-hidden="true" />
                    {usable} usable sheet(s) of {f.profile.sheets.length}
                  </span>
                  {f.profile.office ? <span>· Office: {f.profile.office}</span> : null}
                  <span>
                    · Fiscal year:{" "}
                    {year ?? (
                      <span className="font-medium text-amber-800">
                        unresolved — confirm before comparing years
                      </span>
                    )}
                  </span>
                </p>
              </div>
              <span className={styles.status} data-tone={errors > 0 ? "bad" : warnings > 0 ? "warn" : "ok"}>
                <span className={styles.statusDot} aria-hidden="true" />
                {errors > 0
                  ? `${errors} error(s)`
                  : warnings > 0
                    ? `${warnings} warning(s)`
                    : "Ready"}
              </span>
            </header>

            <div className="px-3.5 py-3">
              {f.profile.sheets.length > 0 ? (
                <div className="overflow-x-auto rounded-md border border-navy-100">
                  <table className="w-full min-w-[520px] text-left text-xs">
                    <thead>
                      <tr className="bg-navy-50/60 text-zinc-500">
                        <th className="px-2.5 py-1.5 font-semibold">Sheet</th>
                        <th className="px-2.5 py-1.5 font-semibold">Kind</th>
                        <th className="px-2.5 py-1.5 text-right font-semibold">Rows</th>
                        <th className="px-2.5 py-1.5 text-right font-semibold">Cols</th>
                        <th className="px-2.5 py-1.5 font-semibold">Header row</th>
                      </tr>
                    </thead>
                    <tbody>
                      {f.profile.sheets.map((s) => (
                        <tr key={s.name} className="border-t border-navy-100 text-navy-900">
                          <td className="max-w-[260px] truncate px-2.5 py-1.5 font-medium" title={s.name}>
                            {s.name}
                          </td>
                          <td className="px-2.5 py-1.5">
                            <span className={KIND_STYLE[s.kind]} title={s.skipReason ?? undefined}>
                              {KIND_LABEL[s.kind]}
                            </span>
                          </td>
                          <td className="px-2.5 py-1.5 text-right tabular-nums">{s.rows}</td>
                          <td className="px-2.5 py-1.5 text-right tabular-nums">{s.cols}</td>
                          <td className="px-2.5 py-1.5">
                            {s.headerRow !== null && s.headerRow !== undefined
                              ? `row ${s.headerRow}`
                              : s.skipReason ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {f.profile.issues.length > 0 ? (
                <ul className="mt-3 grid gap-2">
                  {f.profile.issues.map((issue, i) => (
                    <li key={`${issue.code}-${i}`} className={severityCls(issue.severity)}>
                      <SeverityIcon severity={issue.severity} />
                      <span>
                        <span className="font-semibold">
                          {issue.severity === "error"
                            ? "Error"
                            : issue.severity === "warning"
                              ? "Warning"
                              : "Note"}
                          {issue.sheet ? ` · ${issue.sheet}` : ""}:
                        </span>{" "}
                        {issue.message}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-green-800">
                  <CheckCircle2 size={13} aria-hidden="true" />
                  No validation issues — every sheet is usable.
                </p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
