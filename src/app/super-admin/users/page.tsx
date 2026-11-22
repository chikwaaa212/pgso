"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
  UserCog,
  Users,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/personnel/PageHeader";
import { EmptySearchState } from "@/components/personnel/EmptySearchState";
import { Button } from "@/components/ui/button";
import { TablePager } from "@/components/personnel/TablePager";
import { label } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { PAGE_SIZE } from "@/lib/constants";
import {
  getPendingEmployees,
  getUsersPage,
  getUserCounts,
} from "./actions";
import { ActiveToggle, ApprovalActions } from "./user-actions";
import { useCachedAction } from "@/hooks/use-cached-action";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { buildQueryKey } from "@/lib/query-keys";
import { useAdminRealtime } from "@/hooks/use-admin-realtime";
import UsersLoading from "./loading";
import styles from "./page.module.css";
import stockStyles from "@/app/personnel/stocks/page.module.css";
import air from "@/app/personnel/inspections/air-section.module.css";
import docs from "@/app/personnel/issuances/page.module.css";
import assetStyles from "@/app/personnel/assets/page.module.css";

/** Yellow 24px action button — same treatment as the other list screens. */
const ACTION_BTN = cn(
  "h-6 gap-1.5 rounded-[4px] border border-yellow-500 bg-yellow-500 px-3 text-xs font-semibold",
  "text-navy-900 opacity-[0.85] transition-colors hover:bg-yellow-400 hover:text-navy-900 hover:opacity-100 disabled:opacity-40"
);

const ROLE_FILTERS = [
  { value: "all", label: "All roles" },
  { value: "super_admin", label: "Administrators" },
  { value: "pgso_personnel", label: "Personnel" },
  { value: "employee", label: "Employees" },
] as const;

const STATUS_FILTERS = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
] as const;

const TABS = [
  { value: "accounts", label: "All accounts" },
  { value: "pending", label: "Pending approvals" },
] as const;

type Tab = (typeof TABS)[number]["value"];

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
  if (role === "super_admin") return "Administrator";
  if (role === "pgso_personnel") return "Personnel";
  return "Employee";
}

function roleTone(role: string) {
  if (role === "super_admin") return "info";
  if (role === "pgso_personnel") return "ok";
  return "neutral";
}

function statusTone(status: string) {
  if (status === "active") return "ok";
  if (status === "pending") return "warn";
  return "bad";
}

