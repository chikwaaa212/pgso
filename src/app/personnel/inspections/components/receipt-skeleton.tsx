import styles from "./receipt.module.css";

/**
 * Loading skeletons for the inspection receipt pages (receipt, receipts).
 * Same shell and positions as the real receipts so content swaps in
 * without layout shift. Static chrome (masthead, labels, table headers)
 * renders as real text; only live values pulse.
 *
 * NOTE: the IAR sheet skeleton lives next to the IAR page
 * (./iar-sheet-skeleton) because bundlers cannot resolve `[id]`
 * segments in import paths.
 */

function Pulse({ className }: { className: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded bg-navy-100 ${className}`}
    />
  );
}

export function ReceiptToolbarSkeleton({
  buttons = [96, 110, 130, 120],
}: {
  /** Widths (px) of the toolbar button placeholders. */
  buttons?: number[];
}) {
  return (
    <div className={styles.toolbar} aria-hidden="true">
      {buttons.map((w, i) => (
        <span
          key={i}
          className="h-8 animate-pulse rounded-[4px] bg-navy-100"
          style={{ width: w }}
        />
      ))}
    </div>
  );
}

const DELIVERY_ROWS = [
  "Date Delivered",
  "Supplier",
  "P.O. Reference",
  "Delivery Status",
  "Received By",
  "Asset Type / Code",
  "Account Title",
  "Inspection Date",
  "Inspector",
] as const;

/** Exact labels from the real InspectionReceipt. */
const SUPPLIER_CHECKS = [
  "DR & PO copy physically present",
  "Supplier name matches PO record",
  "PO number matches system record",
  "Supplier & receiving signatures present",
  "Packaging intact and undamaged",
  "Items properly sealed or secured",
] as const;

const ITEM_HEADERS = [
  "#",
  "Item Description",
  "Unit",
  "Qty (PO)",
  "Unit Cost",
  "Qty Recvd",
  "Status",
  "Remarks",
] as const;

export function ReceiptPaperSkeleton({
  title = "*** INSPECTION RECEIPT ***",
  itemRows = 5,
}: {
  title?: string;
  itemRows?: number;
}) {
  return (
    <article className={styles.receipt} aria-hidden="true">
      <div className={styles.receiptInner}>
        {/* ── Masthead ── */}
        <header className={styles.masthead}>
          <p className={styles.orgName}>PGSO</p>
          <p className={styles.orgSub}>Property &amp; Supply Management</p>
          <p className={styles.docTitle}>{title}</p>
          <Pulse className="mx-auto mt-1 h-3 w-56" />
        </header>

        <div className={styles.divider} />

        {/* ── Delivery record: 9 rows + result badge ── */}
        <p className={styles.sectionTitle}>DELIVERY RECORD</p>
        <dl className={styles.rows}>
          {DELIVERY_ROWS.map((label, i) => (
            <div key={label} className={styles.row}>
              <dt>{label}</dt>
              <dd>
                <Pulse
                  className={
                    label === "Delivery Status"
                      ? "ml-auto h-[22px] w-20 rounded-full"
                      : `h-3.5 ${i % 3 === 0 ? "w-32" : i % 3 === 1 ? "w-44" : "w-24"}`
                  }
                />
              </dd>
            </div>
          ))}
          <div className={styles.row}>
            <dt>Inspection Result</dt>
            <dd>
              <Pulse className="ml-auto h-[22px] w-20 rounded-full" />
            </dd>
          </div>
        </dl>

        <div className={styles.divider} />

        {/* ── Supplier & document verification: 6 checks ── */}
        <p className={styles.sectionTitle}>
          SUPPLIER &amp; DOCUMENT VERIFICATION
        </p>
        <div className={styles.checkList}>
          {SUPPLIER_CHECKS.map((label) => (
            <div key={label} className={styles.checkItem}>
              <span>{label}</span>
              <Pulse className="h-3.5 w-10" />
            </div>
          ))}
        </div>

        <div className={styles.divider} />

        {/* ── Items table + estimated total ── */}
        <p className={styles.sectionTitle}>ITEMS CROSS-VERIFIED</p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                {ITEM_HEADERS.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: itemRows }).map((_, r) => (
                <tr key={r} style={{ opacity: 1 - r * 0.08 }}>
                  <td>
                    <Pulse className="h-3.5 w-4" />
                  </td>
                  <td>
                    <Pulse className="h-3.5 w-32" />
                  </td>
                  <td>
                    <Pulse className="h-3.5 w-10" />
                  </td>
                  <td>
                    <Pulse className="h-3.5 w-8" />
                  </td>
                  <td>
                    <Pulse className="h-3.5 w-14" />
                  </td>
                  <td>
                    <Pulse className="h-3.5 w-8" />
                  </td>
                  <td>
                    <Pulse className="h-[22px] w-14 rounded-full" />
                  </td>
                  <td>
                    <Pulse className="h-3.5 w-16" />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5}>ESTIMATED TOTAL</td>
                <td colSpan={3}>
                  <Pulse className="h-3.5 w-20" />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className={styles.divider} />

        {/* ── Inspector & verdict ── */}
        <p className={styles.sectionTitle}>INSPECTOR &amp; VERDICT</p>
        <dl className={styles.rows}>
          <div className={styles.row}>
            <dt>Verdict</dt>
            <dd>
              <Pulse className="ml-auto h-[22px] w-20 rounded-full" />
            </dd>
          </div>
          <div className={styles.row}>
            <dt>Inspector</dt>
            <dd>
              <Pulse className="h-3.5 w-36" />
            </dd>
          </div>
          <div className={styles.row}>
            <dt>Date Inspected</dt>
            <dd>
              <Pulse className="h-3.5 w-28" />
            </dd>
          </div>
        </dl>
        <p className={styles.remarksLabel}>
          Overall Remarks:{" "}
          <span
            aria-hidden="true"
            className="mt-1 block h-3.5 w-full animate-pulse rounded bg-navy-100"
          />
        </p>
        <div className={styles.signatureRow}>
          <div className={styles.signature}>
            <Pulse className="mx-auto h-4 w-40" />
            <p className={styles.signatureLabel}>INSPECTOR</p>
          </div>
        </div>

        <div className={styles.divider} />

        {/* ── Footer ── */}
        <p className={styles.receiptKicker}>END OF INSPECTION RECORD</p>
        <div className={`${styles.scanned} animate-pulse bg-navy-100`} />
        <Pulse className="mx-auto mt-2 h-3 w-40" />
        <Pulse className="mx-auto mt-1 h-3 w-48" />
        <p className={styles.thanks}>*** Thank you! ***</p>
      </div>
    </article>
  );
}
