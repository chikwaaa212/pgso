import { format } from "date-fns";

import type { PreviewData } from "./log-delivery-mock-form";

function peso(n: number) {
  return `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function DeliveryReceipt({
  data,
  savedId,
}: {
  data: PreviewData;
  savedId?: string | null;
}) {
  const total = data.items.reduce(
    (sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unitCost) || 0),
    0
  );

  return (
    <div className="w-full rounded-md border border-navy-300 bg-white p-5 font-mono text-[13px] leading-relaxed text-navy-900 shadow-2xl">
      <div className="text-center">
        <p className="text-base font-bold tracking-[0.25em]">PGSO</p>
        <p className="text-[11px] tracking-wide text-navy-600">
          Property &amp; Supply Management
        </p>
        <p className="mt-2 text-sm font-bold tracking-[0.2em]">
          *** DELIVERY RECEIPT ***
        </p>
              <p className="text-[11px] tracking-widest text-navy-600">
                {savedId ? "OFFICIAL COPY — SAVED TO RECORDS" : "PREVIEW COPY — NOT OFFICIAL"}
              </p>
      </div>

      <div className="my-3 border-t border-dashed border-navy-300" />

      <div className="flex flex-col gap-1">
        <div className="flex justify-between gap-4">
          <span className="text-navy-600">Date</span>
          <span className="text-right">
            {data.dateSupplied ? format(data.dateSupplied, "PP") : "—"}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-navy-600">Supplier</span>
          <span className="text-right">{data.supplierName || "—"}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-navy-600">P.O. Ref</span>
          <span className="text-right">{data.poReference || "—"}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-navy-600">Status</span>
          <span className="text-right">{data.deliveryStatus}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-navy-600">Received By</span>
          <span className="text-right">
            {data.recipientName
              ? `${data.recipientName} (${data.recipientRole})`
              : data.recipientRole || "—"}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-navy-600">Asset Type</span>
          <span className="text-right">{data.assetType || "—"}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-navy-600">Asset Code</span>
          <span className="text-right">{data.assetCode || "—"}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-navy-600">Account</span>
          <span className="text-right">{data.accountType || "—"}</span>
        </div>
      </div>

      <div className="my-3 border-t border-dashed border-navy-300" />

      <p className="text-[11px] tracking-[0.2em] text-navy-600">
        ITEMS DELIVERED ({data.items.length})
      </p>
      <div className="mt-1 flex flex-col">
        {data.items.map((it, i) => {
          const qty = Number(it.quantity) || 0;
          const cost = Number(it.unitCost) || 0;
          const line = qty * cost;
          return (
            <div key={it.id} className="border-b border-dotted border-navy-200 py-1.5 last:border-b-0">
              <div className="flex justify-between gap-2">
                <span className="font-bold">
                  {i + 1}. {it.description || "Unnamed item"}
                </span>
                <span>{cost > 0 ? peso(line) : "—"}</span>
              </div>
              <div className="text-[12px] text-navy-600">
                {qty} {it.units || "units"}
                {cost > 0 && ` @ ${peso(cost)}`}
              </div>
            </div>
          );
        })}
      </div>

      <div className="my-3 border-t border-dashed border-navy-300" />

      <div className="flex justify-between text-sm font-bold">
        <span>EST. TOTAL</span>
        <span>{total > 0 ? peso(total) : "—"}</span>
      </div>

      <div
        aria-hidden="true"
        className="mx-auto mt-4 h-10 w-48"
        style={{
          background:
            "repeating-linear-gradient(90deg, #1b2a4a 0 2px, transparent 2px 5px, #1b2a4a 5px 6px, transparent 6px 10px)",
        }}
      />
            <p className="mt-1 text-center text-[11px] tracking-[0.3em]">
              {savedId
                ? `SAVED • ${savedId.slice(0, 8).toUpperCase()}`
                : data.poReference || "NO-PO"}
            </p>
            <p className="mt-3 text-center text-[11px]">
              {savedId
                ? "*** Thank you! ***"
                : "*** Preview only — nothing was saved ***"}
            </p>
      <p className="text-center text-[11px] text-navy-600">Thank you!</p>
    </div>
  );
}
