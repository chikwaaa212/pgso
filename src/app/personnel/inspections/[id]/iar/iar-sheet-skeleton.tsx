import iar from "./iar.module.css";

/**
 * Mirrors the Appendix 62 IAR sheet: header grid, ruled 12-row items
 * table, inspection/acceptance blocks with signature lines — plus the
 * Previous AIRs history list below it.
 *
 * Lives next to the IAR page (instead of the shared receipt-skeleton)
 * because bundlers cannot resolve `[id]` segments in import paths.
 */

const LEFT_FIELDS = [
  "Entity Name :",
  "Supplier :",
  "PO No./Date :",
  "Requisitioning Office/Dept. :",
  "Responsibility Center Code :",
] as const;

const RIGHT_FIELDS = [
  "Fund Cluster :",
  "IAR No. :",
  "Date :",
  "Invoice No. :",
  "Date :",
] as const;

export function IarSheetSkeleton() {
  return (
    <>
      <article className={iar.airSheet} aria-hidden="true">
        <p className={iar.appendix}>Appendix 62</p>
        <h1 className={iar.title}>INSPECTION AND ACCEPTANCE REPORT</h1>

        <div className={iar.headerGrid}>
          <div className={iar.headerColLeft}>
            {LEFT_FIELDS.map((label) => (
              <div key={label} className={iar.field}>
                <span className={iar.fieldLabel}>{label}</span>
                <span className="my-auto block h-3 w-full animate-pulse rounded bg-black/10" />
              </div>
            ))}
          </div>
          <div className={iar.headerColRight}>
            {RIGHT_FIELDS.map((label, i) => (
              <div key={`${label}-${i}`} className={iar.field}>
                <span className={iar.fieldLabel}>{label}</span>
                <span className="my-auto block h-3 w-full animate-pulse rounded bg-black/10" />
              </div>
            ))}
          </div>
        </div>

        <table className={iar.itemsTable}>
          <thead>
            <tr>
              <th className={`${iar.cellCenter} ${iar.cellStock}`}>
                Stock/
                <br />
                Property No.
              </th>
              <th className={iar.cellDesc}>Description</th>
              <th className={`${iar.cellCenter} ${iar.cellUnit}`}>Unit</th>
              <th className={`${iar.cellCenter} ${iar.cellQty}`}>Quantity</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 12 }).map((_, r) => (
              <tr key={r}>
                <td>
                  <span className="block h-3 w-3/4 animate-pulse rounded bg-black/10" />
                </td>
                <td>
                  <span
                    className="block h-3 animate-pulse rounded bg-black/10"
                    style={{ opacity: 1 - r * 0.05, width: "85%" }}
                  />
                </td>
                <td>
                  <span className="mx-auto block h-3 w-8 animate-pulse rounded bg-black/10" />
                </td>
                <td>
                  <span className="mx-auto block h-3 w-10 animate-pulse rounded bg-black/10" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className={iar.bottomGrid}>
          <section className={iar.bottomLeft}>
            <p className={iar.bottomTitle}>INSPECTION</p>
            <div className={iar.bottomBody}>
              <div className={iar.field}>
                <span className={iar.fieldLabel}>Date Inspected :</span>
                <span className="my-auto block h-3 w-full animate-pulse rounded bg-black/10" />
              </div>
              <div className={iar.checkRow}>
                <span className={iar.checkbox} />
                <span className="block h-3 w-full animate-pulse rounded bg-black/10" />
              </div>
              <div className={iar.sig}>
                <span className="mx-auto block h-4 w-40 animate-pulse rounded bg-black/10" />
                <p className={iar.sigLabel}>
                  Inspection Officer/Inspection Committee
                </p>
              </div>
            </div>
          </section>

          <section className={iar.bottomRight}>
            <p className={iar.bottomTitle}>ACCEPTANCE</p>
            <div className={iar.bottomBody}>
              <div className={iar.field}>
                <span className={iar.fieldLabel}>Date Received :</span>
                <span className="my-auto block h-3 w-full animate-pulse rounded bg-black/10" />
              </div>
              <div className={iar.checkRow}>
                <span className={iar.checkbox} />
                <span className="block h-3 w-20 animate-pulse rounded bg-black/10" />
              </div>
              <div className={iar.checkRow}>
                <span className={iar.checkbox} />
                <span className="block h-3 w-48 animate-pulse rounded bg-black/10" />
              </div>
              <div className={iar.sig}>
                <span className="mx-auto block h-4 w-40 animate-pulse rounded bg-black/10" />
                <p className={iar.sigLabel}>Supply and/or Property Custodian</p>
              </div>
            </div>
          </section>
        </div>
      </article>

      <section className={iar.history} aria-label="Previous AIRs">
        <h2 className={iar.historyTitle}>Previous AIRs</h2>
        <ul className={iar.historyList}>
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i} className={iar.historyItem}>
              <span className="inline-block h-[22px] w-20 animate-pulse rounded-full bg-navy-100" />
              <span className="inline-block h-3.5 w-28 animate-pulse rounded bg-navy-100" />
              <span className="inline-block h-3 w-48 animate-pulse rounded bg-navy-100" />
              <span className="inline-flex h-8 w-[70px] items-center justify-center rounded-[4px] bg-navy-100" />
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
