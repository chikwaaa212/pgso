"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { portalFromPathname } from "@/lib/portal-path";
import type { DeliveryDetails } from "../actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import receiptStyles from "@/app/personnel/inspections/components/receipt.module.css";
import styles from "../delivery-receipt.module.css";

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

type Tone = "ok" | "warn" | "info" | "bad";

/** Same delivery states the log table shows. */
function deliveryLabel(value: string | null | undefined) {
  if (value === "awaiting") return "Waiting for arrival";
  if (value === "arrival") return "Arrival";
  return "Delivered";
}

function deliveryTone(value: string | null | undefined): Tone {
  return value === "awaiting" || value === "arrival" ? "info" : "ok";
}

function inspectionLabel(value: string | null | undefined) {
  if (!value) return "Pending";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Badge tones mirror the data table (pending is amber there too). */
function inspectionTone(value: string | null | undefined): Tone {
  if (value === "passed") return "ok";
  if (value === "failed") return "bad";
  if (value === "partial") return "warn";
  return "warn";
}

function Pill({ label, tone }: { label: string; tone: Tone }) {
  return (
    <span className={styles.pill} data-tone={tone}>
      {label}
    </span>
  );
}

/** Item lines table — shared by the inline record and the See-all overlay. */
function ItemsTable({
  items,
  totalValue,
}: {
  items: DeliveryDetails["items"];
  totalValue?: number;
}) {
  return (
    <table className={styles.items}>
      <thead>
        <tr>
          <th>#</th>
          <th>Item Name</th>
          <th>Unit</th>
          <th className={styles.num}>Qty</th>
          <th className={styles.num}>Unit Cost</th>
          <th className={styles.num}>Line Total</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item, i) => (
          <tr key={item.id}>
            <td className={styles.idx}>{i + 1}</td>
            <td className={styles.itemName}>{item.item_name}</td>
            <td>{item.unit ?? "—"}</td>
            <td className={styles.num}>{item.quantity}</td>
            <td className={styles.num}>{peso(item.unit_cost)}</td>
            <td className={styles.num}>
              {peso((Number(item.unit_cost) || 0) * item.quantity)}
            </td>
          </tr>
        ))}
      </tbody>
      {totalValue != null ? (
        <tfoot>
          <tr>
            <td colSpan={4}>Estimated Total</td>
            <td className={styles.num} colSpan={2}>
              {peso(totalValue)}
            </td>
          </tr>
        </tfoot>
      ) : null}
    </table>
  );
}

export function DeliveryReceiptToolbar({ backHref, backLabel = "Back to deliveries" }: { backHref?: string; backLabel?: string } = {}) {
  const portal = portalFromPathname(usePathname());
  return (
    <div className={receiptStyles.toolbar}>
      <Link
        href={backHref ?? `/${portal}/deliveries`}
        className={cn(receiptStyles.toolbarBtn, receiptStyles.toolbarGhost)}
      >
        {backLabel}
      </Link>
      <button
        type="button"
        className={cn(receiptStyles.toolbarBtn, receiptStyles.toolbarPrint)}
        onClick={() => window.print()}
      >
        Print / Save PDF
      </button>
    </div>
  );
}

