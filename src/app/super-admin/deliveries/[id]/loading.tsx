import { Card } from "@/components/ui/card";
import receiptStyles from "@/app/personnel/inspections/components/receipt.module.css";

/**
 * Delivery receipt skeleton — mirrors the read-only oversight receipt
 * (toolbar + header + line-item table) so the paper swaps in without
 * layout shift.
 */
export default function SuperAdminDeliveryDetailLoading() {
  return (
    <div className={receiptStyles.page}>
      <div className={receiptStyles.receiptStack}>
        <p className={receiptStyles.stackLabel}>OFFICIAL COPY — READ ONLY</p>
        <Card style={{ padding: "1.5rem" }} aria-busy="true" aria-label="Loading delivery receipt">
          <div aria-hidden="true" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div className="h-4 w-40 animate-pulse rounded bg-navy-100" />
            <div className="h-7 w-64 animate-pulse rounded bg-navy-100" />
            <div className="h-3 w-full animate-pulse rounded bg-navy-100" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-navy-100" />
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-10 w-full animate-pulse rounded bg-navy-100" style={{ opacity: 1 - i * 0.08 }} />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
