import { Card } from "@/components/ui/card";

/**
 * Asset detail skeleton — mirrors the unified editor (header + fields +
 * history table) so the form swaps in without layout shift.
 */
export default function SuperAdminAssetDetailLoading() {
  return (
    <section aria-busy="true" aria-label="Loading asset detail" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div className="h-4 w-48 animate-pulse rounded bg-navy-100" aria-hidden="true" />
      <Card style={{ padding: "1.5rem" }}>
        <div aria-hidden="true" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div className="h-7 w-64 animate-pulse rounded bg-navy-100" />
          <div className="h-3 w-full animate-pulse rounded bg-navy-100" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-navy-100" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 w-full animate-pulse rounded bg-navy-100" style={{ opacity: 1 - i * 0.08 }} />
          ))}
        </div>
      </Card>
    </section>
  );
}
