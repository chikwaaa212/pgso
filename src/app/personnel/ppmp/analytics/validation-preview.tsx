"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { InspectedFile } from "./actions";
import styles from "../workspace.module.css";

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/** One-line summary of what the parser will use from a workbook. */
function summaryFor(f: InspectedFile) {
  const usable = f.profile.sheets.filter((s) => s.kind === "LINE_LIST").length;
  const matrices = f.profile.sheets.filter((s) => s.kind === "PIVOT_SUMMARY").length;
  const skipped = f.profile.sheets.filter((s) => s.kind === "SKIP").length;
  const total = f.profile.sheets.length;

  const parts: string[] = [];
  if (usable > 0) parts.push(`${plural(usable, "sheet", "sheets")} ready`);
  else parts.push("no usable sheets");
  if (matrices > 0) parts.push(plural(matrices, "budget matrix", "budget matrices"));
  if (skipped > 0) parts.push(plural(skipped, "reference sheet", "reference sheets"));
  return `${parts.join(" · ")} (${total} seen)`;
}

/**
 * Compact validation banner. Only blocking/warning issues are surfaced —
 * informational notes are folded into the one-line summary so the step stays
 * a short banner instead of a long list.
 */
export function ValidationPreview({ files }: { files: InspectedFile[] }) {
  return (
    <div className="grid gap-2">
      {files.map((f) => {
        const year = f.storedYear ?? f.profile.fiscalYear;
        const errors = f.profile.issues.filter((i) => i.severity === "error");
        const warnings = f.profile.issues.filter((i) => i.severity === "warning");
        const tone = errors.length > 0 ? "bad" : warnings.length > 0 ? "warn" : "ok";

        return (
          <div key={f.fileId} className="grid gap-1.5">
            <div className={styles.banner} data-tone={tone}>
              <span className={styles.bannerIcon} aria-hidden="true">
                {tone === "ok" ? (
                  <CheckCircle2 size={15} />
                ) : (
                  <AlertTriangle size={15} />
                )}
              </span>
              <p className={styles.bannerText} title={f.filename}>
                <span className="font-semibold">{f.filename}</span>
                <span aria-hidden="true"> — </span>
                {summaryFor(f)} · FY {year ?? "unresolved"}
              </p>
              <span className={styles.status} data-tone={tone}>
                <span className={styles.statusDot} aria-hidden="true" />
                {errors.length > 0
                  ? `${errors.length} error(s)`
                  : warnings.length > 0
                    ? `${warnings.length} warning(s)`
                    : "Ready"}
              </span>
            </div>

            {[...errors, ...warnings].map((issue, i) => (
              <p key={`${issue.code}-${i}`} className={styles.bannerNote} data-tone={issue.severity}>
                {issue.message}
              </p>
            ))}
          </div>
        );
      })}
    </div>
  );
}
