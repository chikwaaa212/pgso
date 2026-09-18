import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import styles from "./page.module.css";
import actionStyles from "@/app/personnel/dashboard/page.module.css";

/**
 * Super-admin users skeleton — mirrors SuperAdminUsersPage 1:1 (crumb,
 * header with counts, pending-approvals panel with Approve/Reject
 * buttons, all-accounts panel with toggle buttons) so content swaps in
 * without layout shift.
 *
 * Static chrome renders as real text with the real classes; only live
 * values are pulse placeholders sized to the real cells.
 */

const btnPrimary: React.CSSProperties = {
  padding: "0.375rem 0.75rem",
  fontSize: "0.75rem",
  fontWeight: 600,
  borderRadius: "0.375rem",
  border: "1px solid var(--color-navy-600)",
  background: "var(--color-navy-900)",
  color: "#fff",
  whiteSpace: "nowrap",
};

const btnDanger: React.CSSProperties = {
  ...btnPrimary,
  border: "1px solid #b91c1c",
  background: "#fff",
  color: "#b91c1c",
};

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
      <p className={styles.crumb}>Super Admin / Users</p>
      <div>
        <h1 className={styles.title}>Users</h1>
        <p className={styles.subtitle}>
          <span
            aria-hidden="true"
            className="inline-block h-4 w-56 animate-pulse rounded bg-navy-100 align-middle"
          />{" "}
          Admin creates personnel only — employees self-register and wait for
          approval.
        </p>
      </div>

      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>Pending employee approvals</h2>
        <p className={styles.panelSub}>
          Approve to let them sign in, reject to block. Rejected accounts become
          inactive and are signed out.
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.table} aria-hidden="true">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Requested</th>
                <th>Status</th>
                <th>Decision</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 3 }).map((_, r) => (
                <tr key={r} style={{ opacity: 1 - r * 0.1 }}>
                  <td>
                    <TextPulse className="h-3.5 w-28" />
                  </td>
                  <td>
                    <TextPulse className="h-3.5 w-40" />
                  </td>
                  <td>
                    <TextPulse className="h-3.5 w-20" />
                  </td>
                  <td>
                    <PillPulse />
                  </td>
                  <td>
                    <span style={{ display: "flex", gap: "0.5rem" }}>
                      <span style={btnPrimary}>Approve</span>
                      <span style={btnDanger}>Reject</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>All accounts</h2>
        <p className={styles.panelSub}>
          Personnel are created from{" "}
          <span style={{ textDecoration: "underline" }}>
            Dashboard → Add Personnel
          </span>
          . You cannot change your own account or any Super Admin here.
        </p>
        <div className={styles.searchRow} aria-hidden="true">
          <Input
            type="search"
            disabled
            placeholder="Search name, email, role, office…"
            aria-label="Search accounts"
            tabIndex={-1}
          />
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table} aria-hidden="true">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Office</th>
                <th>Created</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 10 }).map((_, r) => (
                <tr key={r} style={{ opacity: 1 - r * 0.05 }}>
                  <td>
                    <TextPulse className="h-3.5 w-28" />
                  </td>
                  <td>
                    <TextPulse className="h-3.5 w-40" />
                  </td>
                  <td>
                    <TextPulse className="h-3.5 w-20" />
                  </td>
                  <td>
                    <PillPulse />
                  </td>
                  <td>
                    <TextPulse className="h-3.5 w-24" />
                  </td>
                  <td>
                    <TextPulse className="h-3.5 w-20" />
                  </td>
                  <td>
                    <span style={btnDanger}>Deactivate</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pager — same structure as TablePager */}
        <div className={actionStyles.pager} aria-hidden="true">
          <span className={actionStyles.pagerInfo}>
            <span className="block h-3 w-36 animate-pulse rounded bg-navy-100" />
          </span>
          <div className={actionStyles.pagerControls}>
            <span className={actionStyles.pageSizeWrap}>
              <span>Rows</span>
              <span className="h-8 w-[5.5rem] animate-pulse rounded-md bg-navy-100" />
            </span>
            <span className={actionStyles.pageBtn} aria-hidden="true">
              ‹
            </span>
            <span className={actionStyles.pageBtn} data-active="true">
              1
            </span>
            <span className={actionStyles.pageBtn} aria-hidden="true">
              ›
            </span>
          </div>
        </div>
      </Card>
    </section>
  );
}
