import Image from "next/image";
import { Card } from "@/components/ui/card";
import styles from "./page.module.css";

/**
 * My Requests skeleton — mirrors EmployeeRequestsPage 1:1 (crumb,
 * header with back button + mascot, file-a-request form panel, 8-col
 * history table) so content swaps in without layout shift.
 *
 * Static chrome renders as real text with real classes; only live values
 * are pulse placeholders sized to the real controls. Interactive controls
 * render as inert spans so nothing fires while loading.
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

function FieldSkeleton({ label }: { label: string }) {
  return (
    <span
      aria-hidden="true"
      style={{ fontSize: "0.75rem", fontWeight: 600, display: "block" }}
    >
      {label}
      <span
        className="mt-1 block h-[37px] w-full animate-pulse rounded-[0.375rem] bg-navy-100"
        style={{ border: "1px solid var(--color-navy-300)" }}
      />
    </span>
  );
}

export default function EmployeeRequestsLoading() {
  return (
    <section
      className={styles.section}
      aria-busy="true"
      aria-label="Loading my requests"
    >
      <p className={styles.crumb}>Employee / My Requests</p>

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
          <h1 className={styles.title}>My Requests</h1>
          <p className={styles.subtitle} aria-hidden="true">
            <span className="mt-1 block h-4 w-48 animate-pulse rounded bg-navy-100" />
          </p>
        </div>
        <Image
          src="/salute.png"
          alt="Saluting eagle mascot"
          width={120}
          height={120}
          priority
          className={styles.mascot}
        />
      </div>

      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>File a new request</h2>
        <p className={styles.panelSub}>
          Transfer or report a repair for an item assigned to you, or request
          a new assignment — new assignments can pick an asset or a stock lot
          (every delivery is an asset; stock is its quantity on hand).
          PGSO personnel review and act on it.
        </p>
        {/* Form — same layout as NewRequestForm, inert pulses */}
        <div
          aria-hidden="true"
          style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1rem" }}
        >
          <div style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "repeat(auto-fit, minmax(12rem, 1fr))" }}>
            <FieldSkeleton label="Send to (personnel) *" />
            <FieldSkeleton label="Request type *" />
            <FieldSkeleton label="Item (asset / stock, optional)" />
          </div>
          <span style={{ fontSize: "0.75rem", fontWeight: 600, display: "block" }}>
            Reason *
            <span className="mt-1 block h-[74px] w-full animate-pulse rounded-[0.375rem] bg-navy-100" />
          </span>
          <div>
            <span
              style={{
                display: "inline-block",
                padding: "0.5rem 1.25rem",
                fontSize: "0.875rem",
                fontWeight: 600,
                borderRadius: "0.375rem",
                border: "1px solid var(--color-navy-600)",
                background: "var(--color-navy-900)",
                color: "#fff",
                opacity: 0.6,
              }}
            >
              File request
            </span>
          </div>
        </div>
      </Card>

      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>Request history</h2>
        <p className={styles.panelSub}>Newest first, with live status.</p>
        <div className={styles.tableWrap}>
          <table className={styles.table} aria-hidden="true">
            <thead>
              <tr>
                {HISTORY_HEADERS.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, r) => (
                <tr key={r} style={{ opacity: 1 - r * 0.08 }}>
                  {HISTORY_HEADERS.map((h) => (
                    <td key={h}>
                      {h === "Status" ? (
                        <PillPulse />
                      ) : h === "QR" ? (
                        <span className="inline-flex h-8 items-center rounded-[4px] border border-navy-200 px-3.5 text-xs font-semibold opacity-60">
                          View QR
                        </span>
                      ) : h === "Item" ? (
                        <TextPulse className="h-3.5 w-32" />
                      ) : h === "Reason" ? (
                        <TextPulse className="h-3.5 w-40" />
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
      </Card>
    </section>
  );
}
