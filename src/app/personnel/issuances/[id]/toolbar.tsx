"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  IssuanceAttachButton,
  IssuanceRemoveButton,
} from "@/components/personnel/IssuanceAttach";
import receipt from "../../inspections/components/receipt.module.css";

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
  const tab = isPar ? "par" : "ics";

  return (
    <div className={receipt.toolbar}>
      <Link
        href={`/personnel/documents?tab=${tab}`}
        className={cn(receipt.toolbarBtn, receipt.toolbarGhost)}
      >
        Back to documents
      </Link>
      <Link
        href="/personnel/documents?tab=par"
        className={cn(receipt.toolbarBtn, receipt.toolbarGhost)}
      >
        PAR / ICS list
      </Link>
      <button
        type="button"
        className={cn(receipt.toolbarBtn, receipt.toolbarPrint)}
        onClick={() => window.print()}
      >
        Print / Save PDF
      </button>
      <a
        href={excelHref}
        className={cn(receipt.toolbarBtn, receipt.toolbarGhost)}
      >
        Download Excel
      </a>
      {imageUrl ? (
        <IssuanceRemoveButton issuanceId={issuanceId} imageUrl={imageUrl} />
      ) : (
        <IssuanceAttachButton issuanceId={issuanceId} />
      )}
    </div>
  );
}
