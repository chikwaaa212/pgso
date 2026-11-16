import { Card } from "@/components/ui/card";
import styles from "../../dashboard/page.module.css";
import assetStyles from "../page.module.css";

/**
 * Asset-detail skeleton — mirrors AssetDetailEditor's identity header, tab
 * bar, and Information tab (QR aside + field sections) so content swaps in
 * without layout shift.
 */

const SECTIONS: { title: string; fields: string[] }[] = [
  {
    title: "Identification",
    fields: [
      "Account Code",
      "Property No. (QR)",
      "Identifier",
      "Account Title",
      "Account Name",
      "Asset Type",
      "Article",
    ],
  },
  {
    title: "Item Details",
    fields: [
      "Quantity",
      "Unit",
      "Description",
      "Date Acquired",
      "Location",
      "End User",
    ],
  },
  {
    title: "Financial",
    fields: ["Total Cost", "Unit Cost", "Condition", "Status"],
  },
  {
    title: "Vehicle / Equipment Details",
    fields: [
      "Brand",
      "Cylinders",
      "Engine Displacement",
      "Fuel Type",
      "Engine #",
      "Chassis #",
      "Color",
      "Plate No.",
    ],
  },
  {
    title: "Funding & Documents",
    fields: [
      "Fund",
      "DV Tracking #",
      "Supplier / Payee",
      "Charge Account",
      "Account Number",
      "OBR Number",
      "DV Number",
      "Date Received",
    ],
  },
  { title: "Remarks", fields: ["Remarks"] },
  { title: "System", fields: ["Created"] },
];

const FACTS = ["Record created"] as const;

export default function AssetDetailLoading() {
  return (
    <section
      className={styles.section}
      aria-busy="true"
      aria-label="Loading asset details"
    >
      {/* Identity header */}
      <div className={assetStyles.detailHero}>
        <div className={assetStyles.detailHeroMain}>
          <span className={assetStyles.detailHeroIcon} aria-hidden="true" />
          <div className={assetStyles.detailHeroText}>
            <span className="block h-5 w-56 animate-pulse rounded bg-navy-100" />
            <div className={assetStyles.detailHeroActions} aria-hidden="true">
              <span className="h-6 w-16 animate-pulse rounded-[4px] bg-yellow-500/60" />
              <span className="h-6 w-20 animate-pulse rounded-[4px] bg-yellow-500/60" />
            </div>
          </div>
        </div>
        <div className={assetStyles.detailStats} aria-hidden="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={assetStyles.detailStat}>
              <span className="block h-2.5 w-14 animate-pulse rounded bg-navy-100" />
              <span className="block h-4 w-20 animate-pulse rounded bg-navy-100" />
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className={assetStyles.detailTabsBar} aria-hidden="true">
        <div className="flex h-6 items-center gap-2">
          <span className="h-6 w-28 animate-pulse rounded-[4px] bg-navy-100" />
          <span className="h-6 w-24 animate-pulse rounded-[4px] bg-navy-100" />
        </div>
        <span className="h-3 w-40 animate-pulse rounded bg-navy-100" />
      </div>

      {/* Information tab */}
      <Card className={`${styles.panel} ${assetStyles.detailPanel}`}>
        <div className={assetStyles.infoLayout} aria-hidden="true">
          <aside className={assetStyles.infoAside}>
            <div className={assetStyles.qrCard}>
              <span className="h-48 w-48 animate-pulse rounded-md bg-navy-100" />
              <p className={assetStyles.qrLabel}>Scan for details + history</p>
              <span className="block h-4 w-32 animate-pulse rounded bg-navy-100" />
            </div>
          </aside>

          <div className={assetStyles.infoMain}>
            {/* Accountability banner skeleton */}
            <div className={assetStyles.factsBanner} aria-hidden="true">
              <span className={assetStyles.factsBannerMain}>
                <span className={assetStyles.factsKicker}>Accountability</span>
                <span className="block h-4 w-40 animate-pulse rounded bg-navy-700/40" />
                <span className="block h-2.5 w-48 animate-pulse rounded bg-navy-700/30" />
              </span>
              <span className={assetStyles.factsBannerMeta}>
                {FACTS.map((label) => (
                  <span key={label} className={assetStyles.factsMetaItem}>
                    <span className={assetStyles.factsMetaLabel}>{label}</span>
                    <span className="block h-3 w-24 animate-pulse rounded bg-navy-700/40" />
                  </span>
                ))}
              </span>
              <span className={assetStyles.factsBannerCta}>View history</span>
            </div>
            {SECTIONS.map((section) => (
              <section key={section.title} className={assetStyles.infoSection}>
                <div className={assetStyles.infoSectionHead}>
                  <h2 className={assetStyles.infoSectionTitle}>{section.title}</h2>
                  <span className={assetStyles.infoSectionCount}>
                    {section.fields.length} fields
                  </span>
                </div>
                <div className={assetStyles.detailFields}>
                  {section.fields.map((label) => (
                    <div key={label} className={assetStyles.detailField}>
                      <span className={assetStyles.detailLabel}>{label}</span>
                      {label === "Status" ? (
                        <span className="h-[22px] w-20 animate-pulse rounded-full bg-navy-100" />
                      ) : (
                        <span className="block h-4 w-3/4 animate-pulse rounded bg-navy-100" />
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </Card>
    </section>
  );
}
