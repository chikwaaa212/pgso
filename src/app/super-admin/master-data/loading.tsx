import { Card } from "@/components/ui/card";
import styles from "./page.module.css";

/**
 * Super-admin master-data skeleton — mirrors SuperAdminMasterDataPage 1:1
 * (crumb, header with counts, Units panel with add form + 5-col table
 * with toggle buttons, catalog panel with import button + add form +
 * 7-col table with Edit/Toggle buttons) so content swaps in without
 * layout shift.
 *
 * Static chrome renders as real text with the real classes; only live
 * values are pulse placeholders sized to the real cells.
 */

const smallBtnNavy: React.CSSProperties = {
  padding: "0.375rem 0.75rem",
  fontSize: "0.75rem",
  fontWeight: 600,
  borderRadius: "0.375rem",
  border: "1px solid var(--color-navy-600)",
  background: "var(--color-navy-900)",
  color: "#fff",
  whiteSpace: "nowrap",
};

const dashboardBtn = "inline-flex h-8 items-center rounded-[4px] bg-navy-900 px-3.5 text-xs font-semibold text-white";

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

export default function MasterDataLoading() {
  return (
    <section
      className={styles.section}
      aria-busy="true"
      aria-label="Loading master data"
    >
      <p className={styles.crumb}>Super Admin / Master Data</p>
      <div>
        <h1 className={styles.title}>Master Data</h1>
        <p className={styles.subtitle}>
          <span
            aria-hidden="true"
            className="inline-block h-4 w-56 animate-pulse rounded bg-navy-100 align-middle"
          />{" "}
          Personnel pick from these lists — deactivation is blocked while a
          value is in use.
        </p>
      </div>

      <Card className={styles.panel}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "nowrap" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 className={styles.panelTitle}>Units</h2>
            <p className={styles.panelSub}>
              Lowercase canonical names (e.g. piece, set, box). Abbreviations
              optional.
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center", flexShrink: 0 }} aria-hidden="true">
            <span className={dashboardBtn}>Add unit</span>
          </div>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table} aria-hidden="true">
            <thead>
              <tr>
                <th>Name</th>
                <th>Abbr</th>
                <th>Used in</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, r) => (
                <tr key={r} style={{ opacity: 1 - r * 0.08 }}>
                  <td>
                    <TextPulse className="h-3.5 w-20" />
                  </td>
                  <td>
                    <TextPulse className="h-3.5 w-12" />
                  </td>
                  <td>
                    <TextPulse className="h-3.5 w-8" />
                  </td>
                  <td>
                    <PillPulse />
                  </td>
                  <td>
                    <span style={smallBtnNavy}>Deactivate</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className={styles.panel}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "nowrap" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 className={styles.panelTitle}>
              Account catalog (code + title + name + asset type)
            </h2>
            <p className={styles.panelSub}>
              One record links the set together. Selecting a code auto-fills
              title and type in personnel forms (strict in Phase 3). Bulk-load
              via Import Excel using the template or the client&apos;s existing
              file — only matching columns are read, duplicates are skipped
              with a message, and only new codes are added.
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center", flexShrink: 0 }} aria-hidden="true">
            <span className={dashboardBtn}>Add catalog entry</span>
            <span style={smallBtnNavy}>Import Excel</span>
          </div>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table} aria-hidden="true">
            <thead>
              <tr>
                <th>Code</th>
                <th>Asset type</th>
                <th>Title</th>
                <th>Account name</th>
                <th>Used in</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 8 }).map((_, r) => (
                <tr key={r} style={{ opacity: 1 - r * 0.06 }}>
                  <td>
                    <TextPulse className="h-3.5 w-24" />
                  </td>
                  <td>
                    <TextPulse className="h-3.5 w-28" />
                  </td>
                  <td>
                    <TextPulse className="h-3.5 w-28" />
                  </td>
                  <td>
                    <TextPulse className="h-3.5 w-24" />
                  </td>
                  <td>
                    <TextPulse className="h-3.5 w-8" />
                  </td>
                  <td>
                    <PillPulse />
                  </td>
                  <td>
                    <span style={{ display: "flex", gap: "0.375rem", whiteSpace: "nowrap" }}>
                      <span style={smallBtnNavy}>Edit</span>
                      <span style={smallBtnNavy}>Deactivate</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}
