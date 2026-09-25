"use client";

import { useCallback, useMemo, useState } from "react";
import { getCompletedRequestIssues, getIssueFilterOptions, getPublicIssuesPage } from "./actions";
import { IssuesTable } from "./issues-table";
import { Card } from "@/components/ui/card";
import { RequestQrButton } from "@/components/personnel/RequestQrButton";
import { TablePager, FIXED_PAGE_SIZE } from "@/components/personnel/TablePager";
import { requestTypeLabel } from "@/app/personnel/requests/request-types";
import { useCachedAction } from "@/hooks/use-cached-action";
import { CLIENT_CACHE_KEYS } from "@/lib/client-cache";
import IssuesLoading from "./loading";
import styles from "../dashboard/page.module.css";

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

// Fixed 20 rows for the completed-requests section (no selector).
const COMPLETED_PAGE_SIZE = FIXED_PAGE_SIZE;

export default function PersonnelIssuesPage() {
  // Server-driven filters (reported up by the table, debounced there).
  const [filters, setFilters] = useState({ q: "", docType: "all", assetType: "all" });
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
  // Fixed 20 documents/page (no selector) — the DB returns only this window.
  const [page, setPage] = useState(1);
  const [completedPage, setCompletedPage] = useState(1);

  // Server-paged issued lines: 20 documents per fetch, QR generated only
  // for this window instead of the whole registry.
  const { data: paged, loading, isValidating } = useCachedAction(
    `${CLIENT_CACHE_KEYS.issues}:${page}:${filters.q}:${filters.docType}:${filters.assetType}`,
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
    `${CLIENT_CACHE_KEYS.issues}-type-options`,
    getIssueFilterOptions,
    { staleTime: 300_000 }
  );

  const { data: completedData } = useCachedAction(
    `${CLIENT_CACHE_KEYS.issues}-completed`,
    getCompletedRequestIssues,
    { staleTime: 60_000 }
  );
  const completed = useMemo(() => completedData ?? [], [completedData]);
  const completedPageCount = Math.max(1, Math.ceil(completed.length / COMPLETED_PAGE_SIZE));
  const completedSafePage = Math.min(Math.max(1, completedPage), completedPageCount);
  const completedVisible = completed.slice(
    (completedSafePage - 1) * COMPLETED_PAGE_SIZE,
    (completedSafePage - 1) * COMPLETED_PAGE_SIZE + COMPLETED_PAGE_SIZE
  );

  if (loading) {
    return <IssuesLoading />;
  }

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Personnel / Issues</p>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Issues</h1>
          <p className={styles.subtitle}>
            {totalDocs} {totalDocs === 1 ? "issued document" : "issued documents"} · assets
            and stock issued to employees · costs excluded
            {completed.length > 0
              ? ` · ${completed.length} completed ${completed.length === 1 ? "request" : "requests"}`
              : ""}
            {isValidating ? " · updating…" : ""}
          </p>
        </div>
      </div>
      <Card className={styles.panel}>
        <p className={styles.panelSub}>
          Each row is one issued asset/stock line: receiving employee, account
          code, article, account title, asset type, and quantity — with its own
          QR record. No cost, supplier, or account-number data is shown or
          encoded.
        </p>
        <IssuesTable
          rows={rows}
          serverTypeOptions={typeOptions ?? []}
          onFiltersChange={handleFiltersChange}
        />
        {totalDocs > 0 ? (
          <TablePager
            id="issues"
            total={totalDocs}
            page={page}
            onPageChange={setPage}
          />
        ) : null}
      </Card>
      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>Completed request QR records</h2>
        <p className={styles.panelSub}>
          Completed transfers, assignments, repairs, and stock replenishments
          you actioned — each with its own QR record (quantity + transfer
          parties included).
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
                  <td colSpan={6} className={styles.emptyState}>
                    No completed requests you actioned yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {completed.length > COMPLETED_PAGE_SIZE ? (
          <TablePager
            id="issues-completed"
            total={completed.length}
            page={completedSafePage}
            onPageChange={setCompletedPage}
          />
        ) : null}
      </Card>
    </section>
  );
}
