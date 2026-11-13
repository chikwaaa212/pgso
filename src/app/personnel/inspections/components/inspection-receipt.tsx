import type { DeliveryForInspection } from "../actions";
import styles from "@/app/personnel/deliveries/delivery-receipt.module.css";

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
  stocked_at?: string | null
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

type Tone = "ok" | "warn" | "info" | "bad";

function resultMeta(result: string | null): { label: string; tone: Tone } {
  switch (result) {
    case "passed":
      return { label: "Passed", tone: "ok" };
    case "failed":
      return { label: "Returned to supplier", tone: "bad" };
    case "partial":
      return { label: "Partial", tone: "warn" };
    case "pending":
      return { label: "Pending inspection", tone: "info" };
    default:
      return { label: result ?? "—", tone: "info" };
  }
}

function itemTone(status: string): Tone {
  if (status === "ok") return "ok";
  if (status === "short") return "warn";
  return "bad";
}

function itemStatusLabel(status: string | undefined) {
  if (!status) return "—";
  if (status === "ok") return "OK";
  if (status === "short") return "Short";
  if (status === "missing") return "Missing";
  if (status === "damaged") return "Damaged";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function deliveryLabel(value: string | null | undefined) {
  return value === "awaiting" ? "Waiting for arrival" : "Delivered";
}

function Pill({ label, tone }: { label: string; tone: Tone }) {
  return (
    <span className={styles.pill} data-tone={tone}>
      {label}
    </span>
  );
}

export function InspectionReceipt({
  delivery,
  inspection,
}: {
  delivery: DeliveryForInspection;
  inspection?: ReceiptInspection | undefined;
}) {
  const ref = delivery.id.slice(0, 8).toUpperCase();
  const result = resultMeta(
    inspection ? inspection.result : delivery.inspection_status
  );

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
  const hasCosts =
    delivery.items.some((it) => it.unit_cost != null) || itemTotal > 0;

  const supplierChecks = (inspection?.supplier_checks ?? {}) as Record<
    string,
    string
  >;

  const kindRows: Array<[string, string]> =
    delivery.delivery_kind === "stock"
      ? [
          ["Stock Code", delivery.account_code ?? "—"],
          ["Stock Title", delivery.account_title ?? "—"],
          ["Stock Type", delivery.stock_type ?? "—"],
        ]
      : [
          [
            "Asset Type / Code",
            delivery.asset_type
              ? `${delivery.asset_type} — ${delivery.account_code ?? "—"}`
              : "—",
          ],
          ["Account Title", delivery.account_title ?? "—"],
        ];

  return (
    <article className={`${styles.sheet} mx-auto w-full max-w-3xl`}>
      {/* Masthead — same structure as the delivery receipt */}
      <header className={styles.top}>
        <div className={styles.brand}>
          <p className={styles.brandName}>PGSO</p>
          <p className={styles.brandSub}>Property &amp; Supply Management</p>
        </div>
        <div className={styles.doc}>
          <p className={styles.docTitle}>Inspection Receipt</p>
          <p className={styles.docNo}>{ref}</p>
          <p className={styles.docDate}>
            {inspection
              ? `Inspected ${fmt(inspection.inspection_date)}`
              : "Awaiting inspection"}
          </p>
        </div>
      </header>

      {/* Delivery record */}
      <section className={styles.section}>
        <p className={styles.sectionTitle}>Delivery Record</p>
        <dl className={styles.grid}>
          {[
            ["Date Delivered", fmt(delivery.date_delivered)],
            ["Supplier", delivery.supplier ?? "—"],
            ["PO Ref", delivery.po_reference ?? "—"],
            ["Delivery", deliveryLabel(delivery.delivery_status)],
            ["Received By", recipient],
            ...kindRows,
            ["Inspection Date", inspection ? fmt(inspection.inspection_date) : "—"],
            ["Inspector", inspection?.inspector_name ?? "—"],
          ].map(([label, value]) => (
            <div key={label} className={styles.field}>
              <dt className={styles.label}>{label}</dt>
              <dd className={styles.value}>{value}</dd>
            </div>
          ))}
          {inspection?.stocked_at ? (
            <div className={styles.field}>
              <dt className={styles.label}>Stocked to Inventory</dt>
              <dd className={styles.value}>{fmtDateTime(inspection.stocked_at)}</dd>
            </div>
          ) : null}
          <div className={styles.field}>
            <dt className={styles.label}>Inspection Result</dt>
            <dd className={styles.value}>
              <Pill label={result.label} tone={result.tone} />
            </dd>
          </div>
        </dl>
      </section>

      {/* Supplier & document verification */}
      <section className={styles.section}>
        <p className={styles.sectionTitle}>Supplier &amp; Document Verification</p>
        <dl className={styles.grid}>
          {SUPPLIER_CHECKS.map((check) => {
            const value = supplierChecks[check.key];
            return (
              <div key={check.key} className={styles.field}>
                <dt className={styles.label}>{check.label}</dt>
                <dd className={styles.value}>
                  <Pill
                    label={
                      value === "yes" ? "Yes" : value === "no" ? "No" : "—"
                    }
                    tone={value === "yes" ? "ok" : value === "no" ? "bad" : "info"}
                  />
                </dd>
              </div>
            );
          })}
        </dl>
      </section>

      {/* Item cross-verification */}
      <section className={styles.section}>
        <p className={styles.sectionTitle}>
          Items Cross-Verified ({delivery.items.length})
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.items}>
            <thead>
              <tr>
                <th className={styles.idx}>#</th>
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
                      <Pill
                        label={itemStatusLabel(check?.status)}
                        tone={check?.status ? itemTone(check.status) : "info"}
                      />
                    </td>
                    <td>{check?.remarks || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
            {hasCosts ? (
              <tfoot>
                <tr>
                  <td colSpan={5}>Estimated Total</td>
                  <td className={styles.num} colSpan={3}>
                    {peso(itemTotal)}
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </section>

      {/* Inspector & verdict */}
      <section className={styles.section}>
        <p className={styles.sectionTitle}>Inspector &amp; Verdict</p>
        <dl className={styles.grid}>
          <div className={styles.field}>
            <dt className={styles.label}>Verdict</dt>
            <dd className={styles.value}>
              <Pill label={result.label} tone={result.tone} />
            </dd>
          </div>
          <div className={styles.field}>
            <dt className={styles.label}>Inspector</dt>
            <dd className={styles.value}>{inspection?.inspector_name ?? "—"}</dd>
          </div>
          <div className={styles.field}>
            <dt className={styles.label}>Date Inspected</dt>
            <dd className={styles.value}>
              {inspection ? fmt(inspection.inspection_date) : "—"}
            </dd>
          </div>
          <div className={styles.field}>
            <dt className={styles.label}>Overall Remarks</dt>
            <dd className={styles.value}>{inspection?.remarks || "—"}</dd>
          </div>
        </dl>

        {/* Signature line */}
        <div className="mt-4 grid gap-1 sm:grid-cols-2">
          <div>
            <p className="m-0 border-b border-navy-900 pb-1 text-sm font-semibold text-navy-900">
              {inspection?.inspector_name || " "}
            </p>
            <p className="mt-1 text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-navy-500">
              Inspector — {inspection ? fmt(inspection.inspection_date) : "—"}
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <p className={styles.kicker}>End of inspection record</p>
        <div className={styles.footerMeta}>
          <div aria-hidden="true" className={styles.barcode} />
          <p className={styles.footerRef}>
            Delivery #{ref}
            {inspection?.id || inspection?.created_at
              ? ` • REC #${(inspection.id?.slice(0, 6) ?? "—").toUpperCase()}`
              : ""}
          </p>
        </div>
      </footer>
    </article>
  );
}
