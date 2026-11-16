import type { UnifiedAssetRow } from "./actions";
import styles from "../deliveries/delivery-receipt.module.css";

type Tone = "ok" | "warn" | "info" | "bad";

function label(value: string | null) {
  if (!value) return "—";
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  });
}

function fmtCurrency(value: number | null) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(value);
}

function statusMeta(status: string | null): { label: string; tone: Tone } {
  if (!status) return { label: "—", tone: "info" };
  if (status === "available") return { label: label(status), tone: "ok" };
  if (status === "retired") return { label: label(status), tone: "warn" };
  return { label: label(status), tone: "info" };
}

function Pill({ label: text, tone }: { label: string; tone: Tone }) {
  return (
    <span className={styles.pill} data-tone={tone}>
      {text}
    </span>
  );
}

function Field({ label: text, value }: { label: string; value: string }) {
  return (
    <div className={styles.field}>
      <dt className={styles.label}>{text}</dt>
      <dd className={styles.value}>{value}</dd>
    </div>
  );
}

export function AssetReceipt({ asset: a }: { asset: UnifiedAssetRow }) {
  const ref = (a.qr_code ?? a.identifier ?? a.id).slice(0, 8).toUpperCase();
  const status = statusMeta(a.status);

  const vehiclePairs: Array<[string, string]> = [
    ["Brand", a.brand ?? "—"],
    ["Color", label(a.color)],
    ["Plate No.", a.plate_number ?? "—"],
    ["Engine No.", a.engine_number ?? "—"],
    ["Chassis No.", a.chassis_number ?? "—"],
    ["Fuel Type", label(a.fuel_type)],
    ["Engine Displacement", a.engine_displacement ?? "—"],
  ];
  const hasVehicleDetail = vehiclePairs.some(([, v]) => v !== "—");

  return (
    <article className={`${styles.sheet} mx-auto w-full max-w-3xl`}>
      {/* Masthead — same structure as the inspection receipt */}
      <header className={styles.top}>
        <div className={styles.brand}>
          <p className={styles.brandName}>PGSO</p>
          <p className={styles.brandSub}>Property &amp; Supply Management</p>
        </div>
        <div className={styles.doc}>
          <p className={styles.docTitle}>Asset Receipt</p>
          <p className={styles.docNo}>{ref}</p>
          <p className={styles.docDate}>Asset record</p>
        </div>
      </header>

      {/* Identification */}
      <section className={styles.section}>
        <p className={styles.sectionTitle}>Identification</p>
        <dl className={styles.grid}>
          <Field label="Property No." value={a.qr_code ?? "—"} />
          <Field label="Account Code" value={a.account_code ?? "—"} />
          <Field label="Asset Type" value={label(a.category)} />
          <Field label="Account Title" value={label(a.account_title)} />
          <Field label="Account Name" value={label(a.account_name)} />
          <Field label="Article" value={label(a.article)} />
          <Field label="Identifier" value={a.identifier ?? "—"} />
          <div className={styles.field}>
            <dt className={styles.label}>Status</dt>
            <dd className={styles.value}>
              <Pill label={status.label} tone={status.tone} />
            </dd>
          </div>
        </dl>
      </section>

      {/* Description & cost */}
      <section className={styles.section}>
        <p className={styles.sectionTitle}>Description &amp; Cost</p>
        <dl className={styles.grid}>
          <Field label="Description" value={a.description ?? "—"} />
          <Field
            label="Quantity"
            value={`${a.quantity ?? "—"}${a.unit ? ` ${label(a.unit)}` : ""}`}
          />
          <Field label="Date Acquired" value={fmtDate(a.date_acquired)} />
          <Field label="Location" value={a.location ?? "—"} />
          <Field label="Condition" value={label(a.condition)} />
          <Field label="Unit Cost" value={fmtCurrency(a.unit_cost)} />
          <Field label="Total Cost" value={fmtCurrency(a.total_cost)} />
          <Field label="Fund" value={a.fund ?? "—"} />
        </dl>
      </section>

      {hasVehicleDetail ? (
        <section className={styles.section}>
          <p className={styles.sectionTitle}>Vehicle Details</p>
          <dl className={styles.grid}>
            {vehiclePairs.map(([k, v]) => (
              <Field key={k} label={k} value={v} />
            ))}
          </dl>
        </section>
      ) : null}

      {/* Document reference */}
      <section className={styles.section}>
        <p className={styles.sectionTitle}>Document Reference</p>
        <dl className={styles.grid}>
          <Field label="Supplier/Payee" value={a.supplier_payee ?? "—"} />
          <Field label="DV Tracking No." value={a.dv_tracking_number ?? "—"} />
          <Field label="DV No." value={a.dv_number ?? "—"} />
          <Field label="OBR No." value={a.obr_number ?? "—"} />
          <Field label="Account No." value={a.account_number ?? "—"} />
          <Field label="Date Received" value={fmtDate(a.date_received)} />
        </dl>
      </section>

      {/* Remarks & signature */}
      <section className={styles.section}>
        <p className={styles.sectionTitle}>Remarks &amp; Custodian</p>
        <dl className={styles.grid}>
          <Field label="Remarks" value={a.remarks || "—"} />
        </dl>
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
        <p className={styles.kicker}>End of asset record</p>
        <div className={styles.footerMeta}>
          <div aria-hidden="true" className={styles.barcode} />
          <p className={styles.footerRef}>
            Asset #{ref}
            {a.source === "stock" ? " • STOCK LINKED" : ""}
          </p>
        </div>
      </footer>
    </article>
  );
}
