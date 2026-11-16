"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  Download,
  PackageSearch,
  Printer,
  QrCode,
  ScanLine,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Pagination } from "@/components/ui/pagination";
import { EmptySearchState } from "@/components/personnel/EmptySearchState";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { PAGE_SIZE } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { PublicIssueLine } from "./actions";
import styles from "../dashboard/page.module.css";
import stockStyles from "../stocks/page.module.css";
import assetStyles from "../assets/page.module.css";
import docs from "./page.module.css";
import qr from "./qr-record.module.css";

function fmtDate(value: string | null | undefined) {
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

function label(value: string | null) {
  if (!value) return "—";
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");
}

function text(v: string | null) {
  return v?.trim() ? v.trim() : "—";
}

export function IssuesTable({
  rows,
  showLoggedBy = false,
  serverTypeOptions,
  onFiltersChange,
  paginate = false,
  totalDocuments,
}: {
  rows: PublicIssueLine[];
  /** Shows the "Logged By" (issuing user) column — used by Super Admin oversight. */
  showLoggedBy?: boolean;
  /** Full-registry type options (server) — used when rows are a page window. */
  serverTypeOptions?: string[];
  /** Reports debounced filter state up for server-paged fetching. */
  onFiltersChange?: (filters: { q: string; docType: string; assetType: string }) => void;
  /**
   * Local mode: the whole window is in `rows` and search/filter/paging run in
   * memory, so typing filters on the same keystroke with no fetch.
   */
  paginate?: boolean;
  /** Server total of issued documents (local mode) — flags a truncated window. */
  totalDocuments?: number;
}) {
  const [query, setQuery] = useState("");
  const [docFilter, setDocFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [active, setActive] = useState<PublicIssueLine | null>(null);
  const [copied, setCopied] = useState(false);
  const [page, setPage] = useState(1);
  // Debounced search — only reported upstream for server-driven windows.
  const debouncedQuery = useDebouncedValue(query, 250);
  const serverDriven = onFiltersChange !== undefined;
  useEffect(() => {
    if (serverDriven) onFiltersChange({ q: debouncedQuery, docType: docFilter, assetType: typeFilter });
  }, [debouncedQuery, docFilter, typeFilter, serverDriven, onFiltersChange]);

  const typeOptions = useMemo(() => {
    if (serverTypeOptions) {
      return serverTypeOptions.map((raw) => [raw.toLowerCase(), raw] as [string, string]);
    }
    const map = new Map<string, string>();
    for (const r of rows) {
      const raw = (r.asset_type ?? "").trim();
      if (!raw) continue;
      const key = raw.toLowerCase();
      if (!map.has(key)) map.set(key, raw);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows, serverTypeOptions]);

  const filtered = useMemo(() => {
    // Server-driven: the DB already applied q/doc/type — render the window.
    if (serverDriven) return rows;
    // Local window: filter on the live query so results never lag a keystroke.
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (docFilter !== "all" && r.doc_type !== docFilter) return false;
      if (typeFilter !== "all" && (r.asset_type ?? "").trim().toLowerCase() !== typeFilter)
        return false;
      if (q) {
        const hay = [
          r.doc_no,
          r.doc_type,
          r.employee_name,
          r.logged_by,
          r.account_code,
          r.article,
          r.account_title,
          r.asset_type,
          r.quantity,
          fmtDate(r.doc_date),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, query, docFilter, typeFilter, serverDriven]);

  // Local paging is reset directly in the filter handlers below (no effect),
  // and the rendered page is clamped so a shrinking list can never go blank.
  const hasFilters = query.trim() !== "" || docFilter !== "all" || typeFilter !== "all";

  const openRecord = (r: PublicIssueLine) => {
    setCopied(false);
    setActive(r);
  };

  const copyPayload = async () => {
    if (!active) return;
    try {
      await navigator.clipboard.writeText(active.qr_payload);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = active.qr_payload;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* clipboard unavailable — leave state unchanged */
        document.body.removeChild(ta);
        return;
      }
      document.body.removeChild(ta);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const stats = useMemo(() => {
    const documents = new Set<string>();
    let par = 0;
    let ics = 0;
    for (const r of filtered) {
      documents.add(r.issuance_id);
      if (r.doc_type === "PAR") par += 1;
      else if (r.doc_type === "ICS") ics += 1;
    }
    return { documents: documents.size, par, ics };
  }, [filtered]);

  const clearFilters = () => {
    setQuery("");
    setDocFilter("all");
    setTypeFilter("all");
    setPage(1);
  };

  // Only the local (windowed) mode pages in memory; server mode's rows already
  // are one page.
  const localPageSize = PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(filtered.length / localPageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const visible = paginate
    ? filtered.slice((safePage - 1) * localPageSize, safePage * localPageSize)
    : filtered;

  return (
    <div>
      <div className={stockStyles.toolbar}>
        <div className={docs.chips} aria-live="polite">
          <span className={docs.chip}>
            <strong>{filtered.length}</strong> line{filtered.length === 1 ? "" : "s"}
          </span>
          <span className={docs.chip}>
            <strong>{stats.documents}</strong> document
            {stats.documents === 1 ? "" : "s"}
          </span>
          {stats.par > 0 ? (
            <span className={docs.chip} data-tone="ok">
              PAR <strong>{stats.par}</strong>
            </span>
          ) : null}
          {stats.ics > 0 ? (
            <span className={docs.chip} data-tone="info">
              ICS <strong>{stats.ics}</strong>
            </span>
          ) : null}
        </div>

        <div className={stockStyles.filters}>
          <div className={docs.searchWrap}>
            <Search size={15} aria-hidden="true" className={docs.searchIcon} />
            <Input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search employee, account code, article…"
              className={cn(stockStyles.search, docs.search)}
              aria-label="Search issued items"
            />
          </div>
          <Select
            value={docFilter}
            onValueChange={(v) => {
              setDocFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger
              id="issues-filter-doc"
              className={stockStyles.accountSelect}
              aria-label="Filter by document type"
            >
              <SelectValue placeholder="All docs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All docs</SelectItem>
              <SelectItem value="PAR">PAR</SelectItem>
              <SelectItem value="ICS">ICS</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={typeFilter}
            onValueChange={(v) => {
              setTypeFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger
              id="issues-filter-type"
              className={stockStyles.accountSelect}
              aria-label="Filter by asset type"
            >
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {typeOptions.map(([key, display]) => (
                <SelectItem key={key} value={key}>
                  {label(display)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasFilters && (
            <button
              type="button"
              className={assetStyles.rowActionMuted}
              onClick={clearFilters}
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className={stockStyles.empty}>
          <span className={stockStyles.emptyIcon}>
            <PackageSearch size={20} aria-hidden="true" />
          </span>
          <p className={stockStyles.emptyTitle}>No issued items yet</p>
          <p className={stockStyles.emptyText}>
            Issue an item from Assets or approve a new-assignment request — each
            issued line appears here with its own QR record.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <EmptySearchState
          title="No issued items match these filters"
          description="Try a different employee, account code, article, or document type."
          onClear={clearFilters}
        />
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Doc</th>
                <th>No.</th>
                <th>Employee (received by)</th>
                {showLoggedBy ? <th>Logged By</th> : null}
                <th>Account Code</th>
                <th>Article</th>
                <th>Account Title</th>
                <th>Asset Type</th>
                <th className={docs.num}>Qty</th>
                <th>Date</th>
                <th style={{ textAlign: "right" }}>QR record</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const key = `${r.issuance_id}:${r.line_index}`;
                return (
                  <tr key={key} className={docs.bodyRow}>
                    <td>
                      <span
                        className={stockStyles.badge}
                        data-tone={r.doc_type === "PAR" ? "ok" : "info"}
                      >
                        {r.doc_type}
                      </span>
                    </td>
                    <td>{r.doc_no ?? "—"}</td>
                    <td>{r.employee_name}</td>
                    {showLoggedBy ? <td>{r.logged_by ?? "—"}</td> : null}
                    <td>{text(r.account_code)}</td>
                    <td>{text(r.article)}</td>
                    <td>{label(r.account_title)}</td>
                    <td>{label(r.asset_type)}</td>
                    <td className={docs.num}>{r.quantity}</td>
                    <td>{fmtDate(r.doc_date)}</td>
                    <td className={docs.actionCell}>
                      <button
                        type="button"
                        onClick={() => openRecord(r)}
                        className={assetStyles.rowAction}
                        title={`View the QR record for ${r.article ?? "this issued line"}`}
                      >
                        <QrCode size={14} aria-hidden="true" />
                        View QR
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {paginate && filtered.length > 0 ? (
        <div className={stockStyles.footer}>
          {filtered.length > localPageSize ? (
            <Pagination
              total={filtered.length}
              page={safePage}
              onPageChange={setPage}
              id="issues-lines"
            />
          ) : (
            <span className={stockStyles.footerInfo}>
              Showing all {filtered.length} line{filtered.length === 1 ? "" : "s"}
            </span>
          )}
          {paginate && totalDocuments !== undefined && totalDocuments > stats.documents ? (
            <span className={stockStyles.footerInfo}>
              Newest {stats.documents} of {totalDocuments} documents loaded
            </span>
          ) : null}
        </div>
      ) : null}

      <Dialog open={active !== null} onOpenChange={(v) => !v && setActive(null)}>
        <DialogContent className={`${qr.dialogWide} sm:max-w-2xl`} showCloseButton={false}>
          {/* Accessible name — the visual header below carries the design. */}
          <DialogTitle className="sr-only">
            {active
              ? `${active.doc_type === "ICS" ? "Inventory Custodian Slip" : "Property Acknowledgement Receipt"} — ${
                  active.doc_no ?? "no document number"
                } issued to ${active.employee_name}`
              : "Issue QR record"}
          </DialogTitle>
          {active ? (
            <article className={`${qr.record} ${qr.printArea}`} aria-label="Issue QR record">
              {/* ── Header ───────────────────────────────────────────── */}
              <header className={qr.header}>
                <div className={qr.headerBar}>
                  <span className={qr.docTag} data-kind={active.doc_type}>
                    {active.doc_type}
                  </span>
                  <span className={qr.docNo}>
                    {active.doc_no ? `No. ${active.doc_no}` : "No document number"}
                  </span>
                  <button
                    type="button"
                    className={qr.closeBtn}
                    onClick={() => setActive(null)}
                    aria-label="Close"
                    title="Close"
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </div>
                <h2 className={qr.headerTitle}>
                  {active.doc_type === "ICS"
                    ? "Inventory Custodian Slip"
                    : "Property Acknowledgement Receipt"}
                </h2>
                <p className={qr.headerSub}>
                  Issued to <strong>{active.employee_name}</strong> on{" "}
                  {fmtDate(active.doc_date)}
                  {active.line_count > 1
                    ? ` · line ${active.line_index + 1} of ${active.line_count}`
                    : ""}
                </p>
              </header>

              {/* ── Body: QR + facts ─────────────────────────────────── */}
              <div className={qr.body}>
                <div className={qr.qrPanel}>
                  <div className={qr.qrFrame}>
                    {active.qr_data_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={active.qr_data_url}
                        alt={`QR record for ${active.article ?? "issued item"} received by ${active.employee_name}`}
                        width={120}
                        height={120}
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <span className={styles.panelSub}>No QR</span>
                    )}
                  </div>
                  <p className={qr.scanHint}>
                    <ScanLine size={14} aria-hidden="true" /> Scan to verify
                  </p>
                  <p className={qr.refCode} title={active.qr_payload}>
                    Ref {active.issuance_id.slice(0, 8).toUpperCase()} · line{" "}
                    {active.line_index + 1}
                  </p>
                </div>

                <dl className={qr.details}>
                  {(
                    [
                      { key: "Quantity", value: String(active.quantity) },
                      { key: "Account code", value: text(active.account_code) },
                      { key: "Article", value: text(active.article) },
                      { key: "Account title", value: label(active.account_title) },
                      { key: "Asset type", value: label(active.asset_type) },
                      { key: "Issue date", value: fmtDate(active.doc_date) },
                    ] as const
                  ).map(({ key, value }) => (
                    <div key={key} className={qr.detailRow}>
                      <dt className={qr.detailKey}>{key}</dt>
                      <dd
                        className={cn(
                          qr.detailValue,
                          value === "—" && qr.detailValueMuted
                        )}
                      >
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>

              {/* ── Footer ───────────────────────────────────────────── */}
              <footer className={qr.footer}>
                <p className={qr.note}>
                  <ShieldCheck size={15} aria-hidden="true" />
                  <span>
                    <strong>Verified record.</strong> The QR contains the
                    employee, item, and quantity only — no cost or supplier data.
                  </span>
                </p>
                <div className={`${qr.actions} ${qr.noPrint}`}>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className={qr.btnOutline}
                  >
                    <Printer size={14} aria-hidden="true" /> Print
                  </button>
                  <button type="button" onClick={copyPayload} className={qr.btnOutline}>
                    {copied ? (
                      <Check size={14} aria-hidden="true" />
                    ) : (
                      <Copy size={14} aria-hidden="true" />
                    )}
                    {copied ? "Copied" : "Copy data"}
                  </button>
                  {active.qr_data_url ? (
                    <a
                      href={active.qr_data_url}
                      download={`issue-${active.doc_type}-${active.doc_no ?? active.issuance_id.slice(0, 8)}-line${active.line_index + 1}.svg`}
                      className={qr.btnPrimary}
                    >
                      <Download size={14} aria-hidden="true" /> Download QR
                    </a>
                  ) : null}
                </div>
              </footer>
            </article>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
