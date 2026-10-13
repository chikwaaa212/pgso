"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { label } from "@/lib/labels";
import { getPendingEmployees, getUsersPage, getUserCounts } from "./actions";
import { ActiveToggle, ApprovalActions } from "./user-actions";
import { TablePager } from "@/components/personnel/TablePager";
import { useCachedAction } from "@/hooks/use-cached-action";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { buildQueryKey } from "@/lib/query-keys";
import { useAdminRealtime } from "@/hooks/use-admin-realtime";
import { PAGE_SIZE } from "@/lib/constants";
import UsersLoading from "./loading";
import styles from "./page.module.css";

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

export default function SuperAdminUsersPage() {
  // Server-paged roster window (PAGE_SIZE = 15): the DB returns only the
  // window + exact total per filter set (30s, busted by user writes).
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 300);
  const searching = query.trim() !== debouncedQuery.trim();
  const [page, setPage] = useState(1);
  const { data: paged, loading, refresh, isValidating } = useCachedAction(
    buildQueryKey({ module: 'super-admin', resource: 'users', page, filters: { q: debouncedQuery } }),
    () => getUsersPage({ page, q: debouncedQuery }),
    { staleTime: 30_000 }
  );
  const users = useMemo(() => paged?.rows ?? [], [paged]);
  const total = paged?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const { data: countsData } = useCachedAction(
    buildQueryKey({ module: 'super-admin', resource: 'users-counts' }),
    getUserCounts,
    { staleTime: 30_000 }
  );
  const counts = countsData ?? { pending: 0, personnel: 0, employees: 0 };
  const { data: pendingData, refresh: refreshPending } = useCachedAction(
    buildQueryKey({ module: 'super-admin', resource: 'pending-approvals' }),
    getPendingEmployees,
    { staleTime: 30_000 }
  );
  const pending = useMemo(() => pendingData ?? [], [pendingData]);

  const refreshAll = () => {
    refresh();
    refreshPending();
  };

  // Profile status/role changes by another admin sync silently.
  useAdminRealtime({
    channel: "admin-users",
    tables: [{ table: "profile" }],
    onEvent: refresh,
  });

  if (loading && users.length === 0) {
    return <UsersLoading />;
  }

  const visibleRoster = users;

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Super Admin / Users</p>
      <div>
        <h1 className={styles.title}>Users</h1>
        <p className={styles.subtitle}>
          {counts.personnel} personnel ·{" "}
          {counts.employees} employees · {counts.pending} pending approval. Employee + Personnel accounts
          self-register (Google or Email + OTP) and wait for your approval before they can sign in.
          {isValidating || searching ? (
            <span role="status" aria-live="polite"> Updating…</span>
          ) : null}
        </p>
      </div>

      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>Pending approvals ({pending.length})</h2>
        <p className={styles.panelSub}>
          Verified self-registrations waiting for review. Approving activates the account immediately;
          rejecting deactivates it.
        </p>
        {pending.length === 0 ? (
          <p className={styles.empty}>No accounts waiting for approval.</p>
        ) : (
          <div className={`${styles.tableWrap} pgso-no-scrollbar`}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Created</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((u) => (
                  <tr key={u.id}>
                    <td>{u.full_name ?? "—"}</td>
                    <td>{u.email ?? "—"}</td>
                    <td>{roleLabel(u.role)}</td>
                    <td>{fmtDate(u.created_at)}</td>
                    <td>
                      <ApprovalActions
                        userId={u.id}
                        name={u.full_name ?? u.email ?? "account"}
                        role={roleLabel(u.role)}
                        onDone={() => refreshAll()}
                      />
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
        <div className={styles.searchRow}>
          <Input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search name, email, role, office…"
            aria-label="Search accounts"
          />
        </div>
        <div className={`${styles.tableWrap} pgso-no-scrollbar`}>
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
              {visibleRoster.map((u) => {
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
                    <td>{[u.position, u.department, u.office].filter(Boolean).join(" · ") || "—"}</td>
                    <td>{fmtDate(u.created_at)}</td>
                    <td>
                      {locked ? (
                        <span className={styles.empty}>locked</span>
                      ) : (
                        <ActiveToggle
                          userId={u.id}
                          name={u.full_name ?? u.email ?? "account"}
                          isActive={isActive}
                          onSuccess={() => refreshAll()}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {total > 0 ? (
          <TablePager
            id="admin-users"
            total={total}
            pageSize={PAGE_SIZE}
            page={safePage}
            onPageChange={setPage}
          />
        ) : null}
      </Card>
    </section>
  );
}
