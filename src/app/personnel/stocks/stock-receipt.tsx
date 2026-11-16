import type { InventoryRow } from "./actions";
import styles from "../deliveries/delivery-receipt.module.css";

type Tone = "ok" | "warn" | "info" | "bad";

function levelOf(item: InventoryRow): { label: string; tone: Tone } {
  if (item.reorder_threshold == null)
    return { label: "No threshold", tone: "info" };
  if (item.quantity <= Math.floor(item.reorder_threshold / 2))
    return { label: "Critical", tone: "bad" };
  if (item.quantity <= item.reorder_threshold)
    return { label: "Low stock", tone: "warn" };
  return { label: "OK", tone: "ok" };
}

function Pill({ label, tone }: { label: string; tone: Tone }) {
  return (
    <span className={styles.pill} data-tone={tone}>
      {label}
    </span>
  );
}

export function StockReceipt({ item }: { item: InventoryRow }) {
  const level = levelOf(item);
  const ref = (item.account_code ?? item.id).slice(0, 8).toUpperCase();

  const rows: Array<[string, string]> = [
    ["Item Name", item.item_name],
    ["Account Code", item.account_code ?? "—"],
    ["Quantity on Hand", `${item.quantity} ${item.unit ?? "units"}`],
    ["Unit", item.unit ?? "—"],
    [
      "Reorder Threshold",
      item.reorder_threshold != null ? String(item.reorder_threshold) : "—",
    ],
    ["Location", item.location ?? "—"],
  ];

  return (
    <article className={`${styles.sheet} mx-auto w-full max-w-3xl`}>
      {/* Masthead — same structure as the inspection receipt */}
      <header className={styles.top}>
        <div className={styles.brand}>
          <p className={styles.brandName}>PGSO</p>
          <p className={styles.brandSub}>Property &amp; Supply Management</p>
        </div>
        <div className={styles.doc}>
          <p className={styles.docTitle}>Stock Receipt</p>
          <p className={styles.docNo}>{ref}</p>
          <p className={styles.docDate}>Stock record</p>
        </div>
      </header>

      {/* Stock record */}
      <section className={styles.section}>
        <p className={styles.sectionTitle}>Stock Record</p>
        <dl className={styles.grid}>
          {rows.map(([label, value]) => (
            <div key={label} className={styles.field}>
              <dt className={styles.label}>{label}</dt>
              <dd className={styles.value}>{value}</dd>
            </div>
          ))}
          <div className={styles.field}>
            <dt className={styles.label}>Stock Level</dt>
            <dd className={styles.value}>
              <Pill label={level.label} tone={level.tone} />
            </dd>
          </div>
        </dl>
      </section>

      {/* Custodian */}
      <section className={styles.section}>
        <p className={styles.sectionTitle}>Custodian</p>
        <div className="mt-4 grid gap-1 sm:grid-cols-2">
          <div>
            <p className="m-0 border-b border-navy-900 pb-1 text-sm font-semibold text-navy-900">
              {" "}
            </p>
            <p className="mt-1 text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-navy-500">
              Supply and/or Property Custodian
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <p className={styles.kicker}>End of stock record</p>
        <div className={styles.footerMeta}>
          <div aria-hidden="true" className={styles.barcode} />
          <p className={styles.footerRef}>
            Stock #{ref}
            {item.account_code ? ` • ${item.account_code}` : ""}
          </p>
        </div>
      </footer>
    </article>
  );
}
