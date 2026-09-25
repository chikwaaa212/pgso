"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { label } from "@/lib/labels";
import { getAllUsers, getUserCounts } from "./actions";
import { ActiveToggle } from "./user-actions";
import { TablePager } from "@/components/personnel/TablePager";
import { usePageSize } from "@/hooks/use-page-size";
import { useCachedAction } from "@/hooks/use-cached-action";
import { useAdminRealtime } from "@/hooks/use-admin-realtime";
import { CLIENT_CACHE_KEYS } from "@/lib/client-cache";
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
  // Cached snapshot (roster + counts): back-navigation paints
  // instantly from memory / sessionStorage and only revalidates silently
  // when stale (30s, matching the server caches) — same SWR pattern as
  // the other admin pages.
  const { data: snapshot, loading, refresh, isValidating } = useCachedAction(
    CLIENT_CACHE_KEYS.adminUsers,
    () =>
      Promise.all([getAllUsers(), getUserCounts()]).then(
        ([users, counts]) => ({ users, counts })
      ),
    { staleTime: 30_000 }
  );
  const users = useMemo(() => snapshot?.users ?? [], [snapshot]);
  const counts = snapshot?.counts ?? { pending: 0, personnel: 0, employees: 0 };
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = usePageSize("pgso:admin:users", 10);
  const [page, setPage] = useState(1);

  // Profile status/role changes by another admin sync silently.
  useAdminRealtime({
    channel: "admin-users",
    tables: [{ table: "profile" }],
    onEvent: refresh,
  });

  if (loading) {
    return <UsersLoading />;
  }

  const roster = users.filter((u) => u.status !== "pending" || u.role !== "employee");
  const q = query.trim().toLowerCase();
  const filteredRoster = q === ""
    ? roster
      : roster.filter((u) =>
        [
          u.full_name ?? "",
          u.email ?? "",
          roleLabel(u.role),
          u.status,
          u.position ?? "",
          u.office ?? "",
          u.employee_no ?? "",
          u.department ?? "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
  const pageCount = Math.max(1, Math.ceil(filteredRoster.length / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const visibleRoster = filteredRoster.slice(
    (safePage - 1) * pageSize,
    (safePage - 1) * pageSize + pageSize
  );

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Super Admin / Users</p>
      <div>
        <h1 className={styles.title}>Users</h1>
        <p className={styles.subtitle}>
          {counts.personnel} personnel ·{" "}
          {counts.employees} employees. Employee + Personnel accounts are
          self-registered (Google or Email + OTP) and active immediately — no
          approval needed.
          {isValidating ? (
            <span role="status" aria-live="polite"> Updating…</span>
          ) : null}
        </p>
      </div>

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
                          onSuccess={() => refresh()}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filteredRoster.length > 0 ? (
          <TablePager
            id="admin-users"
            total={filteredRoster.length}
            pageSize={pageSize}
            page={safePage}
            onPageSizeChange={setPageSize}
            onPageChange={setPage}
          />
        ) : null}
      </Card>
    </section>
  );
}