export function DeliveryReceipt({
  delivery,
  maxItems,
}: {
  delivery: DeliveryDetails;
  /** Inline embeds can cap the rows; a See-all overlay shows the rest. */
  maxItems?: number;
}) {
  const [showAllItems, setShowAllItems] = useState(false);
  const ref = delivery.delivery_ref;
  const totalValue = delivery.items.reduce(
    (sum, item) => sum + (Number(item.unit_cost) || 0) * item.quantity,
    0
  );
  const hasCosts = delivery.items.some((it) => it.unit_cost != null);
  const capped = maxItems != null && delivery.items.length > maxItems;
  const visibleItems = capped ? delivery.items.slice(0, maxItems) : delivery.items;
  const hiddenCount = delivery.items.length - visibleItems.length;

  const kind =
    delivery.delivery_kind === "stock"
      ? "Stocks"
      : delivery.delivery_kind === "asset"
        ? "Assets"
        : "—";

  const recipient = delivery.recipient_name
    ? delivery.recipient_role
      ? `${delivery.recipient_name} (${delivery.recipient_role})`
      : delivery.recipient_name
    : (delivery.recipient_role ?? "—");

  // Field order mirrors the delivery log table: reference → supplier → type →
  // statuses → dates → people → catalog codes.
  const fields: Array<[string, ReactNode]> = [
    ["PO Ref", delivery.po_reference ?? "—"],
    ["Supplier", delivery.supplier ?? "—"],
    ["Type", kind],
    ["Arrival Date", fmt(delivery.expected_arrival_date)],
    [
      "Delivery",
      <Pill
        key="delivery"
        label={deliveryLabel(delivery.delivery_status)}
        tone={deliveryTone(delivery.delivery_status)}
      />,
    ],
    [
      "Inspection",
      <Pill
        key="inspection"
        label={inspectionLabel(delivery.inspection_status)}
        tone={inspectionTone(delivery.inspection_status)}
      />,
    ],
    ["Logged By", fmt(delivery.created_at)],
    ["Encoded By", delivery.logged_by_name ?? "—"],
    ["Received By", recipient],
    [
      delivery.delivery_kind === "stock" ? "Stock Code" : "Account Code",
      delivery.account_code ?? "—",
    ],
    [
      delivery.delivery_kind === "stock" ? "Stock Title" : "Account Title",
      delivery.account_title ?? "—",
    ],
    [
      delivery.delivery_kind === "stock" ? "Stock Type" : "Asset Type",
      (delivery.delivery_kind === "stock"
        ? delivery.stock_type
        : delivery.asset_type) ?? "—",
    ],
  ];

  if (delivery.date_delivered) {
    fields.push(["Date Delivered", fmt(delivery.date_delivered)]);
  }

  return (
    <article className={styles.sheet}>
      {/* Masthead */}
      <header className={styles.top}>
        <div className={styles.brand}>
          <p className={styles.brandName}>PGSO</p>
          <p className={styles.brandSub}>Property &amp; Supply Management</p>
        </div>
        <div className={styles.doc}>
          <p className={styles.docTitle}>Delivery Receipt</p>
          <p className={styles.docNo}>{ref}</p>
          <p className={styles.docDate}>Logged {fmt(delivery.created_at)}</p>
        </div>
      </header>

      {/* Delivery record */}
      <section className={styles.section}>
        <p className={styles.sectionTitle}>Delivery Record</p>
        <dl className={styles.grid}>
          {fields.map(([label, value]) => (
            <div key={label} className={styles.field}>
              <dt className={styles.label}>{label}</dt>
              <dd className={styles.value}>{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Items */}
      <section className={styles.section}>
        <p className={styles.sectionTitle}>
          Items Delivered ({delivery.items.length})
        </p>
        <div className={styles.tableWrap}>
          <ItemsTable
            items={visibleItems}
            totalValue={hasCosts ? totalValue : undefined}
          />
        </div>
        {hiddenCount > 0 ? (
          <div className={styles.seeAllRow}>
            <span className={styles.seeAllHint}>
              Showing {visibleItems.length} of {delivery.items.length} items
            </span>
            <button
              type="button"
              className={styles.seeAllBtn}
              onClick={() => setShowAllItems(true)}
            >
              See all {delivery.items.length} items
            </button>
          </div>
        ) : null}
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <p className={styles.kicker}>End of delivery record</p>
        <div className={styles.footerMeta}>
          <div aria-hidden="true" className={styles.barcode} />
          <p className={styles.footerRef}>Delivery #{ref}</p>
        </div>
      </footer>

      {/* Full item lines for records that were capped inline. */}
      <Dialog open={showAllItems} onOpenChange={setShowAllItems}>
        <DialogContent className="bg-white sm:max-w-2xl dark:bg-white">
          <DialogHeader>
            <DialogTitle>Items delivered ({delivery.items.length})</DialogTitle>
            <DialogDescription>
              Delivery {ref} — every item line on this delivery.
            </DialogDescription>
          </DialogHeader>
          <div className={styles.tableWrap}>
            <ItemsTable
              items={delivery.items}
              totalValue={hasCosts ? totalValue : undefined}
            />
          </div>
        </DialogContent>
      </Dialog>
    </article>
  );
}
