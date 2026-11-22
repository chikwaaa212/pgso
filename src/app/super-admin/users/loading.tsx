import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/personnel/PageHeader";
import styles from "./page.module.css";
import stockStyles from "@/app/personnel/stocks/page.module.css";
import airStyles from "@/app/personnel/inspections/air-section.module.css";
import docs from "@/app/personnel/issuances/page.module.css";

/**
 * Super-admin users skeleton — mirrors SuperAdminUsersPage 1:1 (header with
 * refresh, four clickable summary tiles, account/pending tabs, then the
 * roster card with its toolbar, avatar rows, and pager) so content swaps in
 * without layout shift.
 */

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
      className={`h-[22px] animate-pulse rounded-full bg-navy-100 ${className}`}
    />
  );
}

export default function UsersLoading() {
  return (
    <section
      className={styles.section}
      aria-busy="true"
      aria-label="Loading users"
    >
      <PageHeader
        eyebrow="Access control"
        title="Users"
        subtitle={
          <span
            aria-hidden="true"
            className="mt-1 block h-4 w-[30rem] max-w-full animate-pulse rounded bg-navy-100"
          />
        }
        meta={
          <span
            aria-hidden="true"
            className="mt-1 block h-3.5 w-56 animate-pulse rounded bg-navy-100"
          />
        }
        actions={
          <div className={styles.actions} aria-hidden="true">
            <div className="h-6 w-24 animate-pulse rounded-[4px] bg-yellow-200" />
          </div>
        }
      />

      {/* Summary tiles */}
      <div className={styles.summaryGrid} aria-hidden="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={stockStyles.summaryCard}>
            <span className={stockStyles.summaryIcon}>
              <span className="h-4 w-4 animate-pulse rounded bg-navy-200" />
            </span>
            <div className={stockStyles.summaryBody}>
              <TextPulse className="h-3 w-24" />
              <TextPulse className="mt-1 h-6 w-12" />
              <TextPulse className="mt-1 h-3 w-36" />
            </div>
          </div>
        ))}
      </div>

      {/* View tabs */}
      <div className={docs.tabsRow} aria-hidden="true">
        <div className={airStyles.tabs}>
          <span className="h-7 w-36 animate-pulse rounded-[4px] bg-navy-100" />
          <span className="h-7 w-40 animate-pulse rounded-[4px] bg-navy-100" />
        </div>
      </div>

      <Card className={stockStyles.panel}>
        {/* Toolbar — chips left, search + role/status filters right */}
        <div className={stockStyles.toolbar} aria-hidden="true">
          <div className={docs.statChips}>
            <span className="h-[22px] w-24 animate-pulse rounded-full bg-navy-100" />
            <span className="h-[22px] w-20 animate-pulse rounded-full bg-navy-100" />
          </div>
          <div className={stockStyles.filters}>
            <div className="h-8 w-72 max-w-full animate-pulse rounded-md bg-navy-100" />
            <div className="h-8 w-32 animate-pulse rounded-md bg-navy-100" />
            <div className="h-8 w-32 animate-pulse rounded-md bg-navy-100" />
          </div>
        </div>

        {/* Roster table */}
        <div className={stockStyles.tableWrap}>
          <table className={stockStyles.table} aria-hidden="true">
            <thead>
              <tr>
                <th>Account</th>
                <th>Role</th>
                <th>Status</th>
                <th>Office</th>
                <th>Created</th>
                <th style={{ textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 10 }).map((_, r) => (
                <tr key={r} style={{ opacity: 1 - r * 0.05 }}>
                  <td>
                    <div className={styles.accountCell}>
                      <span className="h-8 w-8 animate-pulse rounded-full bg-navy-100" />
                      <span className="flex flex-col gap-1">
                        <TextPulse className="h-3.5 w-28" />
                        <TextPulse className="h-3 w-40" />
                      </span>
                    </div>
                  </td>
                  <td>
                    <PillPulse className="w-20" />
                  </td>
                  <td>
                    <PillPulse className="w-16" />
                  </td>
                  <td>
                    <TextPulse className="h-3.5 w-24" />
                  </td>
                  <td>
                    <TextPulse className="h-3.5 w-20" />
                  </td>
                  <td className={styles.actionCell}>
                    <span className="inline-flex h-7 w-24 animate-pulse rounded-[4px] bg-yellow-200" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={stockStyles.footer} aria-hidden="true">
          <TextPulse className="h-3.5 w-36" />
          <TextPulse className="h-3.5 w-24" />
        </div>
      </Card>
    </section>
  );
}
