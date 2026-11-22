import {
  Boxes,
  ClipboardList,
  FileText,
  Package,
  Search,
  ShieldCheck,
} from "lucide-react";
import shell from "../page-shell.module.css";
import styles from "./page.module.css";

/**
 * My Assets skeleton - mirrors the real page (breadcrumb, page head, stat
 * strip, filter toolbar, asset grid and the two tables) so content swaps in
 * without layout shift. Static chrome renders as real text; only live values
 * pulse.
 */

const REQUEST_HEADERS = [
  "Type",
  "Item",
  "From",
  "Status",
  "Filed",
  "Resolved",
  "QR",
] as const;

const DOC_HEADERS = [
  "Doc",
  "Type",
  "Date",
  "Qty",
  "Asset",
  "Report",
  "Download",
] as const;

function TextPulse({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block animate-pulse rounded bg-navy-100 ${className}`}
    />
  );
}

function PillPulse({ className = "w-16" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block h-[18px] animate-pulse rounded-full bg-navy-100 ${className}`}
    />
  );
}

function TableSkeleton({
  headers,
  rows = 4,
}: {
  headers: readonly string[];
  rows?: number;
}) {
  return (
    <div className={shell.tableWrap}>
      <table className={shell.table} aria-hidden="true">
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r} style={{ opacity: 1 - r * 0.08 }}>
              {headers.map((h) => (
                <td key={h}>
                  {h === "Status" ? (
                    <PillPulse />
                  ) : h === "QR" ? (
                    <span className="inline-flex h-7 items-center rounded-[0.3125rem] border border-navy-200 px-2.5 text-[0.6875rem] font-semibold opacity-60">
                      View QR
                    </span>
                  ) : h === "Report" || h === "Download" ? (
                    <span className="inline-flex h-7 items-center rounded-[0.3125rem] border border-navy-200 px-2.5 text-[0.6875rem] font-semibold opacity-60">
                      {h === "Report" ? "View" : "Excel (.xlsx)"}
                    </span>
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
  );
}

export default function EmployeeAssetsLoading() {
  return (
    <section
      className={shell.page}
      aria-busy="true"
      aria-label="Loading my assets"
    >
      <nav className={shell.crumb} aria-hidden="true">
        <span>Employee</span>
        <span>/</span>
        <span data-current="true">My Assets</span>
      </nav>

      <header className={shell.pageHead}>
        <div className={shell.headText}>
          <span className={shell.eyebrow}>
            <ShieldCheck size={12} aria-hidden="true" />
            My accountability
          </span>
          <h1 className={shell.title}>My Assets</h1>
          <p className={shell.subtitle}>
            Property, consumables and PAR / ICS records under your name.
          </p>
        </div>
        <div className={shell.headActions} aria-hidden="true">
          <span className="h-8 w-28 animate-pulse rounded-md bg-navy-100" />
          <span className="h-8 w-32 animate-pulse rounded-md bg-navy-100" />
        </div>
      </header>

      <div className={shell.statStrip} aria-hidden="true">
        {[Package, ShieldCheck, Boxes, FileText].map((Icon, i) => (
          <div key={i} className={shell.stat} style={{ opacity: 1 - i * 0.06 }}>
            <span className={shell.statIcon}>
              <Icon size={15} aria-hidden="true" />
            </span>
            <span className={shell.statBody}>
              <TextPulse className="h-4 w-10" />
              <TextPulse className="mt-1.5 h-2.5 w-24" />
            </span>
          </div>
        ))}
      </div>

      <section className={shell.panel}>
        <header className={shell.panelHead}>
          <div className={shell.panelHeadText}>
            <h2 className={shell.panelTitle}>
              <Package size={15} aria-hidden="true" />
              Assigned assets
            </h2>
            <p className={shell.panelSub}>
              Property under your accountability - requested or issued directly by
              PGSO personnel.
            </p>
          </div>
          <div className={shell.panelActions} aria-hidden="true">
            <span className={shell.countBadge}>
              <TextPulse className="h-2.5 w-4" />
            </span>
          </div>
        </header>

        <div className={shell.toolbar} aria-hidden="true">
          <div className={shell.search}>
            <Search className={shell.searchIcon} aria-hidden="true" />
            <span className="block h-8 w-full animate-pulse rounded-md bg-navy-100" />
          </div>
          <div className={shell.filters}>
            {[64, 74, 88].map((w, i) => (
              <span
                key={i}
                className="h-8 animate-pulse rounded-md bg-navy-100"
                style={{ width: w }}
              />
            ))}
          </div>
        </div>

        <div className={styles.assetGrid} aria-hidden="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <article
              key={i}
              className={styles.assetCard}
              style={{ opacity: 1 - i * 0.07 }}
            >
              <div className={styles.assetTop}>
                <span className="h-8 w-8 animate-pulse rounded-md bg-navy-100" />
                <span className="h-3 flex-1 animate-pulse rounded bg-navy-100" />
                <PillPulse className="w-16" />
              </div>
              <TextPulse className="h-3.5 w-2/3" />
              <div className="flex flex-col gap-1.5">
                <TextPulse className="h-3 w-full" />
                <TextPulse className="h-3 w-5/6" />
              </div>
              <div className={styles.assetMeta}>
                {[0, 1, 2, 3].map((r) => (
                  <div key={r} className={styles.assetMetaRow}>
                    <TextPulse className="h-2.5 w-16" />
                    <TextPulse className="h-2.5 w-20" />
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={shell.panel}>
        <header className={shell.panelHead}>
          <div className={shell.panelHeadText}>
            <h2 className={shell.panelTitle}>
              <ClipboardList size={15} aria-hidden="true" />
              Requested &amp; transferred to me
            </h2>
            <p className={shell.panelSub}>
              New assignments, transfers and repairs you filed - plus transfers
              others addressed to your name.
            </p>
          </div>
        </header>
        <TableSkeleton headers={REQUEST_HEADERS} />
      </section>

      <section className={shell.panel}>
        <header className={shell.panelHead}>
          <div className={shell.panelHeadText}>
            <h2 className={shell.panelTitle}>
              <FileText size={15} aria-hidden="true" />
              My PAR / ICS documents
            </h2>
            <p className={shell.panelSub}>
              Issuance records under your name - preview the sheet or download the
              Excel copy anytime.
            </p>
          </div>
        </header>
        <TableSkeleton headers={DOC_HEADERS} />
      </section>
    </section>
  );
}
