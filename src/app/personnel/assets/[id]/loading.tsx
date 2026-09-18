import { Card } from "@/components/ui/card";
import styles from "../../dashboard/page.module.css";
import assetStyles from "../page.module.css";
import receipt from "../../inspections/components/receipt.module.css";

/**
 * Asset-detail skeleton — mirrors AssetDetailEditor's read-only view 1:1
 * (crumb, header + actions, QR card + field sections, history receipt)
 * so content swaps in without layout shift.
 *
 * Static chrome (section titles, field labels, receipt masthead) renders
 * as real text with real classes; only live values are pulse placeholders.
 */

// Same section titles + field labels as FIELD_SECTIONS in AssetDetailEditor.
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
  {
    title: "Remarks",
    fields: ["Remarks"],
  },
  {
    title: "System",
    fields: ["Created"],
  },
];

const ASSET_ROWS = [
  "Article",
  "Account Code",
  "Property No.",
  "Asset Type",
  "Location",
  "Status",
  "Current Holder",
] as const;

export default function AssetDetailLoading() {
  return (
    <section
      className={styles.section}
      aria-busy="true"
      aria-label="Loading asset details"
    >
      <p className={styles.crumb}>
        Personnel / Assets /{" "}
        <span
          aria-hidden="true"
          className="inline-block h-3 w-20 animate-pulse rounded bg-navy-100 align-middle"
        />
      </p>

      {/* Header — same as the real page */}
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Asset Detail</h1>
          <p className={styles.subtitle} aria-hidden="true">
            <span className="mt-1 block h-4 w-56 animate-pulse rounded bg-navy-100" />
          </p>
        </div>
        <div className={styles.actions} aria-hidden="true">
          <span className="inline-flex h-8 items-center justify-center rounded-[4px] border border-navy-200 bg-white px-3.5 text-xs font-semibold text-navy-700">
            Back to Assets
          </span>
          <span className="inline-flex h-8 items-center justify-center rounded-[4px] bg-navy-900 px-3.5 text-xs font-semibold text-white">
            Edit
          </span>
        </div>
      </div>

      {/* Detail — same QR card + field sections as the read-only view */}
      <Card className={styles.panel}>
        <div className={assetStyles.detailGrid} aria-hidden="true">
          <div className={assetStyles.qrCard}>
            <span className="h-48 w-48 animate-pulse rounded-md bg-navy-100" />
            <p className={assetStyles.qrLabel}>Scan for details + history</p>
            <span className="block h-4 w-32 animate-pulse rounded bg-navy-100" />
          </div>
          <div className={assetStyles.detailFields}>
            {SECTIONS.map((section) => (
              <div key={section.title} className="mb-6 last:mb-0">
                <h3 className={assetStyles.sectionTitle}>{section.title}</h3>
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
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* History — same receipt positions as AssetHistorySection */}
      <div style={{ marginTop: "1.25rem" }}>
        <Card className={styles.panel}>
          <h2 className={styles.panelTitle}>History</h2>
          <p className={styles.panelSub}>
            Every assignment and repair for this asset — each opens its
            receipt.
          </p>
          <article className={receipt.receipt} aria-hidden="true">
            <div className={receipt.receiptInner}>
              <header className={receipt.masthead}>
                <p className={receipt.orgName}>PGSO</p>
                <p className={receipt.orgSub}>
                  Property &amp; Supply Management
                </p>
                <p className={receipt.docTitle}>*** ASSET HISTORY ***</p>
                <p className={receipt.docSub}>
                  <span className="mx-auto block h-4 w-40 animate-pulse rounded bg-navy-100" />
                </p>
              </header>

              <div className={receipt.divider} />

              <p className={receipt.sectionTitle}>ASSET</p>
              <dl className={receipt.rows}>
                {ASSET_ROWS.map((label) => (
                  <div key={label} className={receipt.row}>
                    <dt>{label}</dt>
                    <dd>
                      <span className="block h-4 w-2/3 animate-pulse rounded bg-navy-100" />
                    </dd>
                  </div>
                ))}
              </dl>

              <div className={receipt.divider} />

              {(
                [
                  "ASSIGNMENT HISTORY",
                  "REPAIR HISTORY",
                  "REQUEST HISTORY",
                ] as const
              ).map((title) => (
                <div key={title}>
                  <p className={receipt.sectionTitle}>{title}</p>
                  <dl className={receipt.rows}>
                    {Array.from({ length: 2 }).map((_, i) => (
                      <div key={i} className={receipt.row}>
                        <dt>
                          <span className="block h-4 w-40 animate-pulse rounded bg-navy-100" />
                        </dt>
                        <dd>
                          <span className="block h-4 w-24 animate-pulse rounded bg-navy-100" />
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <div className={receipt.divider} />
                </div>
              ))}

              <p className={receipt.receiptKicker}>END OF ASSET HISTORY</p>
              <div
                aria-hidden="true"
                className={receipt.scanned}
                style={{
                  background:
                    "repeating-linear-gradient(90deg, #1b2a4a 0 2px, transparent 2px 5px, #1b2a4a 5px 6px, transparent 6px 10px)",
                }}
              />
              <p className={receipt.scannedLabel}>
                <span className="mx-auto block h-3 w-24 animate-pulse rounded bg-navy-100" />
              </p>
              <p className={receipt.thanks}>*** Thank you! ***</p>
            </div>
          </article>
        </Card>
      </div>
    </section>
  );
}
