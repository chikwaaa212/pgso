"use client";

import { useMemo, useState } from "react";
import {
  ClipboardCheck,
  FileText,
  Layers,
  PackageSearch,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import {
  getCompletedRequestIssues,
  getPublicIssuesPage,
} from "@/app/personnel/issues/actions";
import { IssuesTable } from "@/app/personnel/issues/issues-table";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/personnel/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RequestQrButton } from "@/components/personnel/RequestQrButton";
import { TablePager, FIXED_PAGE_SIZE } from "@/components/personnel/TablePager";
import { EmptySearchState } from "@/components/personnel/EmptySearchState";
import { IssuanceEvaluateDialog } from "@/components/personnel/IssuanceDialog";
import { requestTypeLabel } from "@/app/personnel/requests/request-types";
import { useCachedAction } from "@/hooks/use-cached-action";
import { buildQueryKey } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import IssuesLoading from "./loading";
import styles from "@/app/personnel/dashboard/page.module.css";
import stockStyles from "@/app/personnel/stocks/page.module.css";
import air from "@/app/personnel/inspections/air-section.module.css";
import assetStyles from "@/app/personnel/assets/page.module.css";
import docs from "@/app/personnel/issues/page.module.css";

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

/** Yellow 24px action buttons — same treatment as Assets / Inspections. */
const ACTION_BTN = cn(
  "h-6 gap-1.5 rounded-[4px] border border-yellow-500 bg-yellow-500 px-3 text-xs font-semibold",
  "text-navy-900 opacity-[0.85] transition-colors hover:bg-yellow-400 hover:text-navy-900 hover:opacity-100 disabled:opacity-40"
);

// Fixed 10 rows for the completed-requests section (no selector).
const COMPLETED_PAGE_SIZE = FIXED_PAGE_SIZE;

/** One read of the issued window; search / filters / paging stay local. */
const ISSUES_WINDOW = 200;

const VIEW_TABS = [
  { value: "issued", label: "Issued items" },
  { value: "completed", label: "Completed requests" },
] as const;

type IssuesView = (typeof VIEW_TABS)[number]["value"];

function requestTone(type: string | null) {
  if (type === "transfer") return "info";
  if (type === "new_assignment") return "ok";
  if (type === "repair") return "warn";
  return "neutral";
}

