"use client";

import Link from "next/link";
import { Printer, ChevronLeft } from "lucide-react";
import type { DeliveryDetails } from "../actions";
import { cn } from "@/lib/utils";
import receiptStyles from "@/app/personnel/inspections/components/receipt.module.css";

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

function StatusPill({ value }: { value: string | null }) {
  const tone =
    value === "passed"
      ? "ok"
      : value === "failed"
      ? "bad"
      : value === "partial"
      ? "warn"
      : "info";
  const label = value
    ? value.charAt(0).toUpperCase() + value.slice(1)
    : "Pending";
  return (
    <span className={receiptStyles.resultBadge} data-tone={tone}>
      {label}
    </span>
  );
}

export function DeliveryReceiptToolbar() {
  return (
    <div className={receiptStyles.toolbar}>
      <Link
        href="/personnel/deliveries"
        className={cn(receiptStyles.toolbarBtn, receiptStyles.toolbarGhost)}
      >
        <ChevronLeft className="h-4 w-4" />
        Back to deliveries
      </Link>
      <button
        type="button"
        className={cn(receiptStyles.toolbarBtn, receiptStyles.toolbarPrint)}
        onClick={() => window.print()}
      >
        <Printer className="h-4 w-4" />
        Print / Save PDF
      </button>
    </div>
  );
}

export function DeliveryReceipt({ delivery }: { delivery: DeliveryDetails }) {
  const ref = delivery.delivery_ref;
  const totalValue = delivery.items.reduce(
    (sum, item) => sum + (Number(item.unit_cost) || 0) * item.quantity,
    0
  );

  const recipient = delivery.recipient_name
    ? delivery.recipient_role
      ? `${delivery.recipient_name} (${delivery.recipient_role})`
      : delivery.recipient_name
    : delivery.recipient_role ?? "—";

  return (
    <article className={receiptStyles.receipt}>
      <div className={receiptStyles.receiptInner}>
        {/* ── Masthead ── */}
        <header className={receiptStyles.masthead}>
          <p className={receiptStyles.orgName}>PGSO</p>
          <p className={receiptStyles.orgSub}>
            Property &amp; Supply Management
          </p>
          <p className={receiptStyles.docTitle}>*** DELIVERY RECEIPT ***</p>
          <p className={receiptStyles.docSub}>
            DELIVERY RECORD — DELIVERY {ref}
          </p>
        </header>

        <div className={receiptStyles.divider} />

        {/* ── Delivery record ── */}
        <p className={receiptStyles.sectionTitle}>DELIVERY RECORD</p>
        <dl className={receiptStyles.rows}>
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
              "Account Code",
              delivery.account_code ?? "—",
            ],
            [
              "Asset Type / Account Type",
              `${delivery.asset_type ?? "—"} / ${delivery.account_type ?? "—"}`,
            ],
          ].map(([label, value]) => (
            <div key={label} className={receiptStyles.row}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
          <div className={receiptStyles.row}>
            <dt>Inspection Status</dt>
            <dd>
              <StatusPill value={delivery.inspection_status} />
            </dd>
          </div>
        </dl>

        <div className={receiptStyles.divider} />

        {/* ── Items ── */}
        <p className={receiptStyles.sectionTitle}>
          ITEMS DELIVERED ({delivery.items.length})
        </p>
        <div className={receiptStyles.tableWrap}>
          <table className={receiptStyles.table}>
            <thead>
              <tr>
                <th>#</th>
                <th>Description</th>
                <th>Unit</th>
                <th className={receiptStyles.num}>Qty</th>
                <th className={receiptStyles.num}>Unit Cost</th>
                <th className={receiptStyles.num}>Line Total</th>
              </tr>
            </thead>
            <tbody>
              {delivery.items.map((item, i) => (
                <tr key={item.id}>
                  <td className={receiptStyles.idx}>{i + 1}</td>
                  <td className={receiptStyles.itemName}>
                    {item.item_name}
                  </td>
                  <td>{item.unit ?? "—"}</td>
                  <td className={receiptStyles.num}>{item.quantity}</td>
                  <td className={receiptStyles.num}>
                    {peso(item.unit_cost)}
                  </td>
                  <td className={receiptStyles.num}>
                    {peso(
                      (Number(item.unit_cost) || 0) * item.quantity
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            {delivery.items.some((it) => it.unit_cost != null) ? (
              <tfoot>
                <tr>
                  <td colSpan={4}>ESTIMATED TOTAL</td>
                  <td className={receiptStyles.num} colSpan={2}>
                    {peso(totalValue)}
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>

        <div className={receiptStyles.divider} />

        {/* ── Footer ── */}
        <p className={receiptStyles.receiptKicker}>END OF DELIVERY RECORD</p>
        <div
          aria-hidden="true"
          className={receiptStyles.scanned}
          style={{
            background:
              "repeating-linear-gradient(90deg, #1b2a4a 0 2px, transparent 2px 5px, #1b2a4a 5px 6px, transparent 6px 10px)",
          }}
        />
        <p className={receiptStyles.scannedLabel}>DELIVERY #{ref}</p>
        <p className={receiptStyles.recorded}>
          REC • {fmt(delivery.created_at)}
        </p>
        <p className={receiptStyles.thanks}>*** Thank you! ***</p>
      </div>
    </article>
  );
}
