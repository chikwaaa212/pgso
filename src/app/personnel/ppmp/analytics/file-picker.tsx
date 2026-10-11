"use client";

import type { PpmpFileRow } from "../actions";

export const MAX_SELECT = 3;

function formatSize(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return "—";
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-PH");
}

export function FilePicker({
  files,
  selected,
  onToggle,
}: {
  files: PpmpFileRow[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  if (files.length === 0) {
    return (
      <p className="rounded-md border border-navy-200 bg-white px-3 py-4 text-sm text-zinc-600">
        No PPMP files yet. Upload one from the PPMP page first.
      </p>
    );
  }
  return (
    <ul className="grid gap-2">
      {files.map((f) => {
        const checked = selected.includes(f.id);
        return (
          <li key={f.id}>
            <label
              className={
                "flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 text-sm transition-colors " +
                (checked
                  ? "border-navy-600 bg-navy-50"
                  : "border-navy-200 bg-white hover:border-navy-400")
              }
            >
              <input
                type="checkbox"
                className="mt-1 size-4 accent-navy-900"
                checked={checked}
                onChange={() => onToggle(f.id)}
                aria-label={`Select ${f.filename}`}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-navy-900">
                  {f.filename}
                </span>
                <span className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-zinc-500">
                  <span>
                    Year: {f.fiscal_year ?? "unresolved"}
                    {f.fiscal_year_source ? ` (${f.fiscal_year_source})` : ""}
                  </span>
                  <span>{formatSize(f.file_size)}</span>
                  <span>
                    {f.row_count !== null && f.row_count !== undefined
                      ? `${f.row_count} rows`
                      : "rows unknown"}
                  </span>
                  <span>{formatDate(f.created_at)}</span>
                  {f.file_hash ? null : <span>legacy record (re-upload to analyze)</span>}
                </span>
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
