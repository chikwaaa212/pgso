import { Card } from "@/components/ui/card";
import { DocumentsTableSkeleton } from "@/components/personnel/DocumentsTableSkeleton";
import { FileStack, Info } from "lucide-react";
import stockStyles from "../stocks/page.module.css";
import docs from "./page.module.css";

/**
 * Documents-specific skeleton — mirrors the receipt library 1:1
 * (eyebrow + header, tip strip, three summary tiles, type tabs with count
 * pills and the active-tab explanation, instant-search toolbar, tab-exact
 * table, pager) so content swaps in without layout shift.
 */

const TABS = [
  "Delivery",
  "Inspection",
  "Stocks",
  "Assets",
  "Repairs",
  "IAR Reports",
  "PAR",
  "ICS",
] as const;

const SUMMARY = [
  "Documents in library",
  "Delivery documents",
  "Unviewed receipts",
] as const;

function TextPulse({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`animate-pulse rounded bg-navy-100 ${className}`}
    />
  );
}

export default function DocumentsLoading() {
  return (
    <section
      className={docs.section}
      aria-busy="true"
      aria-label="Loading documents"
    >
      {/* Header — same structure and copy as the real page. */}
      <header className={docs.header}>
        <div className={docs.headerText}>
          <span className={docs.eyebrow}>
            <FileStack size={13} aria-hidden="true" />
            Document library
          </span>
          <h1 className={docs.title}>Documents</h1>
          <p className={docs.subtitle}>
            Every receipt and report in one place. Pick a type below, then click
            any row — or its <strong>Open</strong> button — to read or print the
            document.
          </p>
        </div>
      </header>

      {/* Tip strip — same blue guidance card. */}
      <div className={docs.tipStrip} aria-hidden="true">
        <span className={docs.tipIcon}>
          <Info size={15} aria-hidden="true" />
        </span>
        <p className={docs.tipText}>
          <strong>New here?</strong> Documents are added automatically as work
          happens — logging a delivery, passing an inspection, issuing an item,
          or closing a repair. Nothing here needs to be uploaded by hand.
        </p>
      </div>

      {/* Summary cards — library total, active tab, unviewed receipts. */}
      <div className={stockStyles.summary} aria-hidden="true">
        {SUMMARY.map((label) => (
          <div key={label} className={stockStyles.summaryCard}>
            <span
              className={`${stockStyles.summaryIcon} animate-pulse bg-navy-100`}
            />
            <div className={stockStyles.summaryBody}>
              <p className={stockStyles.summaryLabel}>{label}</p>
              <p className={stockStyles.summaryValue}>
                <TextPulse className="my-0.5 inline-block h-6 w-14" />
              </p>
              <p className={stockStyles.summaryMeta}>
                <TextPulse className="mt-1 inline-block h-3 w-32" />
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Type tabs + active-tab explanation. */}
      <div className={docs.tabsRow} aria-hidden="true">
        <div className={docs.tabs} role="tablist" aria-label="Document types">
          {TABS.map((t) => (
            <span key={t} className={docs.tab} data-active={t === "Delivery"}>
              <span className={docs.tabLabel}>{t}</span>
              <span className={docs.tabCount} data-active={t === "Delivery" ? "true" : undefined}>
                <span className="inline-block h-2.5 w-3 animate-pulse rounded bg-navy-100" />
              </span>
            </span>
          ))}
        </div>
        <p className={docs.tabHelp}>
          <span className="inline-block h-3 w-96 max-w-full animate-pulse rounded bg-navy-100" />
        </p>
      </div>

      <Card className={stockStyles.panel}>
        {/* Toolbar — live count, instant search, All / Unviewed toggle. */}
        <div className={stockStyles.toolbar} aria-hidden="true">
          <p className={stockStyles.toolbarInfo}>
            <TextPulse className="h-3.5 w-44" />
          </p>
          <div className={stockStyles.filters}>
            <div
              className={`${docs.search} h-8 animate-pulse rounded-md bg-navy-100`}
            />
            <div className="h-8 w-[11.5rem] animate-pulse rounded-full bg-navy-100" />
          </div>
        </div>

        {/* Table — exact columns for the delivery tab, 10 rows, real pager. */}
        <DocumentsTableSkeleton tab="delivery" label="Loading documents" />
      </Card>
    </section>
  );
}
