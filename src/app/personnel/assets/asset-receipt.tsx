import type { UnifiedAssetRow } from "./actions";
import styles from "../inspections/components/receipt.module.css";

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

function statusTone(status: string | null) {
  if (status === "available") return "ok" as const;
  if (status === "retired") return "warn" as const;
  return "info" as const;
}

function pair(labelText: string, value: string) {
  return (
    <div key={labelText} className={styles.row}>
      <dt>{labelText}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function AssetReceipt({ asset: a }: { asset: UnifiedAssetRow }) {
  const ref = (a.qr_code ?? a.identifier ?? a.id).slice(0, 8).toUpperCase();

  const vehiclePairs: [string, string][] = [
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
    <article className={styles.receipt}>
      <div className={styles.receiptInner}>
        {/* ── Masthead ─────────────────────────────────────────────── */}
        <header className={styles.masthead}>
          <p className={styles.orgName}>PGSO</p>
          <p className={styles.orgSub}>Property &amp; Supply Management</p>
          <p className={styles.docTitle}>*** ASSET RECEIPT ***</p>
          <p className={styles.docSub}>ASSET RECORD — {ref}</p>
        </header>

        <div className={styles.divider} />

        {/* ── Identification ───────────────────────────────────────── */}
        <p className={styles.sectionTitle}>IDENTIFICATION</p>
        <dl className={styles.rows}>
          {pair("Property No.", a.qr_code ?? "—")}
          {pair("Account Code", a.account_code ?? "—")}
          {pair("Asset Type", label(a.category))}
          {pair("Account Title", label(a.account_title))}
          {pair("Account Name", label(a.account_name))}
          {pair("Article", label(a.article))}
          {pair("Identifier", a.identifier ?? "—")}
          <div className={styles.row}>
            <dt>Status</dt>
            <dd>
              <span className={styles.resultBadge} data-tone={statusTone(a.status)}>
                {(a.status ?? "—").toUpperCase()}
              </span>
            </dd>
          </div>
        </dl>

        <div className={styles.divider} />

        {/* ── Description & cost ───────────────────────────────────── */}
        <p className={styles.sectionTitle}>DESCRIPTION &amp; COST</p>
        <dl className={styles.rows}>
          {pair("Description", a.description ?? "—")}
          {pair(
            "Quantity",
            `${a.quantity ?? "—"}${a.unit ? ` ${label(a.unit)}` : ""}`
          )}
          {pair("Date Acquired", fmtDate(a.date_acquired))}
          {pair("Location", a.location ?? "—")}
          {pair("Condition", label(a.condition))}
          {pair("Unit Cost", fmtCurrency(a.unit_cost))}
          {pair("Total Cost", fmtCurrency(a.total_cost))}
          {pair("Fund", a.fund ?? "—")}
        </dl>

        {hasVehicleDetail ? (
          <>
            <div className={styles.divider} />
            <p className={styles.sectionTitle}>VEHICLE DETAILS</p>
            <dl className={styles.rows}>
              {vehiclePairs.map(([k, v]) => pair(k, v))}
            </dl>
          </>
        ) : null}

        <div className={styles.divider} />

        {/* ── Document reference ───────────────────────────────────── */}
        <p className={styles.sectionTitle}>DOCUMENT REFERENCE</p>
        <dl className={styles.rows}>
          {pair("Supplier/Payee", a.supplier_payee ?? "—")}
          {pair("DV Tracking No.", a.dv_tracking_number ?? "—")}
          {pair("DV No.", a.dv_number ?? "—")}
          {pair("OBR No.", a.obr_number ?? "—")}
          {pair("Account No.", a.account_number ?? "—")}
          {pair("Date Received", fmtDate(a.date_received))}
        </dl>

        <p className={styles.remarksLabel}>
          Remarks: <span className={styles.remarks}>{a.remarks || "—"}</span>
        </p>

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
        <p className={styles.receiptKicker}>END OF ASSET RECORD</p>
        <div
          aria-hidden="true"
          className={styles.scanned}
          style={{
            background:
              "repeating-linear-gradient(90deg, #1b2a4a 0 2px, transparent 2px 5px, #1b2a4a 5px 6px, transparent 6px 10px)",
          }}
        />
        <p className={styles.scannedLabel}>ASSET #{ref}</p>
        <p className={styles.thanks}>*** Thank you! ***</p>
      </div>
    </article>
  );
}
