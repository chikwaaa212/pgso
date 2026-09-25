import { Card } from "@/components/ui/card";

/**
 * Stock detail skeleton — mirrors the stock editor layout.
 */
export default function SuperAdminStockDetailLoading() {
  return (
    <section aria-busy="true" aria-label="Loading stock detail" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div className="h-4 w-48 animate-pulse rounded bg-navy-100" aria-hidden="true" />
      <Card style={{ padding: "1.5rem" }}>
        <div aria-hidden="true" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div className="h-7 w-64 animate-pulse rounded bg-navy-100" />
          <div className="h-3 w-full animate-pulse rounded bg-navy-100" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 w-full animate-pulse rounded bg-navy-100" style={{ opacity: 1 - i * 0.08 }} />
          ))}
        </div>
      </Card>
    </section>
  );
}
