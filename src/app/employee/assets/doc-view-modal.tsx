"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import overlay from "@/app/personnel/documents/receipt-overlay.module.css";
import acc from "@/app/personnel/issuances/issuance.module.css";

function Pulse({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded bg-navy-100 ${className}`}
    />
  );
}

/**
 * Skeleton that mirrors the Appendix 71 (PAR) / Appendix 59 (ICS) sheet
 * 1:1 — appendix line, title, 2-col header, ruled items table, and the
 * two signature blocks — so the modal swaps real content in without
 * layout shift on cold starts.
 */
export function DocSheetSkeleton({
  docType,
  label,
}: {
  docType: string;
  label: string;
}) {
  const isIcs = docType === "ICS";
  const cols = isIcs
    ? ["Quantity", "Unit", "Unit Cost", "Total Cost", "Description", "Item No.", "Life"]
    : ["Quantity", "Unit", "Description", "Property No.", "Date Acq.", "Amount"];

  return (
    <div
      role="status"
      aria-label={label}
      className="flex w-full flex-col items-center"
    >
      <article
        className={acc.airSheet}
        aria-hidden="true"
        style={{ marginInline: "auto" }}
      >
        <p className={acc.appendix}>
          <span className="inline-block h-3 w-24 animate-pulse rounded bg-navy-100" />
        </p>
        <div className={acc.title}>
          <span className="mx-auto block h-4 w-64 animate-pulse rounded bg-navy-100" />
        </div>

        <div className={acc.headerGrid}>
          <div className={acc.headerColLeft}>
            {[0, 1].map((i) => (
              <div key={i} className={acc.field}>
                <Pulse className="h-3 w-24" />
                <Pulse className="h-4 flex-1" />
              </div>
            ))}
          </div>
          <div className={acc.headerColRight}>
            {[0, 1].map((i) => (
              <div key={i} className={acc.field}>
                <Pulse className="h-3 w-16" />
                <Pulse className="h-4 flex-1" />
              </div>
            ))}
          </div>
        </div>

        <table className={acc.itemsTable}>
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 8 }).map((_, r) => (
              <tr key={r} style={{ opacity: 1 - r * 0.08 }}>
                {cols.map((c) => (
                  <td key={c}>
                    <Pulse
                      className={`h-3.5 ${c === "Description" ? "w-full" : "mx-auto w-3/4"}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        <div className={acc.bottomGrid}>
          {[0, 1].map((s) => (
            <section
              key={s}
              className={s === 0 ? acc.bottomLeft : acc.bottomRight}
            >
              <p className={acc.bottomTitle}>
                <span className="mx-auto block h-3 w-28 animate-pulse rounded bg-navy-100" />
              </p>
              <div className={acc.bottomBody}>
                <div className={acc.sig}>
                  <Pulse className="mx-2 h-5" />
                  <Pulse className="mx-auto mt-1 h-2.5 w-48" />
                </div>
                <div className={acc.field} style={{ marginTop: 8 }}>
                  <Pulse className="h-3 w-28" />
                  <Pulse className="h-4 flex-1" />
                </div>
                <div className={acc.field}>
                  <Pulse className="h-3 w-12" />
                  <Pulse className="h-4 flex-1" />
                </div>
              </div>
            </section>
          ))}
        </div>
      </article>
      <span className="sr-only">{label}</span>
    </div>
  );
}

/**
 * Wide + tall modal viewport shared with the personnel documents page
 * (same overlay css) so PAR/ICS sheets render identically for employees.
 */
export function EmployeeDocModal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className={`${overlay.overlayContent} w-full sm:max-w-5xl`}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
