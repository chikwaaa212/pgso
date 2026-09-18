import { Card } from "@/components/ui/card";
import styles from "@/app/personnel/dashboard/page.module.css";
import assetStyles from "@/app/personnel/assets/page.module.css";

/**
 * Super-admin assets skeleton — mirrors SuperAdminAssetsPage 1:1 (crumb,
 * header + 2 actions, right-packed search + 4 filter selects, the
 * 35-column table with View Details buttons, pager) so content swaps in
 * without layout shift.
 *
 * Static chrome renders as real text with the real classes; only live
 * values are pulse placeholders sized to the real cells. Same pattern
 * as the personnel assets skeleton.
 */

type ColKind = "details" | "narrow" | "base" | "wide" | "xl" | "cost" | "status";

const HEADERS: { label: string; className: string; kind: ColKind }[] = [
  { label: "Details", className: assetStyles.colDetails, kind: "details" },
  { label: "Account Code", className: assetStyles.colBase, kind: "base" },
  { label: "Property No.", className: assetStyles.colBase, kind: "base" },
  { label: "Asset Type", className: assetStyles.colWide, kind: "wide" },
  { label: "Account Title", className: assetStyles.colWide, kind: "wide" },
  { label: "Account Name", className: assetStyles.colWide, kind: "wide" },
  { label: "Identifier", className: assetStyles.colBase, kind: "base" },
  { label: "Article", className: assetStyles.colWide, kind: "wide" },
  { label: "Qty.", className: assetStyles.colNarrow, kind: "narrow" },
  { label: "Unit", className: assetStyles.colNarrow, kind: "narrow" },
  { label: "Description", className: assetStyles.colXl, kind: "xl" },
  { label: "Date Acquired", className: assetStyles.colBase, kind: "base" },
  { label: "Location", className: assetStyles.colBase, kind: "base" },
  { label: "Total Cost", className: assetStyles.colCost, kind: "cost" },
  { label: "Unit Cost", className: assetStyles.colCost, kind: "cost" },
  { label: "Condition", className: assetStyles.colBase, kind: "base" },
  { label: "Status", className: assetStyles.colBase, kind: "status" },
  { label: "Brand", className: assetStyles.colBase, kind: "base" },
  { label: "Cyl.", className: assetStyles.colNarrow, kind: "narrow" },
  { label: "Engine Disp.", className: assetStyles.colBase, kind: "base" },
  { label: "Fuel Type", className: assetStyles.colBase, kind: "base" },
  { label: "Engine #", className: assetStyles.colBase, kind: "base" },
  { label: "Chassis #", className: assetStyles.colBase, kind: "base" },
  { label: "Color", className: assetStyles.colBase, kind: "base" },
  { label: "Plate No.", className: assetStyles.colBase, kind: "base" },
  { label: "Fund", className: assetStyles.colBase, kind: "base" },
  { label: "Remarks", className: assetStyles.colXl, kind: "xl" },
  { label: "DV Tracking #", className: assetStyles.colBase, kind: "base" },
  { label: "Supplier/Payee", className: assetStyles.colWide, kind: "wide" },
  { label: "Account Name (Charge)", className: assetStyles.colWide, kind: "wide" },
  { label: "Account Number", className: assetStyles.colBase, kind: "base" },
  { label: "OBR Number", className: assetStyles.colBase, kind: "base" },
  { label: "DV Number", className: assetStyles.colBase, kind: "base" },
  { label: "Date Received", className: assetStyles.colBase, kind: "base" },
  { label: "Created", className: assetStyles.colBase, kind: "base" },
];

const FILTERS = ["Type", "Status", "Asset type", "Condition", "Unit"] as const;

function CellPulse({ kind }: { kind: ColKind }) {
  if (kind === "details") {
    // Same as the real Details cell: view / issue / QR icon buttons.
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="h-8 w-8 animate-pulse rounded-md bg-navy-100" />
        <span className="h-8 w-8 animate-pulse rounded-md bg-navy-100" />
        <span className="h-8 w-8 animate-pulse rounded-md bg-navy-100" />
      </span>
    );
  }
  if (kind === "status") {
    return (
      <span className="h-[22px] w-16 animate-pulse rounded-full bg-navy-100" />
    );
  }
  if (kind === "cost") {
    return (
      <span className="ml-auto block h-3.5 w-16 animate-pulse rounded bg-navy-100" />
    );
  }
  if (kind === "narrow") {
    return (
      <span className="block h-3.5 w-10 animate-pulse rounded bg-navy-100" />
    );
  }
  if (kind === "wide") {
    return (
      <span className="block h-3.5 w-28 animate-pulse rounded bg-navy-100" />
    );
  }
  if (kind === "xl") {
    return (
      <span className="block h-3.5 w-40 animate-pulse rounded bg-navy-100" />
    );
  }
  return (
    <span className="block h-3.5 w-20 animate-pulse rounded bg-navy-100" />
  );
}

