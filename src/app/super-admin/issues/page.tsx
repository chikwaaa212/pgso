"use client";

import { useCallback, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { getCompletedRequestIssues, getIssueFilterOptions, getPublicIssuesPage } from "@/app/personnel/issues/actions";
import { IssuesTable } from "@/app/personnel/issues/issues-table";
import { RequestQrButton } from "@/components/personnel/RequestQrButton";
import { TablePager, FIXED_PAGE_SIZE } from "@/components/personnel/TablePager";
import { requestTypeLabel } from "@/app/personnel/requests/request-types";
import { useCachedAction } from "@/hooks/use-cached-action";
import { buildQueryKey } from "@/lib/query-keys";
import IssuesLoading from "./loading";
import styles from "./page.module.css";

function fmtDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  });
}

export default function SuperAdminIssuesPage() {
  // Server-driven filters (reported up by the table, debounced there).
  const [filters, setFilters] = useState({ q: "", docType: "all", assetType: "all" });
  // Fixed 20 documents/page (no selector) — the DB returns only this window
  // (super_admin scope is global). Same pattern as the personnel page.
  const [page, setPage] = useState(1);
  const [completedPage, setCompletedPage] = useState(1);
  // Stable handler — shallow-equal guard breaks the report→render→report loop.
  const handleFiltersChange = useCallback(
    (f: { q: string; docType: string; assetType: string }) => {
      setFilters((prev) =>
        prev.q === f.q && prev.docType === f.docType && prev.assetType === f.assetType
          ? prev
          : f
      );
      setPage(1);
    },
    []
  );
  const { data: paged, loading, isValidating } = useCachedAction(
    buildQueryKey({
      module: 'super-admin',
      resource: 'issues',
      page,
      pageSize: 20,
      filters: { q: filters.q, docType: filters.docType, assetType: filters.assetType },
    }),
    () =>
      getPublicIssuesPage({
        page,
        q: filters.q,
        docType: filters.docType,
        assetType: filters.assetType,
      }),
    { staleTime: 60_000 }
  );
  const rows = useMemo(() => paged?.rows ?? [], [paged]);
  const totalDocs = paged?.total ?? 0;

  const { data: typeOptions } = useCachedAction(
    buildQueryKey({ module: 'super-admin', resource: 'issues-type-options' }),
    getIssueFilterOptions,
    { staleTime: 300_000 }
  );

  const { data: completedData } = useCachedAction(
    buildQueryKey({ module: 'super-admin', resource: 'issues-completed' }),
    getCompletedRequestIssues,
    { staleTime: 60_000 }
  );
  const completed = useMemo(() => completedData ?? [], [completedData]);
  const completedPageCount = Math.max(1, Math.ceil(completed.length / FIXED_PAGE_SIZE));
  const completedSafePage = Math.min(Math.max(1, completedPage), completedPageCount);
  const completedVisible = completed.slice(
    (completedSafePage - 1) * FIXED_PAGE_SIZE,
    (completedSafePage - 1) * FIXED_PAGE_SIZE + FIXED_PAGE_SIZE
  );

  if (loading && rows.length === 0) {
    return <IssuesLoading />;
  }

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Super Admin / Issues</p>
      <div>
        <h1 className={styles.title}>Issues</h1>
        <p className={styles.subtitle}>
          {totalDocs} {totalDocs === 1 ? "issued document" : "issued documents"} · assets
          and stock issued to employees · read-only
          {completed.length > 0
            ? ` · ${completed.length} completed ${completed.length === 1 ? "request" : "requests"}`
            : ""}
          {isValidating ? (
            <span role="status" aria-live="polite"> · Updating…</span>
          ) : null}
        </p>
      </div>
      <Card className={styles.panel}>
        <IssuesTable
          rows={rows}
          showLoggedBy
          serverTypeOptions={typeOptions ?? []}
          onFiltersChange={handleFiltersChange}
        />
        {totalDocs > 0 ? (
          <TablePager
            id="admin-issues"
            total={totalDocs}
            page={page}
            onPageChange={setPage}
          />
        ) : null}
      </Card>
      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>Completed request QR records</h2>
        <p className={styles.panelSub}>
          All completed requests — transfers, assignments, repairs, and stock
          replenishments from the asset page and the request queue — each with
          its own QR record.
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Type</th>
                <th>Employee</th>
                <th>Item</th>
                <th>Qty</th>
                <th>Resolved</th>
                <th>QR record</th>
              </tr>
            </thead>
            <tbody>
              {completedVisible.map((r) => {
                const qty = (r.lines ?? []).reduce(
                  (sum, l) => sum + (l.quantity || 0),
                  0
                );
                return (
                  <tr key={r.id}>
                    <td>{requestTypeLabel(r.request_type)}</td>
                    <td>{r.employee_name}</td>
                    <td>{r.asset_label ?? "—"}</td>
                    <td>{qty > 0 ? qty : "—"}</td>
                    <td>{fmtDate(r.date_resolved)}</td>
                    <td>
                      <RequestQrButton requestId={r.id} />
                    </td>
                  </tr>
                );
              })}
              {completed.length === 0 && (
                <tr>
                  <td colSpan={6} className={styles.empty}>
                    No completed requests yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {completed.length > FIXED_PAGE_SIZE ? (
          <TablePager
            id="admin-issues-completed"
            total={completed.length}
            page={completedSafePage}
            onPageChange={setCompletedPage}
          />
        ) : null}
      </Card>
    </section>
  );
}
