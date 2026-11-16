"use client";

import { AlertTriangle, Check, FileSpreadsheet } from "lucide-react";
import type { PpmpFileRow } from "../actions";
import styles from "../workspace.module.css";

export const MAX_SELECT = 3;

function formatSize(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return "—";
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Workbook picker: card rows with a clear selected state, fiscal-year badge,
 * and the metadata that matters before a run (rows, size, upload date).
 */
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
      <div className={styles.empty}>
        <span className={styles.emptyIcon} aria-hidden="true">
          <FileSpreadsheet size={20} />
        </span>
        <p className={styles.emptyTitle}>No workbooks in your library</p>
        <p className={styles.emptyText}>
          Import a PPMP .xlsx from the PPMP workspace first, then come back to
          select it here.
        </p>
      </div>
    );
  }

  return (
    <ul className={styles.pickerGrid}>
      {files.map((f) => {
        const checked = selected.includes(f.id);
        const yearKnown = typeof f.fiscal_year === "number";
        return (
          <li key={f.id}>
            <label
              className={styles.pickCard}
              data-checked={checked ? "true" : "false"}
            >
              <input
                type="checkbox"
                className={styles.pickCheck}
                checked={checked}
                onChange={() => onToggle(f.id)}
                aria-label={`Select ${f.filename}`}
              />
              <span className={styles.pickIcon} aria-hidden="true">
                <FileSpreadsheet size={16} />
              </span>
              <span className={styles.pickBody}>
                <span className={styles.pickTop}>
                  <span className={styles.pickName} title={f.filename}>
                    {f.filename}
                  </span>
                  <span
                    className={styles.pickYear}
                    data-tone={yearKnown ? undefined : "warn"}
                  >
                    {yearKnown ? `FY ${f.fiscal_year}` : "FY unresolved"}
                  </span>
                </span>
                <span className={styles.pickMeta}>
                  <span>
                    {f.row_count !== null && f.row_count !== undefined
                      ? `${f.row_count.toLocaleString("en-PH")} rows`
                      : "rows unknown"}
                  </span>
                  <span>{formatSize(f.file_size)}</span>
                  <span>{formatDate(f.created_at)}</span>
                  {f.fiscal_year_source ? (
                    <span>year from {f.fiscal_year_source}</span>
                  ) : null}
                </span>
                {f.file_hash ? null : (
                  <span className={styles.pickWarn}>
                    <AlertTriangle size={12} aria-hidden="true" />
                    Legacy record — re-upload to analyze
                  </span>
                )}
              </span>
              {checked ? (
                <span
                  className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-navy-900 text-white"
                  aria-hidden="true"
                >
                  <Check size={12} />
                </span>
              ) : null}
            </label>
          </li>
        );
      })}
    </ul>
  );
}
