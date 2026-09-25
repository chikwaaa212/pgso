import { Card } from "@/components/ui/card";
import receipt from "@/app/personnel/inspections/components/receipt.module.css";

/**
 * PAR / ICS report skeleton — mirrors the oversight report sheet.
 */
export default function SuperAdminIssuanceDetailLoading() {
  return (
    <div className={receipt.page} aria-busy="true" aria-label="Loading issuance report">
      <div className={receipt.receiptStack}>
        <p className={receipt.stackLabel}>OFFICIAL COPY — READ ONLY</p>
        <Card style={{ padding: "1.5rem" }}>
          <div aria-hidden="true" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div className="h-4 w-40 animate-pulse rounded bg-navy-100" />
            <div className="h-7 w-64 animate-pulse rounded bg-navy-100" />
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-10 w-full animate-pulse rounded bg-navy-100" style={{ opacity: 1 - i * 0.06 }} />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