export default function AssetsLoading() {
  return (
    <section
      className={styles.section}
      aria-busy="true"
      aria-label="Loading assets"
    >
      <p className={styles.crumb}>Super Admin / Assets</p>

      {/* Header — same as the real page */}
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Assets</h1>
          <p className={styles.subtitle}>
            <span
              aria-hidden="true"
              className="inline-block h-4 w-40 animate-pulse rounded bg-navy-100 align-middle"
            />{" "}
            assets registered
          </p>
        </div>
        <div className={styles.actions} aria-hidden="true">
          <span className="inline-flex h-8 items-center justify-center rounded-[4px] bg-navy-900 px-3.5 text-xs font-semibold text-white">
            Issue / Assign
          </span>
          <span className="inline-flex h-8 items-center justify-center rounded-[4px] bg-navy-900 px-3.5 text-xs font-semibold text-white">
            Add asset
          </span>
          <span className="inline-flex h-8 items-center justify-center rounded-[4px] border border-navy-200 bg-white px-3.5 text-xs font-semibold text-navy-700">
            Import Excel
          </span>
          <span className="inline-flex h-8 items-center justify-center rounded-[4px] border border-navy-200 bg-white px-3.5 text-xs font-semibold text-navy-700">
            Add column
          </span>
        </div>
      </div>

      <Card className={styles.panel}>
        {/* Controls — same right-packed search + 4 filter selects */}
        <div className={assetStyles.controlsRight}>
          <div className={assetStyles.topRow} aria-hidden="true">
            <div className={assetStyles.searchWrap}>
              <div className="h-9 animate-pulse rounded-md bg-navy-100" />
            </div>
            {FILTERS.map((f) => (
              <div key={f} className={assetStyles.filterGroup}>
                <span className={assetStyles.filterLabel}>{f}</span>
                <div className="h-8 animate-pulse rounded-md bg-navy-100" />
              </div>
            ))}
          </div>
        </div>

        <div className={assetStyles.legend} aria-label="Row actions legend">
          <span className={assetStyles.legendItem}>
            <span className={assetStyles.legendIcon} aria-hidden="true" />
            View details
          </span>
          <span className={assetStyles.legendItem}>
            <span className={assetStyles.legendIcon} aria-hidden="true" />
            Issue asset
          </span>
          <span className={assetStyles.legendItem}>
            <span className={assetStyles.legendIcon} aria-hidden="true" />
            Show QR code
          </span>
        </div>

        {/* Table — same 35 columns with the same width classes, 10 rows */}
        <div className={`${styles.tableWrap} ${assetStyles.tableAuto}`}>
          <table className={styles.table} aria-hidden="true">
            <thead>
              <tr>
                {HEADERS.map((h) => (
                  <th key={h.label} className={h.className}>
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 10 }).map((_, r) => (
                <tr key={r} style={{ opacity: 1 - r * 0.05 }}>
                  {HEADERS.map((h) => (
                    <td key={h.label} className={h.className}>
                      <CellPulse kind={h.kind} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pager — same structure as the real pager */}
        <div className={styles.pager} aria-hidden="true">
          <span className={styles.pagerInfo}>
            <span className="block h-3 w-36 animate-pulse rounded bg-navy-100" />
          </span>
          <div className={styles.pagerControls}>
            <span className={styles.pageSizeWrap}>
              <span>Rows</span>
              <span className="h-8 w-[5.5rem] animate-pulse rounded-md bg-navy-100" />
            </span>
            <span className={styles.pageBtn} aria-hidden="true">
              ‹
            </span>
            <span className={styles.pageBtn} data-active="true">
              1
            </span>
            <span className={styles.pageBtn} aria-hidden="true">
              ›
            </span>
          </div>
        </div>
      </Card>
    </section>
  );
}
