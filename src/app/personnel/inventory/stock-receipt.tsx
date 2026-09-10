import type { InventoryRow } from "./actions";
import styles from "../inspections/components/receipt.module.css";

function levelOf(item: InventoryRow) {
  if (item.reorder_threshold == null)
    return { label: "NO THRESHOLD", tone: "info" as const };
  if (item.quantity <= Math.floor(item.reorder_threshold / 2))
    return { label: "CRITICAL", tone: "bad" as const };
  if (item.quantity <= item.reorder_threshold)
    return { label: "LOW STOCK", tone: "warn" as const };
  return { label: "OK", tone: "ok" as const };
}

export function StockReceipt({ item }: { item: InventoryRow }) {
  const level = levelOf(item);

  return (
    <article className={styles.receipt}>
      <div className={styles.receiptInner}>
        {/* ── Masthead ─────────────────────────────────────────────── */}
        <header className={styles.masthead}>
          <p className={styles.orgName}>PGSO</p>
          <p className={styles.orgSub}>Property &amp; Supply Management</p>
          <p className={styles.docTitle}>*** STOCK RECEIPT ***</p>
          <p className={styles.docSub}>STOCK RECORD — {item.item_name.toUpperCase()}</p>
        </header>

        <div className={styles.divider} />

        {/* ── Stock record ─────────────────────────────────────────── */}
        <p className={styles.sectionTitle}>STOCK RECORD</p>
        <dl className={styles.rows}>
          {[
            ["Item Name", item.item_name],
            ["Account Code", item.account_code ?? "—"],
            ["Quantity on Hand", `${item.quantity} ${item.unit ?? "units"}`],
            ["Unit", item.unit ?? "—"],
            [
              "Reorder Threshold",
              item.reorder_threshold != null
                ? String(item.reorder_threshold)
                : "—",
            ],
            ["Location", item.location ?? "—"],
          ].map(([label, value]) => (
            <div key={label} className={styles.row}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
          <div className={styles.row}>
            <dt>Stock Level</dt>
            <dd>
              <span className={styles.resultBadge} data-tone={level.tone}>
                {level.label}
              </span>
            </dd>
          </div>
        </dl>

        <div className={styles.divider} />

        {/* ── Custodian ────────────────────────────────────────────── */}
        <p className={styles.sectionTitle}>CUSTODIAN</p>
        <div className={styles.signatureRow}>
          <div className={styles.signature}>
            <p className={styles.signatureName}> </p>
            <p className={styles.signatureLabel}>
              SUPPLY AND/OR PROPERTY CUSTODIAN
            </p>
          </div>
        </div>

        <div className={styles.divider} />

        {/* ── Footer ───────────────────────────────────────────────── */}
        <p className={styles.receiptKicker}>END OF STOCK RECORD</p>
        <div
          aria-hidden="true"
          className={styles.scanned}
          style={{
            background:
              "repeating-linear-gradient(90deg, #1b2a4a 0 2px, transparent 2px 5px, #1b2a4a 5px 6px, transparent 6px 10px)",
          }}
        />
        <p className={styles.scannedLabel}>
          {(item.account_code ?? "STOCK").toUpperCase()}
        </p>
        <p className={styles.thanks}>*** Thank you! ***</p>
      </div>
    </article>
  );
}
