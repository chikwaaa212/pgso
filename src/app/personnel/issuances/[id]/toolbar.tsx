"use client";

import { useState } from "react";
import {
  Check,
  FileSpreadsheet,
  Link2,
  Printer,
} from "lucide-react";
import {
  IssuanceAttachButton,
  IssuanceRemoveButton,
} from "@/components/personnel/IssuanceAttach";
import styles from "./report.module.css";

export function IssuanceToolbar({
  issuanceId,
  docType,
  imageUrl,
}: {
  issuanceId: string;
  docType: string;
  imageUrl: string | null;
}) {
  const isPar = docType === "PAR";
  const excelHref = isPar
    ? `/api/personnel/issuances/${issuanceId}/par-xlsx`
    : `/api/personnel/issuances/${issuanceId}/ics-xlsx`;
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={styles.actions}>
      <button
        type="button"
        className={styles.btnPrimary}
        onClick={() => window.print()}
        title="Print this form or save it as a PDF"
      >
        <Printer size={13} aria-hidden="true" />
        Print / Save PDF
      </button>
      <a
        href={excelHref}
        className={styles.btnMuted}
        title="Download this form as an Excel workbook"
      >
        <FileSpreadsheet size={13} aria-hidden="true" />
        Download Excel
      </a>
      <button
        type="button"
        className={styles.btnMuted}
        onClick={() => void copyLink()}
        title="Copy a direct link to this record"
      >
        {copied ? (
          <Check size={13} aria-hidden="true" />
        ) : (
          <Link2 size={13} aria-hidden="true" />
        )}
        {copied ? "Link copied" : "Copy link"}
      </button>
      {imageUrl ? (
        <IssuanceRemoveButton
          issuanceId={issuanceId}
          imageUrl={imageUrl}
          triggerClassName={styles.btnMuted}
        />
      ) : (
        <IssuanceAttachButton
          issuanceId={issuanceId}
          triggerClassName={styles.btnMuted}
        />
      )}
    </div>
  );
}
