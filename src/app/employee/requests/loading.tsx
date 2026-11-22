import {
  CheckCircle2,
  ClipboardList,
  Clock3,
  Plus,
  Search,
  Send,
} from "lucide-react";
import shell from "../page-shell.module.css";
import styles from "./page.module.css";

/**
 * My Requests skeleton - mirrors the real page (breadcrumb, page head, stat
 * strip, filing form panel and the filterable history table) so content swaps
 * in without layout shift. Interactive controls render as inert pulses.
 */

const HISTORY_HEADERS = [
  "Type",
  "Sent to",
  "Item",
  "Reason",
  "Status",
  "Filed",
  "Resolved",
  "QR",
] as const;

function TextPulse({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block animate-pulse rounded bg-navy-100 ${className}`}
    />
  );
}

function FieldSkeleton({ label }: { label: string }) {
  return (
    <span
      aria-hidden="true"
      className="block text-[0.75rem] font-semibold text-navy-800"
    >
      {label}
      <span className="mt-1 block h-8 w-full animate-pulse rounded-[0.375rem] bg-navy-100" />
    </span>
  );
}

export default function EmployeeRequestsLoading() {
  return (
    <section
      className={shell.page}
      aria-busy="true"
      aria-label="Loading my requests"
    >
      <nav className={shell.crumb} aria-hidden="true">
        <span>Employee</span>
        <span>/</span>
        <span data-current="true">My Requests</span>
      </nav>

      <header className={shell.pageHead}>
        <div className={shell.headText}>
          <span className={shell.eyebrow}>
            <ClipboardList size={12} aria-hidden="true" />
            Service desk
          </span>
          <h1 className={shell.title}>My Requests</h1>
          <p className={shell.subtitle}>
            Transfer or report an item for repair, or request a new assignment.
          </p>
        </div>
        <div className={shell.headActions} aria-hidden="true">
          <span className="h-8 w-24 animate-pulse rounded-md bg-navy-100" />
          <span className="h-8 w-32 animate-pulse rounded-md bg-navy-100" />
        </div>
      </header>

      <div className={shell.statStrip} aria-hidden="true">
        {[ClipboardList, Clock3, Send, CheckCircle2].map((Icon, i) => (
          <div key={i} className={shell.stat} style={{ opacity: 1 - i * 0.06 }}>
            <span className={shell.statIcon}>
              <Icon size={15} aria-hidden="true" />
            </span>
            <span className={shell.statBody}>
              <TextPulse className="h-4 w-8" />
              <TextPulse className="mt-1.5 h-2.5 w-24" />
            </span>
          </div>
        ))}
      </div>

      <section className={shell.panel}>
        <header className={shell.panelHead}>
          <div className={shell.panelHeadText}>
            <h2 className={shell.panelTitle}>
              <Plus size={15} aria-hidden="true" />
              File a new request
            </h2>
            <p className={shell.panelSub}>
              New assignments can pick an asset or a stock lot (every delivery is an
              asset; stock is its quantity on hand).
            </p>
          </div>
        </header>
        <div className={styles.formWrap} aria-hidden="true">
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(12rem,1fr))]">
              <FieldSkeleton label="Send to (personnel) *" />
              <FieldSkeleton label="Request type *" />
              <FieldSkeleton label="Item (asset / stock, optional)" />
            </div>
            <FieldSkeleton label="Reason *" />
            <span className="block h-8 w-28 animate-pulse rounded-[0.375rem] bg-navy-700/70" />
          </div>
        </div>
      </section>

      <section className={shell.panel}>
        <header className={shell.panelHead}>
          <div className={shell.panelHeadText}>
            <h2 className={shell.panelTitle}>
              <ClipboardList size={15} aria-hidden="true" />
              Request history
            </h2>
            <p className={shell.panelSub}>
              Newest first, with live status and the QR copy once completed.
            </p>
          </div>
        </header>

        <div className={shell.toolbar} aria-hidden="true">
          <div className={shell.search}>
            <Search className={shell.searchIcon} aria-hidden="true" />
            <span className="block h-8 w-full animate-pulse rounded-md bg-navy-100" />
          </div>
          <div className={shell.filters}>
            {[52, 72, 78, 88, 74].map((w, i) => (
              <span
                key={i}
                className="h-8 animate-pulse rounded-md bg-navy-100"
                style={{ width: w }}
              />
            ))}
          </div>
        </div>

        <div className={shell.tableWrap}>
          <table className={shell.table} aria-hidden="true">
            <thead>
              <tr>
                {HISTORY_HEADERS.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 4 }).map((_, r) => (
                <tr key={r} style={{ opacity: 1 - r * 0.08 }}>
                  {HISTORY_HEADERS.map((h) => (
                    <td key={h}>
                      {h === "Status" ? (
                        <span className="block h-[18px] w-16 animate-pulse rounded-full bg-navy-100" />
                      ) : h === "QR" ? (
                        <span className="inline-flex h-7 items-center rounded-[0.3125rem] border border-navy-200 px-2.5 text-[0.6875rem] font-semibold opacity-60">
                          View QR
                        </span>
                      ) : h === "Item" ? (
                        <TextPulse className="h-3 w-32" />
                      ) : h === "Reason" ? (
                        <TextPulse className="h-3 w-40" />
                      ) : (
                        <TextPulse className="h-3 w-20" />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
