import { PAGE_SIZE } from "@/lib/constants";
import tableStyles from "@/app/personnel/documents/page.module.css";
import footerStyles from "@/app/personnel/stocks/page.module.css";
import pagerStyles from "@/components/ui/pagination.module.css";

/** Tabs of the /personnel/documents library. */
export type DocumentsTabKey =
  | "delivery"
  | "inspection"
  | "stocks"
  | "assets"
  | "repairs"
  | "iar"
  | "par"
  | "ics";

type ColumnKind =
  | "mono"
  | "text"
  | "strong"
  | "wide"
  | "num"
  | "badge"
  | "action"
  | "link";

interface Column {
  header: string;
  kind: ColumnKind;
}

/**
 * Column definitions for every documents tab. The skeleton renders exactly
 * these headers/alignments, so the loading table is a 1:1 stand-in for the
 * real data table (same column count, labels, and right-aligned action cells).
 */
export const DOCUMENT_COLUMNS: Record<DocumentsTabKey, Column[]> = {
  delivery: [
    { header: "Reference no.", kind: "mono" },
    { header: "Supplier", kind: "text" },
    { header: "Purchase order", kind: "mono" },
    { header: "Date inspected", kind: "text" },
    { header: "Items", kind: "num" },
    { header: "Delivery status", kind: "badge" },
    { header: "Inspection status", kind: "badge" },
    { header: "Document", kind: "action" },
  ],
  inspection: [
    { header: "Delivery ref.", kind: "mono" },
    { header: "Supplier", kind: "text" },
    { header: "Purchase order", kind: "mono" },
    { header: "Inspector", kind: "text" },
    { header: "Date inspected", kind: "text" },
    { header: "Result", kind: "badge" },
    { header: "Document", kind: "action" },
  ],
  stocks: [
    { header: "Item", kind: "strong" },
    { header: "Account code", kind: "mono" },
    { header: "Quantity", kind: "num" },
    { header: "Unit", kind: "text" },
    { header: "Location", kind: "wide" },
    { header: "Document", kind: "action" },
  ],
  assets: [
    { header: "Property no.", kind: "mono" },
    { header: "Account code", kind: "mono" },
    { header: "Article", kind: "text" },
    { header: "Description", kind: "wide" },
    { header: "Qty.", kind: "num" },
    { header: "Location", kind: "text" },
    { header: "Status", kind: "badge" },
    { header: "Document", kind: "action" },
    { header: "More", kind: "link" },
  ],
  repairs: [
    { header: "Ticket", kind: "mono" },
    { header: "Asset", kind: "text" },
    { header: "Reported by", kind: "text" },
    { header: "Technician", kind: "text" },
    { header: "Repair date", kind: "text" },
    { header: "Cost", kind: "num" },
    { header: "Status", kind: "badge" },
    { header: "Document", kind: "action" },
  ],
  iar: [
    { header: "IAR no.", kind: "mono" },
    { header: "Type", kind: "badge" },
    { header: "Delivery ref.", kind: "mono" },
    { header: "Supplier", kind: "text" },
    { header: "Inspector", kind: "text" },
    { header: "Result", kind: "badge" },
    { header: "Date inspected", kind: "text" },
    { header: "Generated", kind: "text" },
    { header: "Report", kind: "action" },
  ],
  par: [
    { header: "Document no.", kind: "mono" },
    { header: "Employee", kind: "text" },
    { header: "Item", kind: "text" },
    { header: "Qty", kind: "num" },
    { header: "Total", kind: "num" },
    { header: "Date", kind: "text" },
    { header: "Generated", kind: "text" },
    { header: "Report", kind: "action" },
    { header: "More", kind: "link" },
  ],
  ics: [
    { header: "Document no.", kind: "mono" },
    { header: "Employee", kind: "text" },
    { header: "Item", kind: "text" },
    { header: "Qty", kind: "num" },
    { header: "Total", kind: "num" },
    { header: "Date", kind: "text" },
    { header: "Generated", kind: "text" },
    { header: "Report", kind: "action" },
    { header: "More", kind: "link" },
  ],
};

function isRightAligned(kind: ColumnKind) {
  return kind === "num" || kind === "action" || kind === "link";
}

function CellPlaceholder({ kind }: { kind: ColumnKind }) {
  switch (kind) {
    case "mono":
      return (
        <div className="h-3.5 w-16 max-w-full animate-pulse rounded bg-navy-100" />
      );
    case "strong":
      return (
        <div className="h-3.5 w-32 max-w-full animate-pulse rounded bg-navy-100" />
      );
    case "wide":
      return (
        <div className="h-3.5 w-44 max-w-full animate-pulse rounded bg-navy-100" />
      );
    case "num":
      return (
        <div className="ml-auto h-3.5 w-8 animate-pulse rounded bg-navy-100" />
      );
    case "badge":
      return (
        <div className="h-[22px] w-16 animate-pulse rounded-full bg-navy-100" />
      );
    case "action":
      return (
        <div className="ml-auto h-6 w-24 animate-pulse rounded-[4px] bg-navy-100" />
      );
    case "link":
      return (
        <div className="ml-auto h-3.5 w-14 animate-pulse rounded bg-navy-100" />
      );
    default:
      return (
        <div className="h-3.5 w-24 max-w-full animate-pulse rounded bg-navy-100" />
      );
  }
}

/**
 * Documents loading table — exact column set for the active tab plus the
 * fixed 10-row window and the real footer pager shape.
 */
export function DocumentsTableSkeleton({
  tab,
  label,
  rows = PAGE_SIZE,
}: {
  tab: DocumentsTabKey;
  label?: string;
  rows?: number;
}) {
  const columns = DOCUMENT_COLUMNS[tab];

  return (
    <>
      <div
        className={tableStyles.tableWrap}
        role="status"
        aria-busy="true"
        aria-label={label ?? "Loading documents"}
      >
        <table className={tableStyles.table} aria-hidden="true">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.header}
                  style={
                    isRightAligned(col.kind)
                      ? { textAlign: "right" }
                      : undefined
                  }
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, r) => (
              <tr key={r}>
                {columns.map((col) => (
                  <td
                    key={col.header}
                    style={
                      isRightAligned(col.kind)
                        ? { textAlign: "right" }
                        : undefined
                    }
                  >
                    <CellPlaceholder kind={col.kind} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={footerStyles.footer} aria-hidden="true">
        <nav className={pagerStyles.pager}>
          <span className={pagerStyles.pagerInfo}>
            <span className="block h-3 w-40 animate-pulse rounded bg-navy-100" />
            <span className="block h-3 w-24 animate-pulse rounded bg-navy-100" />
          </span>
          <div className={pagerStyles.pagerControls}>
            <span
              className={pagerStyles.pageBtn}
              style={{
                backgroundColor: "var(--color-navy-100)",
                borderColor: "var(--color-navy-100)",
              }}
            />
            <span
              className={pagerStyles.pageBtn}
              style={{
                backgroundColor: "var(--color-navy-100)",
                borderColor: "var(--color-navy-100)",
              }}
            />
            <span
              className={pagerStyles.pageBtn}
              style={{
                backgroundColor: "var(--color-navy-100)",
                borderColor: "var(--color-navy-100)",
              }}
            />
          </div>
        </nav>
      </div>
    </>
  );
}