export default function SuperAdminIssuesPage() {
  const [completedPage, setCompletedPage] = useState(1);
  const [view, setView] = useState<IssuesView>("issued");
  const [completedQuery, setCompletedQuery] = useState("");
  const [issuanceOpen, setIssuanceOpen] = useState(false);

  // One read of the issued window — the table filters, counts, and pages this
  // in memory so typing never refetches and results never lag a keystroke.
  // Super Admin scope is global, so the window spans every issuer.
  const {
    data: paged,
    loading,
    isValidating,
    refresh: refreshIssued,
  } = useCachedAction(
    buildQueryKey({
      module: 'super-admin',
      resource: 'issues',
      page: 1,
      pageSize: ISSUES_WINDOW,
      filters: { scope: 'window' },
    }),
    () => getPublicIssuesPage({ page: 1, pageSize: ISSUES_WINDOW }),
    { staleTime: 60_000 }
  );
  const rows = useMemo(() => paged?.rows ?? [], [paged]);
  const totalDocs = paged?.total ?? 0;

  const {
    data: completedData,
    refresh: refreshCompleted,
  } = useCachedAction(
    buildQueryKey({ module: 'super-admin', resource: 'issues-completed' }),
    getCompletedRequestIssues,
    { staleTime: 60_000 }
  );
  const completed = useMemo(() => completedData ?? [], [completedData]);

  // Window stats — documents group the expanded lines back together.
  const stats = useMemo(() => {
    const docIds = new Set<string>();
    let par = 0;
    let ics = 0;
    let units = 0;
    for (const r of rows) {
      docIds.add(r.issuance_id);
      if (r.doc_type === "PAR") par += 1;
      else if (r.doc_type === "ICS") ics += 1;
      units += Number(r.quantity) || 0;
    }
    const employees = new Set(rows.map((r) => r.employee_name));
    return { docs: docIds.size, par, ics, units, employees: employees.size };
  }, [rows]);

  const filteredCompleted = useMemo(() => {
    const needle = completedQuery.trim().toLowerCase();
    if (!needle) return completed;
    return completed.filter((r) => {
      const qty = (r.lines ?? []).reduce((sum, l) => sum + (l.quantity || 0), 0);
      return [
        requestTypeLabel(r.request_type),
        r.employee_name,
        r.asset_label,
        r.recipient_name,
        fmtDate(r.date_resolved),
        String(qty),
      ].some((v) => v != null && v.toLowerCase().includes(needle));
    });
  }, [completed, completedQuery]);

  const completedPageCount = Math.max(
    1,
    Math.ceil(filteredCompleted.length / COMPLETED_PAGE_SIZE)
  );
  const completedSafePage = Math.min(Math.max(1, completedPage), completedPageCount);
  const completedVisible = filteredCompleted.slice(
    (completedSafePage - 1) * COMPLETED_PAGE_SIZE,
    (completedSafePage - 1) * COMPLETED_PAGE_SIZE + COMPLETED_PAGE_SIZE
  );

  const refreshAll = () => {
    refreshIssued();
    refreshCompleted();
  };

  if (loading) {
    return <IssuesLoading />;
  }

  return (
    <section className={styles.section}>
      <PageHeader
        eyebrow="Accountability"
        title="Issues"
        subtitle="Assets and stock issued to employees — each line is verifiable by its own QR record, with costs excluded."
        meta={`${totalDocs.toLocaleString("en-PH")} issued document${
          totalDocs === 1 ? "" : "s"
        } · ${rows.length.toLocaleString("en-PH")} line${
          rows.length === 1 ? "" : "s"
        }`}
        actions={
          <div className={styles.actions}>
            <Button
              type="button"
              onClick={() => setIssuanceOpen(true)}
              title="Issue an asset or stock item directly, without a request"
              className={ACTION_BTN}
            >
              <Plus size={14} aria-hidden="true" />
              Issue item
            </Button>
            <Button
              type="button"
              onClick={refreshAll}
              disabled={isValidating}
              title="Reload issued items and completed requests"
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

      {/* Summary tiles */}
      <div className={stockStyles.summary}>
        <div className={stockStyles.summaryCard}>
          <span className={stockStyles.summaryIcon}>
            <FileText size={16} aria-hidden="true" />
          </span>
          <div className={stockStyles.summaryBody}>
            <p className={stockStyles.summaryLabel}>Issued documents</p>
            <p className={stockStyles.summaryValue}>{totalDocs}</p>
            <p className={stockStyles.summaryMeta}>
              PAR / ICS records with QR proof
            </p>
          </div>
        </div>

        <div className={stockStyles.summaryCard}>
          <span className={stockStyles.summaryIcon}>
            <Layers size={16} aria-hidden="true" />
          </span>
          <div className={stockStyles.summaryBody}>
            <p className={stockStyles.summaryLabel}>Issued lines</p>
            <p className={stockStyles.summaryValue}>{rows.length}</p>
            <p className={stockStyles.summaryMeta}>
              {stats.units} unit{stats.units === 1 ? "" : "s"} ·{" "}
              {stats.employees} employee{stats.employees === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        <div className={stockStyles.summaryCard}>
          <span className={stockStyles.summaryIcon}>
            <ClipboardCheck size={16} aria-hidden="true" />
          </span>
          <div className={stockStyles.summaryBody}>
            <p className={stockStyles.summaryLabel}>Completed requests</p>
            <p className={stockStyles.summaryValue}>{completed.length}</p>
            <p className={stockStyles.summaryMeta}>
              Transfers, assignments, repairs, replenishments
            </p>
          </div>
        </div>
      </div>

      {/* View tabs with live counts */}
      <div className={docs.tabsRow}>
        <div className={air.tabs} role="tablist" aria-label="Issue records">
          {VIEW_TABS.map((t) => {
            const count = t.value === "issued" ? totalDocs : completed.length;
            return (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={view === t.value}
                className={air.tab}
                data-active={view === t.value}
                onClick={() => setView(t.value)}
              >
                {t.label}
                <span
                  className={docs.tabCount}
                  data-active={view === t.value ? "true" : undefined}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {view === "issued" ? (
        <Card className={stockStyles.panel}>
          <IssuesTable
            rows={rows}
            showLoggedBy
            paginate
            totalDocuments={totalDocs}
          />
        </Card>
      ) : (
        <Card className={stockStyles.panel}>
          <div className={stockStyles.toolbar}>
            <div className={docs.chips} aria-live="polite">
              <span className={docs.chip}>
                <strong>{completed.length}</strong> completed
              </span>
              {completedQuery.trim() !== "" ? (
                <span className={docs.chip} data-tone="info">
                  Showing <strong>{filteredCompleted.length}</strong>
                </span>
              ) : null}
            </div>
            <div className={stockStyles.filters}>
              <div className={docs.searchWrap}>
                <Search size={15} aria-hidden="true" className={docs.searchIcon} />
                <Input
                  type="search"
                  value={completedQuery}
                  onChange={(e) => {
                    setCompletedQuery(e.target.value);
                    setCompletedPage(1);
                  }}
                  placeholder="Search employee, item, type…"
                  className={cn(stockStyles.search, docs.search)}
                  aria-label="Search completed requests"
                />
              </div>
              {completedQuery.trim() !== "" ? (
                <button
                  type="button"
                  className={assetStyles.rowActionMuted}
                  onClick={() => {
                    setCompletedQuery("");
                    setCompletedPage(1);
                  }}
                >
                  Clear
                </button>
              ) : null}
            </div>
          </div>

          {filteredCompleted.length === 0 ? (
            completed.length === 0 ? (
              <div className={stockStyles.empty}>
                <span className={stockStyles.emptyIcon}>
                  <PackageSearch size={20} aria-hidden="true" />
                </span>
                <p className={stockStyles.emptyTitle}>No completed requests yet</p>
                <p className={stockStyles.emptyText}>
                  Transfers, assignments, repairs, and stock replenishments
                  actioned across all personnel appear here with their QR record.
                </p>
              </div>
            ) : (
              <EmptySearchState
                title="No completed requests match these filters"
                description="Try a different employee, item, or request type."
                onClear={() => {
                  setCompletedQuery("");
                  setCompletedPage(1);
                }}
              />
            )
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Employee</th>
                    <th>Item</th>
                    <th className={docs.num}>Qty</th>
                    <th>Resolved</th>
                    <th style={{ textAlign: "right" }}>QR record</th>
                  </tr>
                </thead>
                <tbody>
                  {completedVisible.map((r) => {
                    const qty = (r.lines ?? []).reduce(
                      (sum, l) => sum + (l.quantity || 0),
                      0
                    );
                    return (
                      <tr key={r.id} className={docs.bodyRow}>
                        <td>
                          <span
                            className={stockStyles.badge}
                            data-tone={requestTone(r.request_type)}
                          >
                            {requestTypeLabel(r.request_type)}
                          </span>
                        </td>
                        <td>{r.employee_name}</td>
                        <td>
                          <span className={docs.cellMain}>{r.asset_label ?? "—"}</span>
                          {r.recipient_name ? (
                            <span className={docs.cellSub}>
                              Handled by {r.recipient_name}
                            </span>
                          ) : null}
                        </td>
                        <td className={docs.num}>{qty > 0 ? qty : "—"}</td>
                        <td>{fmtDate(r.date_resolved)}</td>
                        <td className={docs.actionCell}>
                          <RequestQrButton requestId={r.id} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className={stockStyles.footer}>
            {filteredCompleted.length > COMPLETED_PAGE_SIZE ? (
              <TablePager
                id="admin-issues-completed"
                total={filteredCompleted.length}
                page={completedSafePage}
                onPageChange={setCompletedPage}
              />
            ) : (
              <span className={stockStyles.footerInfo}>
                Showing all {filteredCompleted.length} request
                {filteredCompleted.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </Card>
      )}

      {issuanceOpen ? (
        <IssuanceEvaluateDialog
          key="admin-direct-issue"
          open={issuanceOpen}
          onOpenChange={setIssuanceOpen}
          mode="direct"
          onSuccess={() => {
            setIssuanceOpen(false);
            refreshAll();
          }}
        />
      ) : null}
    </section>
  );
}
