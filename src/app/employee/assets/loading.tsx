import Image from "next/image";
import { Card } from "@/components/ui/card";
import styles from "./page.module.css";

/**
 * My Assets skeleton — mirrors EmployeeAssetsPage 1:1 (crumb, header with
 * back button + mascot, 3 panels, 7/7/7-col tables) so content swaps in
 * without layout shift.
 *
 * Static chrome renders as real text with real classes; only live values
 * are pulse placeholders sized to the real cells. Interactive controls
 * render as inert spans so nothing fires while loading.
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
    <div
      aria-hidden="true"
      className={`animate-pulse rounded bg-navy-100 ${className}`}
    />
  );
}

function PillPulse({ className = "w-16" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`h-[22px] animate-pulse rounded-full bg-navy-100 ${className}`}
    />
  );
}

function TableSkeleton({ headers, rows = 5 }: { headers: readonly string[]; rows?: number }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table} aria-hidden="true">
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
                  {h === "Condition" || h === "Status" ? (
                    <PillPulse />
                  ) : h === "QR" ? (
                    <span className="inline-flex h-8 items-center rounded-[4px] border border-navy-200 px-3.5 text-xs font-semibold opacity-60">
                      View QR
                    </span>
                  ) : h === "Report" ? (
                    <span className={styles.inspectLinkSecondary}>View</span>
                  ) : h === "Download" ? (
                    <span className={styles.inspectLinkSecondary}>Excel (.xlsx)</span>
                  ) : (
                    <TextPulse className="h-3.5 w-20" />
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
      className={styles.section}
      aria-busy="true"
      aria-label="Loading my assets"
    >
      <p className={styles.crumb}>Employee / My Assets</p>

      {/* Header — same as the real page */}
      <div className={styles.headerRow}>
        <div>
          <span
            aria-hidden="true"
            style={{
              display: "inline-block",
              marginBottom: "0.5rem",
              padding: "0.375rem 0.75rem",
              fontSize: "0.75rem",
              fontWeight: 600,
              borderRadius: "0.375rem",
              border: "1px solid var(--color-navy-600)",
              background: "var(--color-navy-900)",
              color: "#fff",
              whiteSpace: "nowrap",
            }}
          >
            Back to Dashboard
          </span>
          <h1 className={styles.title}>My Assets</h1>
          <p className={styles.subtitle} aria-hidden="true">
            <span className="mt-1 block h-4 w-48 animate-pulse rounded bg-navy-100" />
          </p>
        </div>
        <Image
          src="/favicon.png"
          alt="PGSO logo"
          width={120}
          height={120}
          priority
          className={styles.mascot}
        />
      </div>

      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>Assigned assets</h2>
        <p className={styles.panelSub}>
          Property under your accountability. Report loss, damage, or needed repairs
          through My Requests.
        </p>
        <div className={styles.assetGrid} aria-hidden="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className={styles.assetCard} style={{ opacity: 1 - i * 0.08 }}>
              <div className={styles.assetTop}>
                <div className="h-9 w-9 animate-pulse rounded-lg bg-navy-100" />
                <div className="h-3.5 flex-1 animate-pulse rounded bg-navy-100" />
                <PillPulse className="w-20" />
              </div>
              <div className="h-4 w-2/3 animate-pulse rounded bg-navy-100" />
              <div className="flex flex-col gap-1.5">
                <div className="h-3 w-full animate-pulse rounded bg-navy-100" />
                <div className="h-3 w-5/6 animate-pulse rounded bg-navy-100" />
              </div>
              <div className={styles.assetMeta}>
                {[0, 1, 2].map((r) => (
                  <div key={r} className={styles.assetMetaRow}>
                    <div className="h-3 w-20 animate-pulse rounded bg-navy-100" />
                    <div className="h-3 w-24 animate-pulse rounded bg-navy-100" />
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </Card>

      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>Requested &amp; transferred to me</h2>
        <p className={styles.panelSub}>
          Your new assignments, transfers (assets or stock lots), and repairs —
          plus transfers others addressed to your name — with live status.
        </p>
        <TableSkeleton headers={REQUEST_HEADERS} />
      </Card>

      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>My PAR / ICS documents</h2>
        <p className={styles.panelSub}>
          Issuance records under your name — preview the record or download the Excel copy anytime.
        </p>
        <TableSkeleton headers={DOC_HEADERS} />
      </Card>
    </section>
  );
}
