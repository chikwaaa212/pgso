import type { DeliveryForInspection } from "../actions";
import styles from "./receipt.module.css";

export interface ReceiptInspection {
  id?: string
  inspector_name: string | null
  inspection_date: string
  result: string
  remarks: string | null
  supplier_checks: Record<string, string> | null
  item_checks: Array<{
    itemId: string
    status: string
    actualQty: number
    remarks: string
  }> | null
  created_at?: string | null
}

function peso(n: number | null) {
  if (n == null) return "—";
  return `₱${n.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmt(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  });
}

function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  });
}

const SUPPLIER_CHECKS: { key: string; label: string }[] = [
  { key: "documentsPresent", label: "DR & PO copy physically present" },
  { key: "supplierMatches", label: "Supplier name matches PO record" },
  { key: "poNumberMatches", label: "PO number matches system record" },
  { key: "signaturesPresent", label: "Supplier & receiving signatures present" },
  { key: "packagingIntact", label: "Packaging intact and undamaged" },
  { key: "sealedOrSecured", label: "Items properly sealed or secured" },
];

function resultMeta(result: string | null) {
  switch (result) {
    case "passed":
      return { label: "PASSED", tone: "ok" as const };
    case "failed":
      return { label: "FAILED", tone: "bad" as const };
    case "partial":
      return { label: "PARTIAL", tone: "warn" as const };
    case "pending":
      return { label: "PENDING INSPECTION", tone: "info" as const };
    default:
      return { label: result ?? "—", tone: "info" as const };
  }
}

function itemTone(status: string) {
  if (status === "ok") return "ok";
  if (status === "short") return "warn";
  return "bad";
}

function itemStatusLabel(status: string | undefined) {
  if (!status) return "—";
  return status.toUpperCase();
}

export function InspectionReceipt({
  delivery,
  inspection,
}: {
  delivery: DeliveryForInspection;
  inspection?: ReceiptInspection | undefined;
}) {
  const ref = delivery.id.slice(0, 8).toUpperCase();
  const result = resultMeta(inspection ? inspection.result : delivery.inspection_status);

  const recipient = delivery.recipient_name
    ? delivery.recipient_role
      ? `${delivery.recipient_name} (${delivery.recipient_role})`
      : delivery.recipient_name
    : delivery.recipient_role ?? "—";

  const itemChecks = inspection?.item_checks ?? [];
  const checkFor = (itemId: string) => itemChecks.find((c) => c.itemId === itemId);

  const itemTotal = delivery.items.reduce((sum, item) => {
    const qty = checkFor(item.id)?.actualQty ?? item.quantity;
    return sum + qty * (item.unit_cost ?? 0);
  }, 0);

  const supplierChecks = (inspection?.supplier_checks ?? {}) as Record<string, string>;

  return (
    <article className={styles.receipt}>
      <div className={styles.receiptInner}>
        {/* ── Masthead ─────────────────────────────────────────────── */}
        <header className={styles.masthead}>
          <p className={styles.orgName}>PGSO</p>
          <p className={styles.orgSub}>Property &amp; Supply Management</p>
          <p className={styles.docTitle}>*** INSPECTION RECEIPT ***</p>
          <p className={styles.docSub}>
            INSPECTION RECORD — DELIVERY {ref}
          </p>
        </header>

        <div className={styles.divider} />

        {/* ── Delivery record ─────────────────────────────────────── */}
        <p className={styles.sectionTitle}>DELIVERY RECORD</p>
        <dl className={styles.rows}>
          {[
            ["Date Delivered", fmt(delivery.date_delivered)],
            ["Supplier", delivery.supplier ?? "—"],
            ["P.O. Reference", delivery.po_reference ?? "—"],
            [
              "Delivery Status",
              delivery.delivery_status === "complete"
                ? "COMPLETE"
                : delivery.delivery_status === "partial"
                  ? "PARTIAL"
                  : (delivery.delivery_status ?? "—").toUpperCase(),
            ],
            ["Received By", recipient],
            [
              "Asset Type / Code",
              delivery.asset_type
                ? `${delivery.asset_type} — ${delivery.asset_code ?? "—"}`
                : "—",
            ],
            ["Account Type", delivery.account_type ?? "—"],
            ["Inspection Date", inspection ? fmt(inspection.inspection_date) : "—"],
            ["Inspector", inspection?.inspector_name ?? "—"],
          ].map(([label, value]) => (
            <div key={label} className={styles.row}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
          <div className={styles.row}>
            <dt>Inspection Result</dt>
            <dd>
              <span className={styles.resultBadge} data-tone={result.tone}>
                {result.label}
              </span>
            </dd>
          </div>
        </dl>

        <div className={styles.divider} />

        {/* ── Supplier & document verification ────────────────────── */}
        <p className={styles.sectionTitle}>
          SUPPLIER &amp; DOCUMENT VERIFICATION
        </p>
        <div className={styles.checkList}>
          {SUPPLIER_CHECKS.map((check) => {
            const value = supplierChecks[check.key];
            return (
              <div key={check.key} className={styles.checkItem}>
                <span>{check.label}</span>
                <span className={styles.checkAnswer} data-v={value}>
                  {value === "yes" ? "YES" : value === "no" ? "NO" : "—"}
                </span>
              </div>
            );
          })}
        </div>

        <div className={styles.divider} />

        {/* ── Item cross-verification ─────────────────────────────── */}
        <p className={styles.sectionTitle}>
          ITEMS CROSS-VERIFIED ({delivery.items.length})
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>#</th>
                <th>Item Description</th>
                <th>Unit</th>
                <th className={styles.num}>Qty (PO)</th>
                <th className={styles.num}>Unit Cost</th>
                <th className={styles.num}>Qty Recvd</th>
                <th>Status</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {delivery.items.map((item, i) => {
                const check = checkFor(item.id);
                const qty = check?.actualQty ?? item.quantity;
                return (
                  <tr key={item.id}>
                    <td className={styles.idx}>{i + 1}</td>
                    <td className={styles.itemName}>{item.item_name}</td>
                    <td>{item.unit ?? "—"}</td>
                    <td className={styles.num}>{item.quantity}</td>
                    <td className={styles.num}>{peso(item.unit_cost)}</td>
                    <td className={styles.num}>{qty}</td>
                    <td>
                      <span
                        className={styles.itemStatus}
                        data-tone={check?.status ? itemTone(check.status) : "info"}
                      >
                        {itemStatusLabel(check?.status)}
                      </span>
                    </td>
                    <td>{check?.remarks || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
            {(delivery.items.some((it) => it.unit_cost != null) || itemTotal > 0) && (
              <tfoot>
                <tr>
                  <td colSpan={5}>ESTIMATED TOTAL</td>
                  <td className={styles.num} colSpan={3}>
                    {peso(itemTotal)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div className={styles.divider} />

        {/* ── Verdict & inspector ─────────────────────────────────── */}
        <p className={styles.sectionTitle}>INSPECTOR &amp; VERDICT</p>
        <dl className={styles.rows}>
          <div className={styles.row}>
            <dt>Verdict</dt>
            <dd>
              <span className={styles.resultBadge} data-tone={result.tone}>
                {result.label}
              </span>
            </dd>
          </div>
          <div className={styles.row}>
            <dt>Inspector</dt>
            <dd>{inspection?.inspector_name ?? "—"}</dd>
          </div>
          <div className={styles.row}>
            <dt>Date Inspected</dt>
            <dd>{inspection ? fmt(inspection.inspection_date) : "—"}</dd>
          </div>
        </dl>

        <p className={styles.remarksLabel}>
          Overall Remarks:{" "}
          <span className={styles.remarks}>{inspection?.remarks || "—"}</span>
        </p>

        {/* Signature line */}
        <div className={styles.signatureRow}>
          <div className={styles.signature}>
            <p className={styles.signatureName}>
              {inspection?.inspector_name ?? " "}
            </p>
            <p className={styles.signatureLabel}>
              INSPECTOR — {inspection ? fmt(inspection.inspection_date) : "—"}
            </p>
          </div>
        </div>

        <div className={styles.divider} />

        {/* ── Footer ──────────────────────────────────────────────── */}
        <p className={styles.receiptKicker}>END OF INSPECTION RECORD</p>
        <div
          aria-hidden="true"
          className={styles.scanned}
          style={{
            background:
              "repeating-linear-gradient(90deg, #1b2a4a 0 2px, transparent 2px 5px, #1b2a4a 5px 6px, transparent 6px 10px)",
          }}
        />
        <p className={styles.scannedLabel}>DELIVERY #{ref}</p>
        {inspection?.id || inspection?.created_at ? (
          <p className={styles.recorded}>
            REC #{(inspection.id?.slice(0, 6) ?? "—").toUpperCase()}
            {inspection.created_at ? ` • ${fmtDateTime(inspection.created_at)}` : ""}
          </p>
        ) : null}
        <p className={styles.thanks}>*** Thank you! ***</p>
      </div>
    </article>
  );
}