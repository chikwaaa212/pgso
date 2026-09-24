import { Card } from "@/components/ui/card";
import styles from "../dashboard/page.module.css";
import assetStyles from "./page.module.css";

/**
 * Assets-specific skeleton — mirrors PersonnelAssetsPage lean table 1:1
 * (crumb, header + actions, search + filters, icon legend, the 9-column
 * table, pager) so content swaps in without layout shift.
 *
 * Static chrome renders as real text with real classes; only live
 * values are pulse placeholders sized to the real cells.
 */

type ColKind = "details" | "code" | "prop" | "item" | "type" | "qty" | "loc" | "status";

const HEADERS: { label: string; className: string; kind: ColKind }[] = [
  { label: "Details", className: assetStyles.colLeanDetails, kind: "details" },
  { label: "Account Code", className: assetStyles.colLeanCode, kind: "code" },
  { label: "Account Title", className: assetStyles.colLeanType, kind: "type" },
  { label: "Account Name", className: assetStyles.colLeanType, kind: "type" },
  { label: "Property No.", className: assetStyles.colLeanProp, kind: "prop" },
  { label: "Item", className: assetStyles.colLeanItem, kind: "item" },
  { label: "Qty Available", className: assetStyles.colLeanQty, kind: "qty" },
  { label: "Location", className: assetStyles.colLeanLoc, kind: "loc" },
  { label: "Status", className: assetStyles.colLeanStatus, kind: "status" },
];

const FILTERS = ["Type", "Status", "Asset type", "Condition", "Unit"] as const;

function CellPulse({ kind }: { kind: ColKind }) {
  if (kind === "details") {
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
  if (kind === "qty") {
    return (
      <span className="block h-3.5 w-16 animate-pulse rounded bg-navy-100" />
    );
  }
  if (kind === "item") {
    return (
      <span className="flex flex-col gap-1.5">
        <span className="block h-3.5 w-28 animate-pulse rounded bg-navy-100" />
        <span className="block h-3 w-40 animate-pulse rounded bg-navy-100" />
      </span>
    );
  }
  if (kind === "prop" || kind === "code") {
    return (
      <span className="block h-3.5 w-24 animate-pulse rounded bg-navy-100" />
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
      <p className={styles.crumb}>Personnel / Assets</p>

      {/* Header — same as the real page */}
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Assets</h1>
          <p className={styles.subtitle} aria-hidden="true">
            <span className="mt-1 block h-4 w-48 animate-pulse rounded bg-navy-100" />
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
        {/* Controls — search + 4 filter selects, same layout as the real page */}
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

        {/* NOTE: no lucide imports here — loading.tsx is a Server Component
            and the installed lucide-react entry is client-only. The tiles
            below are same-size static placeholders so positions still match. */}
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

        {/* Table — same lean 9 columns with the same width classes, 10 rows */}
        <div className={`${styles.tableWrap} ${assetStyles.tableAuto} ${assetStyles.tableLean}`}>
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
