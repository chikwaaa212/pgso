'use client';

import { useMemo, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import {
  Eye,
  FileCheck2,
  FileText,
  PackageSearch,
  ScrollText,
  TriangleAlert,
} from "lucide-react";
import {
  getIssuance,
  getIssuancesPage,
  type IssuanceDetail,
} from "./actions";
import { PAGE_SIZE } from "@/lib/constants";
import { Pagination } from "@/components/ui/pagination";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/personnel/PageHeader";
import { EmptySearchState } from "@/components/personnel/EmptySearchState";
import { ReceiptLoading } from "@/components/personnel/ReceiptLoading";
import { useCachedAction } from "@/hooks/use-cached-action";
import { useReceipt } from "@/hooks/use-receipt";
import { buildQueryKey } from "@/lib/query-keys";
import { ReceiptOverlay } from "../documents/receipt-overlay";
import { ParReportSheet } from "../documents/par-report";
import { IcsReportSheet } from "../documents/ics-report";
import receipt from "../inspections/components/receipt.module.css";
import IssuancesLoading, { IssuancesTableSkeleton } from "./loading";
import styles from "../dashboard/page.module.css";
import stockStyles from "../stocks/page.module.css";
import assetStyles from "../assets/page.module.css";
import air from "../inspections/air-section.module.css";
import docs from "./page.module.css";

/** Load the whole owned window once; search, type tabs, and paging stay local. */
const FETCH_LIMIT = 1000;

const DOC_TABS = [
  { value: "all", label: "All" },
  { value: "PAR", label: "PAR" },
  { value: "ICS", label: "ICS" },
] as const;

type DocTab = (typeof DOC_TABS)[number]["value"];

function fmt(iso: string | null | undefined) {
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

function peso(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(n);
}

function docTone(docType: string) {
  return docType === "PAR" ? "ok" : "info";
}

/** Row click (or Enter/Space) opens the report overlay. */
function rowOpenProps(onOpen: () => void) {
  return {
    role: "button",
    tabIndex: 0,
    title: "Open this report",
    onClick: onOpen,
    onKeyDown: (event: KeyboardEvent<HTMLTableRowElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onOpen();
      }
    },
  } as const;
}

export default function PersonnelIssuancesPage() {
  const [query, setQuery] = useState("");
  const [docTab, setDocTab] = useState<DocTab>("all");
  const [view, setView] = useState<"table" | "grid">("table");
  const [page, setPage] = useState(1);
  const pageSize = PAGE_SIZE;

  // One read of the owned window — local filtering is instant and never
  // fires a query per keystroke (same behaviour as the Assets registry).
  const {
    data: paged,
    loading,
    isValidating,
    error,
  } = useCachedAction(
    buildQueryKey({
      module: 'personnel',
      resource: 'issuances',
      page: 1,
      pageSize: FETCH_LIMIT,
      filters: { scope: 'all' },
    }),
    () =>
      getIssuancesPage({
        page: 1,
        pageSize: FETCH_LIMIT,
        q: "",
        docType: "all",
      }),
    { staleTime: 30_000 }
  );

  // Overlay receipt viewer with per-record client caching (shared with the
  // documents page) — viewing a report opens a modal, not a new page.
  const viewer = useReceipt<IssuanceDetail | null>();
  const openReceipt = (id: string) =>
    viewer.open(id, `issuance:${id}`, () => getIssuance(id));

  const rows = useMemo(() => paged?.rows ?? [], [paged]);

  const counts = useMemo(() => {
    let par = 0;
    let ics = 0;
    for (const r of rows) {
      if (r.doc_type === "PAR") par += 1;
      else if (r.doc_type === "ICS") ics += 1;
    }
    return { all: rows.length, par, ics };
  }, [rows]);

  // Document-type tab first, then the instant text search over the window.
  const scopedRows = useMemo(
    () =>
      docTab === "all"
        ? rows
        : rows.filter((r) => r.doc_type === docTab),
    [rows, docTab]
  );
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return scopedRows;
    return scopedRows.filter((r) =>
      [
        r.doc_no,
        r.doc_type,
        r.employee_name,
        r.item_label,
        fmt(r.doc_date),
        peso(r.total_amount),
      ].some((v) => v != null && v.toLowerCase().includes(needle))
    );
  }, [scopedRows, query]);

  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const visible = filtered.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize
  );

  const hasFilters = query.trim() !== "" || docTab !== "all";

  const resetPage = () => setPage(1);
  const clearFilters = () => {
    setQuery("");
    setDocTab("all");
    resetPage();
  };

  // Cold start paints the full route skeleton; in-flight refreshes keep the
  // header, summary, tabs, and search mounted and skeletonize only the table.
  if (loading && rows.length === 0) {
    return <IssuancesLoading />;
  }

  const fetching = loading || isValidating;
  const doc = viewer.doc ?? null;
  const isIcs = doc?.doc_type === "ICS";

  return (
    <section className={styles.section}>
      <PageHeader
        eyebrow="Accountability documents"
        title="PAR / ICS issuances"
        subtitle="Signed property documents you issued · value over ₱50,000 → PAR, ₱50,000 or less → ICS"
        meta={`${counts.all.toLocaleString("en-PH")} document${
          counts.all === 1 ? "" : "s"
        } in your window`}
        actions={
          <div className={air.tabs} role="group" aria-label="Change layout">
            {(["table", "grid"] as const).map((v) => (
              <button
                key={v}
                type="button"
                className={air.tab}
                data-active={view === v}
                aria-pressed={view === v}
                onClick={() => setView(v)}
              >
                {v === "table" ? "Table" : "Grid"}
              </button>
            ))}
          </div>
        }
      />

      {/* Summary tiles */}
      <div className={stockStyles.summary}>
        <div className={stockStyles.summaryCard}>
          <span className={stockStyles.summaryIcon}>
            <ScrollText size={16} aria-hidden="true" />
          </span>
          <div className={stockStyles.summaryBody}>
            <p className={stockStyles.summaryLabel}>Total issuances</p>
            <p className={stockStyles.summaryValue}>{counts.all}</p>
            <p className={stockStyles.summaryMeta}>
              PAR + ICS records in your window
            </p>
          </div>
        </div>

        <div className={stockStyles.summaryCard}>
          <span className={stockStyles.summaryIcon}>
            <FileText size={16} aria-hidden="true" />
          </span>
          <div className={stockStyles.summaryBody}>
            <p className={stockStyles.summaryLabel}>PAR</p>
            <p className={stockStyles.summaryValue}>{counts.par}</p>
            <p className={stockStyles.summaryMeta}>Value over ₱50,000</p>
          </div>
        </div>

        <div className={stockStyles.summaryCard}>
          <span className={stockStyles.summaryIcon}>
            <FileCheck2 size={16} aria-hidden="true" />
          </span>
          <div className={stockStyles.summaryBody}>
            <p className={stockStyles.summaryLabel}>ICS</p>
            <p className={stockStyles.summaryValue}>{counts.ics}</p>
            <p className={stockStyles.summaryMeta}>₱50,000 or less</p>
          </div>
        </div>
      </div>

      {/* Type tabs with live counts */}
      <div className={docs.tabsRow}>
        <div className={air.tabs} role="tablist" aria-label="Filter by document type">
          {DOC_TABS.map((t) => {
            const countKey =
              t.value === "all" ? "all" : t.value === "PAR" ? "par" : "ics";
            return (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={docTab === t.value}
                className={air.tab}
                data-active={docTab === t.value}
                onClick={() => {
                  setDocTab(t.value);
                  resetPage();
                }}
              >
                {t.label}
                <span
                  className={docs.tabCount}
                  data-active={docTab === t.value ? "true" : undefined}
                >
                  {counts[countKey]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <Card className={stockStyles.panel}>
        <div className={stockStyles.toolbar}>
          <div
            className={docs.statChips}
            aria-live="polite"
            aria-busy={fetching || undefined}
          >
            {fetching ? (
              <span
                role="status"
                aria-label="Loading issuances"
                className="block h-3.5 w-44 animate-pulse rounded bg-navy-100"
              />
            ) : hasFilters ? (
              <>
                <span className={docs.statChip}>
                  Showing <strong>{total}</strong> of {counts.all}{" "}
                  {counts.all === 1 ? "record" : "records"}
                </span>
                {docTab !== "all" ? (
                  <span className={docs.statChip} data-tone="info">
                    {docTab} only
                  </span>
                ) : null}
              </>
            ) : (
              <>
                <span className={docs.statChip}>
                  <strong>{counts.all}</strong>{" "}
                  {counts.all === 1 ? "record" : "records"}
                </span>
                <span className={docs.statChip} data-tone="ok">
                  PAR <strong>{counts.par}</strong>
                </span>
                <span className={docs.statChip} data-tone="info">
                  ICS <strong>{counts.ics}</strong>
                </span>
              </>
            )}
            {!fetching && paged && paged.total > rows.length ? (
              <span className={docs.statChip}>first {rows.length} loaded</span>
            ) : null}
          </div>

          <div className={stockStyles.filters}>
            <Input
              type="search"
              value={query}
              onChange={(e) => {
                // Local filter only — the window is already loaded, so
                // results update on the same keystroke with no fetch.
                setQuery(e.target.value);
                resetPage();
              }}
              placeholder="Search no., employee, item…"
              className={stockStyles.search}
              aria-label="Search issuances"
            />
            {hasFilters ? (
              <button
                type="button"
                className={assetStyles.rowAction}
                onClick={clearFilters}
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>

        {error && !fetching ? (
          <div className={stockStyles.empty} role="alert">
            <span className={stockStyles.emptyIcon}>
              <TriangleAlert size={20} aria-hidden="true" />
            </span>
            <p className={stockStyles.emptyTitle}>Could not load issuances</p>
            <p className={stockStyles.emptyText}>
              The issuance service did not respond. Refresh the page to try
              again.
            </p>
          </div>
        ) : fetching ? (
          <IssuancesTableSkeleton />
        ) : total === 0 ? (
          hasFilters ? (
            <EmptySearchState
              description="Try a different search term or document type."
              onClear={clearFilters}
            />
          ) : (
            <div className={stockStyles.empty}>
              <span className={stockStyles.emptyIcon}>
                <PackageSearch size={20} aria-hidden="true" />
              </span>
              <p className={stockStyles.emptyTitle}>No PAR/ICS records yet</p>
              <p className={stockStyles.emptyText}>
                Issue an item from Assets or approve a new-assignment request
                — the signed PAR or ICS appears here automatically.
              </p>
            </div>
          )
        ) : (
          <>
            {view === "table" ? (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Doc</th>
                      <th>No.</th>
                      <th>Employee</th>
                      <th>Item</th>
                      <th className={docs.num}>Qty</th>
                      <th className={docs.num}>Total</th>
                      <th>Date</th>
                      <th style={{ textAlign: "right" }}>Report</th>
                      <th style={{ textAlign: "right" }}>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((r, i) => (
                      <tr
                        key={`${r.id}-${i}`}
                        className={docs.clickableRow}
                        {...rowOpenProps(() => openReceipt(r.id))}
                      >
                        <td>
                          <span
                            className={stockStyles.badge}
                            data-tone={docTone(r.doc_type)}
                          >
                            {r.doc_type}
                          </span>
                        </td>
                        <td>
                          {r.doc_no ? (
                            <span className={docs.mono}>{r.doc_no}</span>
                          ) : (
                            <span className={docs.muted}>—</span>
                          )}
                        </td>
                        <td>{r.employee_name}</td>
                        <td>
                          <span className={docs.cellMain}>{r.item_label}</span>
                        </td>
                        <td className={docs.num}>{r.quantity}</td>
                        <td className={docs.num}>{peso(r.total_amount)}</td>
                        <td>{fmt(r.doc_date)}</td>
                        <td
                          className={docs.actionCell}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className={assetStyles.rowAction}
                            onClick={() => openReceipt(r.id)}
                          >
                            <Eye size={14} aria-hidden="true" />
                            View {r.doc_type}
                          </button>
                        </td>
                        <td
                          className={docs.actionCell}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <Link
                            href={`/personnel/issuances/${r.id}`}
                            className={assetStyles.rowActionMuted}
                          >
                            Open
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className={air.grid}>
                {visible.map((r, i) => (
                  <article key={`${r.id}-${i}`} className={air.card}>
                    <div className={air.cardTop}>
                      <span className={air.ref}>
                        {r.doc_no ?? r.doc_type}
                      </span>
                      <span className={air.chips}>
                        <span
                          className={stockStyles.badge}
                          data-tone={docTone(r.doc_type)}
                        >
                          {r.doc_type}
                        </span>
                      </span>
                    </div>
                    <dl className={air.meta}>
                      <div>
                        <dt>Employee</dt>
                        <dd>{r.employee_name}</dd>
                      </div>
                      <div>
                        <dt>Date</dt>
                        <dd>{fmt(r.doc_date)}</dd>
                      </div>
                      <div>
                        <dt>Quantity</dt>
                        <dd>{r.quantity}</dd>
                      </div>
                      <div>
                        <dt>Total</dt>
                        <dd>{peso(r.total_amount)}</dd>
                      </div>
                      <div className={air.metaFull}>
                        <dt>Item</dt>
                        <dd>{r.item_label}</dd>
                      </div>
                    </dl>
                    <div className={air.actions}>
                      <button
                        type="button"
                        className={assetStyles.rowAction}
                        onClick={() => openReceipt(r.id)}
                      >
                        <Eye size={14} aria-hidden="true" />
                        View {r.doc_type}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}

            <div className={stockStyles.footer}>
              {total > pageSize ? (
                <Pagination
                  total={total}
                  page={safePage}
                  onPageChange={setPage}
                  id="issuances"
                />
              ) : (
                <span className={stockStyles.footerInfo}>
                  Showing all {total} {total === 1 ? "record" : "records"}
                </span>
              )}
            </div>
          </>
        )}
      </Card>

      <ReceiptOverlay
        open={viewer.selectedId !== null}
        title={
          isIcs ? "Inventory Custodian Slip" : "Property Acknowledgment Receipt"
        }
        onClose={viewer.close}
        printable={!viewer.docLoading && !!doc}
      >
        {viewer.docLoading ? (
          <ReceiptLoading label="Loading report…" />
        ) : !doc ? (
          <div className={stockStyles.empty}>
            <p className={stockStyles.emptyText}>
              This record is no longer available.
            </p>
          </div>
        ) : (
          <div className={receipt.receiptStack} style={{ maxWidth: "none" }}>
            {isIcs ? (
              <IcsReportSheet issuance={doc} />
            ) : (
              <ParReportSheet issuance={doc} />
            )}
            <p className={stockStyles.toolbarInfo}>
              <Link
                href={`/personnel/issuances/${doc.id}`}
                className={assetStyles.rowActionMuted}
              >
                Open full report
              </Link>{" "}
              ·{" "}
              <a
                href={`/api/personnel/issuances/${doc.id}/${isIcs ? "ics-xlsx" : "par-xlsx"}`}
                className={assetStyles.rowActionMuted}
              >
                Download Excel
              </a>
            </p>
          </div>
        )}
      </ReceiptOverlay>
    </section>
  );
}
