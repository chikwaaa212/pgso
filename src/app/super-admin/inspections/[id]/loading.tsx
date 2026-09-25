import { Card } from "@/components/ui/card";
import sectionStyles from "../page.module.css";

/**
 * Inspection detail skeleton — mirrors toolbar + receipt + IAR tables.
 */
export default function SuperAdminInspectionDetailLoading() {
  return (
    <section className={sectionStyles.section} aria-busy="true" aria-label="Loading inspection detail">
      <p className={sectionStyles.crumb}>Super Admin / Inspections / Detail</p>
      <Card className={sectionStyles.panel}>
        <div aria-hidden="true" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div className="h-4 w-40 animate-pulse rounded bg-navy-100" />
          <div className="h-7 w-64 animate-pulse rounded bg-navy-100" />
          <div className="h-3 w-full animate-pulse rounded bg-navy-100" />
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 w-full animate-pulse rounded bg-navy-100" style={{ opacity: 1 - i * 0.08 }} />
          ))}
        </div>
      </Card>
    </section>
  );
}
