"use client";

import type { InspectedFile } from "./actions";
import type { SheetKind } from "@/lib/ppmp/types";

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
    return "rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800";
  if (severity === "warning")
    return "rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900";
  return "rounded-md border border-navy-200 bg-navy-50 px-3 py-2 text-sm text-navy-900";
}

export function ValidationPreview({ files }: { files: InspectedFile[] }) {
  return (
    <div className="grid gap-4">
      {files.map((f) => {
        const usable = f.profile.sheets.filter((s) => s.kind === "LINE_LIST").length;
        const year = f.storedYear ?? f.profile.fiscalYear;
        return (
          <section
            key={f.fileId}
            className="rounded-md border border-navy-200 bg-white p-4"
            aria-label={`Validation for ${f.filename}`}
          >
            <h3 className="truncate text-sm font-semibold text-navy-900">
              {f.filename}
            </h3>
            <p className="mt-0.5 text-xs text-zinc-500">
              Fiscal year: {year ?? "unresolved — confirm before comparing years"}
              {f.profile.office ? ` · Office: ${f.profile.office}` : ""}
              {` · ${usable} usable sheet(s) of ${f.profile.sheets.length}`}
            </p>

            {f.profile.sheets.length > 0 ? (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-xs">
                  <thead>
                    <tr className="text-zinc-500">
                      <th className="px-2 py-1 font-medium">Sheet</th>
                      <th className="px-2 py-1 font-medium">Kind</th>
                      <th className="px-2 py-1 font-medium">Rows</th>
                      <th className="px-2 py-1 font-medium">Cols</th>
                      <th className="px-2 py-1 font-medium">Header row</th>
                    </tr>
                  </thead>
                  <tbody>
                    {f.profile.sheets.map((s) => (
                      <tr key={s.name} className="border-t border-navy-100 text-navy-900">
                        <td className="max-w-[260px] truncate px-2 py-1.5 font-medium">
                          {s.name}
                        </td>
                        <td className="px-2 py-1.5">
                          <span className={KIND_STYLE[s.kind]} title={s.skipReason ?? undefined}>
                            {KIND_LABEL[s.kind]}
                          </span>
                        </td>
                        <td className="px-2 py-1.5">{s.rows}</td>
                        <td className="px-2 py-1.5">{s.cols}</td>
                        <td className="px-2 py-1.5">
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
                    <span className="font-semibold">
                      {issue.severity === "error"
                        ? "Error"
                        : issue.severity === "warning"
                          ? "Warning"
                          : "Note"}
                      {issue.sheet ? ` · ${issue.sheet}` : ""}:
                    </span>{" "}
                    {issue.message}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-green-800">
                No validation issues — every sheet is usable.
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
