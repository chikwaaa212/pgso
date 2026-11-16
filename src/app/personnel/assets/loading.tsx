import { Card } from "@/components/ui/card";
import styles from "../dashboard/page.module.css";
import assetStyles from "./page.module.css";
import stockStyles from "../stocks/page.module.css";

/**
 * Assets-specific skeleton — mirrors PersonnelAssetsPage 1:1 (header +
 * yellow action buttons, origin tabs, Stocks-style toolbar, the 9-column
 * lean table, footer) so content swaps in without layout shift.
 *
 * Static chrome renders as real text with real classes; only live values are
 * pulse placeholders sized to the real cells.
 */

type ColKind = "code" | "type" | "item" | "qty" | "availability" | "status" | "actions";

const HEADERS: { label: string; className: string; kind: ColKind }[] = [
  { label: "Account Code", className: assetStyles.cCode, kind: "code" },
  { label: "Type", className: assetStyles.cType, kind: "type" },
  { label: "Asset Title", className: assetStyles.cTitle, kind: "item" },
  { label: "Qty Available", className: assetStyles.cQty, kind: "qty" },
  { label: "Availability", className: assetStyles.cAvailability, kind: "availability" },
  { label: "Status", className: assetStyles.cStatus, kind: "status" },
  { label: "Actions", className: assetStyles.cActions, kind: "actions" },
];

const YELLOW_BTN =
  "inline-flex h-6 items-center justify-center rounded-[4px] border border-yellow-500 bg-yellow-500 px-3 text-xs font-semibold text-navy-900";

function CellPulse({ kind }: { kind: ColKind }) {
  if (kind === "actions") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="h-6 w-14 animate-pulse rounded-[4px] bg-navy-100" />
        <span className="h-6 w-16 animate-pulse rounded-[4px] bg-navy-100" />
        <span className="h-6 w-6 animate-pulse rounded-[4px] bg-navy-100" />
      </span>
    );
  }
  if (kind === "status" || kind === "availability") {
    return <span className="h-[22px] w-16 animate-pulse rounded-full bg-navy-100" />;
  }
  if (kind === "qty") {
    return <span className="block h-3.5 w-16 animate-pulse rounded bg-navy-100" />;
  }
  if (kind === "item") {
    return (
      <span className="flex flex-col gap-1.5">
        <span className="block h-3.5 w-28 animate-pulse rounded bg-navy-100" />
        <span className="block h-3 w-40 animate-pulse rounded bg-navy-100" />
      </span>
    );
  }
  if (kind === "code") {
    return <span className="block h-3.5 w-24 animate-pulse rounded bg-navy-100" />;
  }
  return <span className="block h-3.5 w-20 animate-pulse rounded bg-navy-100" />;
}

export default function AssetsLoading() {
  return (
    <section className={styles.section} aria-busy="true" aria-label="Loading assets">
      {/* Header — same as the real page */}
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Assets</h1>
          <p className={styles.subtitle} aria-hidden="true">
            <span className="mt-1 block h-4 w-56 animate-pulse rounded bg-navy-100" />
          </p>
        </div>
        <div className={styles.actions} aria-hidden="true">
          {["Issue / Assign", "Add asset", "Import Excel", "Add column"].map((label) => (
            <span key={label} className={YELLOW_BTN}>
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Origin tabs */}
      <div className={assetStyles.originTabsRow} aria-hidden="true">
        <span className="block h-6 w-56 animate-pulse rounded-[4px] bg-navy-100" />
      </div>

      <Card className={stockStyles.panel}>
        {/* Toolbar — info line on the left, search + filters on the right */}
        <div className={stockStyles.toolbar} aria-hidden="true">
          <p className={stockStyles.toolbarInfo}>
            <span className="block h-3 w-40 animate-pulse rounded bg-navy-100" />
          </p>
          <div className={stockStyles.filters}>
            <span className="block h-8 w-72 animate-pulse rounded-md bg-navy-100" />
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="block h-8 w-44 animate-pulse rounded-md bg-navy-100" />
            ))}
          </div>
        </div>

        {/* Table — same lean 9 columns with the same width classes */}
        <div className={`${assetStyles.tableFit} ${assetStyles.tableLean}`}>
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

        <div className={stockStyles.footer} aria-hidden="true">
          <span className="block h-3 w-36 animate-pulse rounded bg-navy-100" />
        </div>
      </Card>
    </section>
  );
}