function initials(name: string | null, email: string | null) {
  const source = (name ?? email ?? "?").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function SuperAdminUsersPage() {
  // Server-paged roster window (PAGE_SIZE = 10): the DB returns only the
  // window + exact total per filter set (30s, busted by user writes).
  const [tab, setTab] = useState<Tab>("accounts");
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 300);
  const searching = query.trim() !== debouncedQuery.trim();
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);

  const {
    data: paged,
    loading,
    refresh,
    isValidating,
  } = useCachedAction(
    buildQueryKey({
      module: 'super-admin',
      resource: 'users',
      page,
      filters: { q: debouncedQuery, role, status },
    }),
    () => getUsersPage({ page, q: debouncedQuery, role, status }),
    { staleTime: 30_000 }
  );
  const users = useMemo(() => paged?.rows ?? [], [paged]);
  const total = paged?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), pageCount);

  const { data: countsData, refresh: refreshCounts } = useCachedAction(
    buildQueryKey({ module: 'super-admin', resource: 'users-counts' }),
    getUserCounts,
    { staleTime: 30_000 }
  );
  const counts =
    countsData ?? { pending: 0, personnel: 0, employees: 0, admins: 0 };
  const totalAccounts = counts.admins + counts.personnel + counts.employees;

  const { data: pendingData, refresh: refreshPending } = useCachedAction(
    buildQueryKey({ module: 'super-admin', resource: 'pending-approvals' }),
    getPendingEmployees,
    { staleTime: 30_000 }
  );
  const pending = useMemo(() => pendingData ?? [], [pendingData]);

  const hasFilters = query.trim() !== "" || role !== "all" || status !== "all";

  const refreshAll = () => {
    refresh();
    refreshPending();
    refreshCounts();
  };

  const resetFilters = () => {
    setQuery("");
    setRole("all");
    setStatus("all");
    setPage(1);
  };

  const focusRole = (next: string) => {
    setTab("accounts");
    setRole(next);
    setStatus("all");
    setQuery("");
    setPage(1);
  };

  const openPending = () => setTab("pending");

  // Profile status/role changes by another admin sync silently.
  useAdminRealtime({
    channel: "admin-users",
    tables: [{ table: "profile" }],
    onEvent: refresh,
  });

  if (loading && users.length === 0) {
    return <UsersLoading />;
  }

  return (
    <section className={styles.section}>
      <PageHeader
        eyebrow="Access control"
        title="Users"
        subtitle="Approve self-registrations and manage who can sign in. Employee and Personnel accounts register themselves and wait for your approval."
        meta={`${totalAccounts.toLocaleString("en-PH")} account${
          totalAccounts === 1 ? "" : "s"
        } · ${counts.pending.toLocaleString("en-PH")} waiting for approval${
          isValidating || searching ? " · Updating…" : ""
        }`}
        actions={
          <div className={styles.actions}>
            <Button
              type="button"
              onClick={refreshAll}
              disabled={isValidating}
              title="Reload accounts and pending approvals"
              className={ACTION_BTN}
            >
              <RefreshCw
                size={14}
                aria-hidden="true"
                className={isValidating ? "animate-spin" : undefined}
              />
              {isValidating ? "Refreshing…" : "Refresh"}
            </Button>
          </div>
        }
      />

      {/* Summary tiles — each one jumps straight to the matching slice. */}
      <div className={styles.summaryGrid}>
        <button
          type="button"
          className={cn(stockStyles.summaryCard, styles.tileButton)}
          onClick={resetFilters}
          title="Show every account"
        >
          <span className={stockStyles.summaryIcon}>
            <Users size={16} aria-hidden="true" />
          </span>
          <span className={stockStyles.summaryBody}>
            <span className={stockStyles.summaryLabel}>All accounts</span>
            <span className={stockStyles.summaryValue}>{totalAccounts}</span>
            <span className={stockStyles.summaryMeta}>
              {counts.admins} administrator{counts.admins === 1 ? "" : "s"} ·{" "}
              {counts.personnel + counts.employees} staff
            </span>
          </span>
        </button>

        <button
          type="button"
          className={cn(stockStyles.summaryCard, styles.tileButton)}
          onClick={() => focusRole("pgso_personnel")}
          title="Show Personnel accounts"
        >
          <span className={stockStyles.summaryIcon}>
            <UserCog size={16} aria-hidden="true" />
          </span>
          <span className={stockStyles.summaryBody}>
            <span className={stockStyles.summaryLabel}>Personnel</span>
            <span className={stockStyles.summaryValue}>{counts.personnel}</span>
            <span className={stockStyles.summaryMeta}>
              Property and supply staff
            </span>
          </span>
        </button>

        <button
          type="button"
          className={cn(stockStyles.summaryCard, styles.tileButton)}
          onClick={() => focusRole("employee")}
          title="Show Employee accounts"
        >
          <span className={stockStyles.summaryIcon}>
            <UserCheck size={16} aria-hidden="true" />
          </span>
          <span className={stockStyles.summaryBody}>
            <span className={stockStyles.summaryLabel}>Employees</span>
            <span className={stockStyles.summaryValue}>{counts.employees}</span>
            <span className={stockStyles.summaryMeta}>
              Self-service request accounts
            </span>
          </span>
        </button>

        <button
          type="button"
          className={cn(stockStyles.summaryCard, styles.tileButton)}
          data-tone={counts.pending > 0 ? "warn" : undefined}
          onClick={openPending}
          title="Review pending approvals"
        >
          <span className={stockStyles.summaryIcon}>
            <Clock3 size={16} aria-hidden="true" />
          </span>
          <span className={stockStyles.summaryBody}>
            <span className={stockStyles.summaryLabel}>Pending approvals</span>
            <span className={stockStyles.summaryValue}>{counts.pending}</span>
            <span className={stockStyles.summaryMeta}>
              {counts.pending > 0
                ? "Waiting for your review"
                : "No accounts waiting"}
            </span>
          </span>
        </button>
      </div>

      {/* View tabs with live counts */}
      <div className={docs.tabsRow}>
        <div className={air.tabs} role="tablist" aria-label="User sections">
          {TABS.map((t) => {
            const count = t.value === "accounts" ? totalAccounts : counts.pending;
            return (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={tab === t.value}
                className={air.tab}
                data-active={tab === t.value}
                onClick={() => setTab(t.value)}
              >
                {t.label}
                <span
                  className={docs.tabCount}
                  data-active={tab === t.value ? "true" : undefined}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {tab === "accounts" ? (
        <Card className={stockStyles.panel}>
          <div className={stockStyles.toolbar}>
            <div className={docs.statChips} aria-live="polite">
              {hasFilters ? (
                <>
                  <span className={docs.statChip}>
                    Showing <strong>{total}</strong> of {totalAccounts}
                  </span>
                  {role !== "all" ? (
                    <span className={docs.statChip} data-tone="info">
                      {ROLE_FILTERS.find((r) => r.value === role)?.label}
                    </span>
                  ) : null}
                  {status !== "all" ? (
                    <span
                      className={docs.statChip}
                      data-tone={status === "active" ? "ok" : undefined}
                    >
                      {label(status)}
                    </span>
                  ) : null}
                </>
              ) : (
                <>
                  <span className={docs.statChip}>
                    <strong>{total}</strong> account{total === 1 ? "" : "s"}
                  </span>
                  <span className={docs.statChip}>
                    <strong>
                      {counts.admins + counts.personnel}
                    </strong>{" "}
                    staff
                  </span>
                </>
              )}
            </div>

            <div className={stockStyles.filters}>
              <div className={styles.searchWrap}>
                <Search size={15} aria-hidden="true" className={styles.searchIcon} />
                <Input
                  type="search"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search name, email, role, office…"
                  className={stockStyles.search}
                  aria-label="Search accounts"
                />
              </div>
              <Select
                value={role}
                onValueChange={(v) => {
                  setRole(v);
                  setPage(1);
                }}
              >
                <SelectTrigger
                  className={stockStyles.accountSelect}
                  aria-label="Filter by role"
                >
                  <SelectValue placeholder="All roles" />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_FILTERS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={status}
                onValueChange={(v) => {
                  setStatus(v);
                  setPage(1);
                }}
              >
                <SelectTrigger
                  className={stockStyles.accountSelect}
                  aria-label="Filter by status"
                >
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_FILTERS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {hasFilters ? (
                <button
                  type="button"
                  className={assetStyles.rowActionMuted}
                  onClick={resetFilters}
                >
                  Clear all
                </button>
              ) : null}
            </div>
          </div>

          {total === 0 ? (
            hasFilters ? (
              <EmptySearchState
                description="Try a different name, email, role, or status."
                onClear={resetFilters}
              />
            ) : (
              <div className={stockStyles.empty}>
                <span className={stockStyles.emptyIcon}>
                  <Users size={20} aria-hidden="true" />
                </span>
                <p className={stockStyles.emptyTitle}>No accounts yet</p>
                <p className={stockStyles.emptyText}>
                  Personnel are added from Dashboard → Add Personnel. Employee
                  and Personnel self-registrations appear in Pending approvals.
                </p>
              </div>
            )
          ) : (
            <div className={stockStyles.tableWrap}>
              <table className={stockStyles.table}>
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
                  {users.map((u) => {
                    const locked = u.role === "super_admin";
                    const office =
                      [u.department, u.office].filter(Boolean).join(" · ") || "—";
                    return (
                      <tr key={u.id}>
                        <td>
                          <div className={styles.accountCell}>
                            <span className={styles.avatar} data-role={u.role}>
                              {initials(u.full_name, u.email)}
                            </span>
                            <span className={styles.accountText}>
                              <span className={styles.accountMain}>
                                {u.full_name ?? "—"}
                              </span>
                              <span className={styles.accountSub}>
                                {u.email ?? "No email on file"}
                              </span>
                            </span>
                          </div>
                        </td>
                        <td>
                          <span
                            className={stockStyles.badge}
                            data-tone={roleTone(u.role)}
                          >
                            {roleLabel(u.role)}
                          </span>
                        </td>
                        <td>
                          <span
                            className={stockStyles.badge}
                            data-tone={statusTone(u.status)}
                          >
                            {label(u.status)}
                          </span>
                        </td>
                        <td>
                          <span className={styles.cellStack}>
                            <span className={styles.cellMain}>{office}</span>
                            {u.position ? (
                              <span className={styles.cellSub}>{u.position}</span>
                            ) : null}
                          </span>
                        </td>
                        <td className={styles.muted}>{fmtDate(u.created_at)}</td>
                        <td className={styles.actionCell}>
                          {locked ? (
                            <span
                              className={stockStyles.badge}
                              data-tone="neutral"
                              title="Administrator accounts cannot be changed here"
                            >
                              <ShieldCheck size={12} aria-hidden="true" />
                              Locked
                            </span>
                          ) : (
                            <ActiveToggle
                              userId={u.id}
                              name={u.full_name ?? u.email ?? "account"}
                              isActive={u.status === "active"}
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
          )}

          {total > 0 ? (
            <div className={stockStyles.footer}>
              <TablePager
                id="admin-users"
                total={total}
                pageSize={PAGE_SIZE}
                page={safePage}
                onPageChange={setPage}
              />
            </div>
          ) : null}
        </Card>
      ) : (
        <Card className={stockStyles.panel}>
          <div className={stockStyles.toolbar}>
            <div className={docs.statChips} aria-live="polite">
              <span className={docs.statChip} data-tone={pending.length > 0 ? "info" : "ok"}>
                <strong>{pending.length}</strong> waiting
              </span>
              <span className={docs.statChip}>
                Verified self-registrations
              </span>
            </div>
            <p className={stockStyles.toolbarInfo}>
              Approving activates the account immediately. Rejecting
              deactivates it.
            </p>
          </div>

          {pending.length === 0 ? (
            <div className={stockStyles.empty}>
              <span className={stockStyles.emptyIcon}>
                <CheckCircle2 size={20} aria-hidden="true" />
              </span>
              <p className={stockStyles.emptyTitle}>You&apos;re all caught up</p>
              <p className={stockStyles.emptyText}>
                New employee and personnel registrations will appear here for
                review. Approve them to let them sign in.
              </p>
            </div>
          ) : (
            <div className={stockStyles.tableWrap}>
              <table className={stockStyles.table}>
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Role</th>
                    <th>Registered</th>
                    <th style={{ textAlign: "right" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div className={styles.accountCell}>
                          <span className={styles.avatar} data-role={u.role}>
                            {initials(u.full_name, u.email)}
                          </span>
                          <span className={styles.accountText}>
                            <span className={styles.accountMain}>
                              {u.full_name ?? "—"}
                            </span>
                            <span className={styles.accountSub}>
                              {u.email ?? "No email on file"}
                            </span>
                          </span>
                        </div>
                      </td>
                      <td>
                        <span
                          className={stockStyles.badge}
                          data-tone={roleTone(u.role)}
                        >
                          {roleLabel(u.role)}
                        </span>
                      </td>
                      <td className={styles.muted}>{fmtDate(u.created_at)}</td>
                      <td className={styles.actionCell}>
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

          <div className={stockStyles.footer}>
            <span className={stockStyles.footerInfo}>
              {pending.length === 0
                ? "No accounts waiting for approval"
                : `${pending.length} account${pending.length === 1 ? "" : "s"} waiting`}
            </span>
            <Link
              href="/super-admin/dashboard"
              className={assetStyles.rowActionMuted}
            >
              Add personnel from Dashboard
            </Link>
          </div>
        </Card>
      )}
    </section>
  );
}
