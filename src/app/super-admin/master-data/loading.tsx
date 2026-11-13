import { Card } from "@/components/ui/card";
import styles from "./page.module.css";

/**
 * Super-admin master-data skeleton — mirrors SuperAdminMasterDataPage 1:1
 * (header with live counts, then the same 2-up card grid: Departments, Units,
 * Stock headers and Asset headers, each with its header copy and the narrowed
 * 3-column table) so content swaps in without layout shift.
 *
 * Static chrome renders as real text with the real classes; only live
 * values are pulse placeholders sized to the real cells.
 */

const headerBtn =
  "inline-flex h-6 items-center rounded-[4px] border border-yellow-600 bg-yellow-500 px-2.5 text-[0.6875rem] font-semibold text-navy-900";

function TextPulse({ className }: { className: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded bg-navy-100 ${className}`}
    />
  );
}

function PillPulse({ className = "w-16" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-full bg-navy-100 ${className}`}
      style={{ height: 20 }}
    />
  );
}

function CardHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle: string;
  actions: string[];
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h2 className={styles.panelTitle}>{title}</h2>
        <p className={styles.panelSub}>{subtitle}</p>
      </div>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center", flexShrink: 0 }} aria-hidden="true">
        {actions.map((label) => (
          <span key={label} className={headerBtn}>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function TableSkeleton({ columns, rows = 3 }: { columns: string[]; rows?: number }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table} aria-hidden="true">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r} style={{ opacity: 1 - r * 0.08 }}>
              {columns.map((column, c) => {
                if (c === columns.length - 1) {
                  return (
                    <td key={column}>
                      <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <TextPulse className="h-5 w-16" />
                      </div>
                    </td>
                  );
                }
                if (column === "Status") {
                  return (
                    <td key={column}>
                      <PillPulse />
                    </td>
                  );
                }
                return (
                  <td key={column}>
                    <TextPulse className={c === 0 ? "h-3.5 w-24" : "h-3.5 w-20"} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function MasterDataLoading() {
  return (
    <section
      className={`${styles.section} ${styles.interFont}`}
      aria-busy="true"
      aria-label="Loading master data"
    >
      <div>
        <h1 className={styles.title}>Master Data</h1>
        <p className={styles.subtitle}>
          These are the lists personnel choose from. A value can&apos;t be turned
          off while it is still in use.
        </p>
      </div>

      <div className={styles.cardsGrid}>
        <Card className={`${styles.panel} p-4`}>
          <CardHeader
            title="Departments"
            subtitle="The offices staff can choose from when they sign up."
            actions={["Add department"]}
          />
          <TableSkeleton columns={["Name", "Status", "Action"]} />
        </Card>

        <Card className={`${styles.panel} p-4`}>
          <CardHeader
            title="Units"
            subtitle="How items are counted — for example piece, set, or box."
            actions={["Add unit"]}
          />
          <TableSkeleton columns={["Name", "Status", "Action"]} />
        </Card>

        <Card className={`${styles.panel} p-4`}>
          <CardHeader
            title="Stock headers"
            subtitle="Groups for consumable supplies, like office or cleaning materials."
            actions={["Add stock header"]}
          />
          <TableSkeleton columns={["Code", "Status", "Action"]} />
        </Card>

        <Card className={`${styles.panel} p-4`}>
          <CardHeader
            title="Asset headers"
            subtitle="The official list of items with their codes."
            actions={["Add catalog entry", "Import Excel"]}
          />
          <TableSkeleton columns={["Code", "Status", "Actions"]} />
        </Card>
      </div>
    </section>
  );
}
