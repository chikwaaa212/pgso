'use client';

import { useState } from "react";
import Link from "next/link";
import { getIssuance, getIssuancesPage, type IssuanceDetail } from "./actions";
import { TablePager, FIXED_PAGE_SIZE } from "@/components/personnel/TablePager";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useCachedAction } from "@/hooks/use-cached-action";
import { useReceipt } from "@/hooks/use-receipt";
import { CLIENT_CACHE_KEYS } from "@/lib/client-cache";
import { Card } from "@/components/ui/card";
import { ReceiptLoading } from "@/components/personnel/ReceiptLoading";
import { ReceiptOverlay } from "../documents/receipt-overlay";
import { ParReportSheet } from "../documents/par-report";
import { IcsReportSheet } from "../documents/ics-report";
import receipt from "../inspections/components/receipt.module.css";
import IssuancesLoading from "./loading";
import styles from "../dashboard/page.module.css";
import air from "../inspections/air-section.module.css";

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

const DOC_TABS = [
  { value: "all", label: "All" },
  { value: "PAR", label: "PAR" },
  { value: "ICS", label: "ICS" },
] as const;

export default function PersonnelIssuancesPage() {
  const [query, setQuery] = useState("");
  const [docTab, setDocTab] = useState<(typeof DOC_TABS)[number]["value"]>("all");
  // Fixed 20 rows/page (no selector) — the DB returns only this window.
  const pageSize = FIXED_PAGE_SIZE;
  const [page, setPage] = useState(1);
  // Debounced server search — the DB query fires only after typing pauses.
  const debouncedQuery = useDebouncedValue(query, 250);
  const searching = query.trim() !== debouncedQuery.trim();
  // Server-paged issuances: search/doc-type/page all filter in the DB.
  const { data: paged, loading, isValidating } = useCachedAction(
    `${CLIENT_CACHE_KEYS.issuances}:${page}:${debouncedQuery}:${docTab}`,
    () =>
      getIssuancesPage({
        page,
        pageSize,
        q: debouncedQuery,
        docType: docTab,
      }),
    { staleTime: 30_000 }
  );
  const [view, setView] = useState<"table" | "grid">("table");
  // Overlay receipt viewer with per-record client caching (shared with the
  // documents page) — viewing a receipt opens a modal, not a new page.
  const viewer = useReceipt<IssuanceDetail | null>();
  const openReceipt = (id: string) =>
    viewer.open(id, `issuance:${id}`, () => getIssuance(id));

  // Plain derivation (no hook) so hook count is identical on cold and
  // warm renders — a useMemo here would change hook order between the
  // skeleton early-return and the data path.
  const rows = paged?.rows ?? [];
  const total = paged?.total ?? 0;

  // Cold start only: background refetches keep stale rows visible with
  // an "updating…" badge instead of flashing the full skeleton.
  if (loading && rows.length === 0) {
    return <IssuancesLoading />;
  }
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const doc = viewer.doc ?? null;
  const isIcs = doc?.doc_type === "ICS";
  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Personnel / Issuances</p>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>PAR / ICS Issuances</h1>
          <p className={styles.subtitle}>
            {total} {total === 1 ? "record" : "records"} · your issuances only
            · value over ₱50,000 → PAR, ₱50,000 or less → ICS
            {(isValidating || searching) ? " · updating…" : ""}
          </p>
        </div>
        <div className={styles.actions}>
          <div
            className={air.tabs}
            role="group"
            aria-label="Change layout"
          >
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
        </div>
      </div>
      <Card className={styles.panel}>
        <div className={air.controls}>
          <div className={air.tabs} role="tablist" aria-label="Filter by document type">
            {DOC_TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={docTab === t.value}
                className={air.tab}
                data-active={docTab === t.value}
                onClick={() => {
                  setDocTab(t.value);
                  setPage(1);
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search doc no. or type…"
            aria-label="Search issuances"
            className={air.search}
          />
        </div>

        {total === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.panelSub}>
              No PAR/ICS records yet — issue an item from Assets or approve a
              new-assignment request.
            </p>
          </div>
        ) : view === "table" ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Doc</th>
                  <th>No.</th>
                  <th>Employee</th>
                  <th>Item</th>
                  <th>Qty</th>
                  <th>Total</th>
                  <th>Date</th>
                  <th>Report</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.id}-${i}`}>
                    <td>
                      <span className={styles.status} data-tone={r.doc_type === "PAR" ? "ok" : "info"}>
                        {r.doc_type}
                      </span>
                    </td>
                    <td>{r.doc_no ?? "—"}</td>
                    <td>{r.employee_name}</td>
                    <td>{r.item_label}</td>
                    <td>{r.quantity}</td>
                    <td>{peso(r.total_amount)}</td>
                    <td>{fmt(r.doc_date)}</td>
                    <td>
                      <button
                        type="button"
                        className={`${styles.inspectLinkSecondary} cursor-pointer`}
                        onClick={() => openReceipt(r.id)}
                      >
                        View {r.doc_type}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={air.grid}>
            {rows.map((r, i) => (
              <article key={`${r.id}-${i}`} className={air.card}>
                <div className={air.cardTop}>
                  <span className={air.ref}>{r.doc_no ?? r.doc_type}</span>
                  <span className={air.chips}>
                    <span
                      className={styles.status}
                      data-tone={r.doc_type === "PAR" ? "ok" : "info"}
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
                    className={`${air.primary} cursor-pointer`}
                    onClick={() => openReceipt(r.id)}
                  >
                    View {r.doc_type}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
        {total > 0 ? (
          <TablePager
            id="issuances"
            total={total}
            page={safePage}
            onPageChange={setPage}
          />
        ) : null}
      </Card>

      <ReceiptOverlay
        open={viewer.selectedId !== null}
        title={
          isIcs ? "Inventory Custodian Slip" : "Property Acknowledgment Receipt"
        }
        onClose={viewer.close}
      >
        {viewer.docLoading ? (
          <ReceiptLoading label="Loading report…" />
        ) : !doc ? (
          <div className={styles.emptyState}>
            <p className={styles.panelSub}>
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
            <p className={styles.panelSub}>
              <Link
                href={`/personnel/issuances/${doc.id}`}
                className={styles.inspectLinkSecondary}
              >
                Open full report
              </Link>{" "}
              ·{" "}
              <a
                href={`/api/personnel/issuances/${doc.id}/${isIcs ? "ics-xlsx" : "par-xlsx"}`}
                className={styles.inspectLinkSecondary}
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
