import Link from "next/link";
import { Card } from "@/components/ui/card";
import { label } from "@/lib/labels";
import { getAllUsers, getPendingEmployees, getUserCounts } from "./actions";
import { ActiveToggle, PendingRowActions } from "./user-actions";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  });
}

function roleLabel(role: string) {
  if (role === "super_admin") return "Super Admin";
  if (role === "pgso_personnel") return "Personnel";
  return "Employee";
}

function statusTone(status: string) {
  if (status === "active") return "ok";
  if (status === "pending") return "warn";
  return "bad";
}

export default async function SuperAdminUsersPage() {
  const [pending, users, counts] = await Promise.all([
    getPendingEmployees(),
    getAllUsers(),
    getUserCounts(),
  ]);

  const roster = users.filter((u) => u.status !== "pending" || u.role !== "employee");

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Super Admin / Users</p>
      <div>
        <h1 className={styles.title}>Users</h1>
        <p className={styles.subtitle}>
          {counts.pending} awaiting approval · {counts.personnel} personnel ·{" "}
          {counts.employees} employees. Admin creates personnel only — employees
          self-register and wait for approval.
        </p>
      </div>

      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>Pending employee approvals</h2>
        <p className={styles.panelSub}>
          Approve to let them sign in, reject to block. Rejected accounts become
          inactive and are signed out.
        </p>
        {pending.length === 0 ? (
          <p className={styles.empty}>No pending approvals — queue is clear.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
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
                {pending.map((u) => (
                  <tr key={u.id}>
                    <td>{u.full_name ?? "—"}</td>
                    <td>{u.email ?? "—"}</td>
                    <td>{fmtDate(u.created_at)}</td>
                    <td>
                      <span className={styles.status} data-tone="warn">
                        Pending
                      </span>
                    </td>
                    <td>
                      <PendingRowActions userId={u.id} name={u.full_name ?? u.email ?? "account"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>All accounts</h2>
        <p className={styles.panelSub}>
          Personnel are created from{" "}
          <Link href="/super-admin/dashboard" style={{ textDecoration: "underline" }}>
            Dashboard → Add Personnel
          </Link>
          . You cannot change your own account or any Super Admin here.
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
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
              {roster.map((u) => {
                const locked = u.role === "super_admin";
                const isActive = u.status === "active";
                return (
                  <tr key={u.id}>
                    <td>{u.full_name ?? "—"}</td>
                    <td>{u.email ?? "—"}</td>
                    <td>{roleLabel(u.role)}</td>
                    <td>
                      <span className={styles.status} data-tone={statusTone(u.status)}>
                        {label(u.status)}
                      </span>
                    </td>
                    <td>{[u.position, u.office].filter(Boolean).join(" · ") || "—"}</td>
                    <td>{fmtDate(u.created_at)}</td>
                    <td>
                      {locked ? (
                        <span className={styles.empty}>locked</span>
                      ) : (
                        <ActiveToggle
                          userId={u.id}
                          name={u.full_name ?? u.email ?? "account"}
                          isActive={isActive}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}
