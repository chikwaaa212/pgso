"use client";

import { useMemo, useState } from "react";
import {
  Calendar,
  Check,
  Copy,
  Download,
  FileText,
  Hash,
  Layers,
  Package,
  Printer,
  ScanLine,
  ShieldCheck,
  Tag,
  User,
} from "lucide-react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { PublicIssueLine } from "./actions";
import styles from "../dashboard/page.module.css";
import airStyles from "../inspections/air-section.module.css";
import assetStyles from "../assets/page.module.css";
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

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function IssuesTable({ rows }: { rows: PublicIssueLine[] }) {
  const [query, setQuery] = useState("");
  const [docFilter, setDocFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [active, setActive] = useState<PublicIssueLine | null>(null);
  const [copied, setCopied] = useState(false);

  const typeOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) {
      const raw = (r.asset_type ?? "").trim();
      if (!raw) continue;
      const key = raw.toLowerCase();
      if (!map.has(key)) map.set(key, raw);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (docFilter !== "all" && r.doc_type !== docFilter) return false;
      if (typeFilter !== "all" && (r.asset_type ?? "").trim().toLowerCase() !== typeFilter)
        return false;
      if (q) {
        const hay = [
          r.doc_no,
          r.employee_name,
          r.account_code,
          r.article,
          r.account_title,
          r.asset_type,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, query, docFilter, typeFilter]);

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

  return (
    <div>
      <div className={airStyles.controls}>
        <div className={assetStyles.topRow}>
          <div className={assetStyles.searchWrap}>
            <Search className={assetStyles.searchIcon} size={16} />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search employee, account code, article…"
              className={assetStyles.search}
              aria-label="Search issued items"
            />
          </div>
          <div className={assetStyles.filterGroup}>
            <label className={assetStyles.filterLabel} htmlFor="issues-filter-doc">
              Doc
            </label>
            <Select value={docFilter} onValueChange={setDocFilter}>
              <SelectTrigger id="issues-filter-doc" size="sm" className={assetStyles.filterSelect}>
                <SelectValue placeholder="All docs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All docs</SelectItem>
                <SelectItem value="PAR">PAR</SelectItem>
                <SelectItem value="ICS">ICS</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className={assetStyles.filterGroup}>
            <label className={assetStyles.filterLabel} htmlFor="issues-filter-type">
              Asset type
            </label>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger id="issues-filter-type" size="sm" className={assetStyles.filterSelect}>
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
          </div>
          {hasFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={assetStyles.filterBtn}
              onClick={() => {
                setQuery("");
                setDocFilter("all");
                setTypeFilter("all");
              }}
            >
              Clear all
            </Button>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.panelSub}>
            No assets or stock have been issued yet — issue an item from Assets
            or approve a new-assignment request.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.panelSub}>No issued items match your search or filters.</p>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Doc</th>
                <th>No.</th>
                <th>Employee (received by)</th>
                <th>Account Code</th>
                <th>Article</th>
                <th>Account Title</th>
                <th>Asset Type</th>
                <th>Qty</th>
                <th>Date</th>
                <th>QR record</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const key = `${r.issuance_id}:${r.line_index}`;
                return (
                  <tr key={key}>
                    <td>
                      <span
                        className={styles.status}
                        data-tone={r.doc_type === "PAR" ? "ok" : "info"}
                      >
                        {r.doc_type}
                      </span>
                    </td>
                    <td>{r.doc_no ?? "—"}</td>
                    <td>{r.employee_name}</td>
                    <td>{text(r.account_code)}</td>
                    <td>{text(r.article)}</td>
                    <td>{label(r.account_title)}</td>
                    <td>{label(r.asset_type)}</td>
                    <td>{r.quantity}</td>
                    <td>{fmtDate(r.doc_date)}</td>
                    <td>
                      <span className="inline-flex items-center gap-2">
                        {r.qr_data_url ? (
                          <span className={qr.thumb}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={r.qr_data_url}
                              alt={`QR record for ${r.doc_no ?? r.doc_type} issued to ${r.employee_name}`}
                            />
                          </span>
                        ) : (
                          <span className={styles.panelSub}>No QR</span>
                        )}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openRecord(r)}
                        >
                          View QR
                        </Button>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={active !== null} onOpenChange={(v) => !v && setActive(null)}>
        <DialogContent className={`${qr.dialogWide} sm:max-w-2xl`} showCloseButton={false}>
          {/* Accessible name — the visual masthead below carries the design. */}
          <DialogTitle className="sr-only">
            {active
              ? `Issue QR record — ${active.doc_type} ${active.doc_no ?? ""} issued to ${active.employee_name}`
              : "Issue QR record"}
          </DialogTitle>
          {active ? (
            <article className={`${qr.record} ${qr.printArea}`} aria-label="Issue QR record">
              {/* ── Masthead ─────────────────────────────────────────── */}
              <header className={qr.masthead}>
                <div className={qr.mastheadPattern} aria-hidden="true" />
                <p className={qr.kicker}>
                  <span className={qr.kickerDot} aria-hidden="true" />
                  PGSO · Property &amp; Supply Management
                </p>
                <div className={qr.mastheadRow}>
                  <div>
                    <h2 className={qr.mastheadTitle}>Issue QR Record</h2>
                    <p className={qr.mastheadSub}>
                      {fmtDate(active.doc_date)}
                      {active.line_count > 1
                        ? ` · Line ${active.line_index + 1} of ${active.line_count}`
                        : ""}
                    </p>
                  </div>
                  <div className={qr.docBadge} aria-label={`Document ${active.doc_type} ${active.doc_no ?? ""}`}>
                    <span className={qr.docBadgeKind}>{active.doc_type}</span>
                    <span className={qr.docBadgeNo}>{active.doc_no ?? "—"}</span>
                  </div>
                </div>
              </header>

              {/* ── Receiver strip ───────────────────────────────────── */}
              <div className={qr.receiver}>
                <span className={qr.avatar} aria-hidden="true">
                  {initials(active.employee_name)}
                </span>
                <div className={qr.receiverMeta}>
                  <p className={qr.receiverLabel}>
                    <User size={11} aria-hidden="true" /> Received by
                  </p>
                  <p className={qr.receiverName}>{active.employee_name}</p>
                  <p className={qr.receiverCap}>End user · accountable person</p>
                </div>
                <div className={qr.qtyPill} aria-label={`Quantity ${active.quantity}`}>
                  <div className={qr.qtyValue}>{active.quantity}</div>
                  <div className={qr.qtyLabel}>Qty issued</div>
                </div>
              </div>

              {/* ── Body: QR + details ───────────────────────────────── */}
              <div className={qr.body}>
                <div className={qr.qrPanel}>
                  <div className={qr.qrFrame}>
                    <span className={`${qr.tick} ${qr.tickTL}`} aria-hidden="true" />
                    <span className={`${qr.tick} ${qr.tickTR}`} aria-hidden="true" />
                    <span className={`${qr.tick} ${qr.tickBL}`} aria-hidden="true" />
                    <span className={`${qr.tick} ${qr.tickBR}`} aria-hidden="true" />
                    {active.qr_data_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={active.qr_data_url}
                        alt={`QR record for ${active.article ?? "issued item"} received by ${active.employee_name}`}
                      />
                    ) : (
                      <span className={styles.panelSub}>No QR</span>
                    )}
                  </div>
                  <p className={qr.scanHint}>
                    <ScanLine size={13} aria-hidden="true" /> Scan to verify
                  </p>
                  <p className={qr.refCode} title={active.qr_payload}>
                    REF {active.issuance_id.slice(0, 8).toUpperCase()}·L{active.line_index + 1}
                  </p>
                </div>

                <div className={qr.details}>
                  <p className={qr.detailsTitle}>Issued item</p>
                  {(
                    [
                      { icon: Hash, key: "Account code", value: text(active.account_code) },
                      { icon: Package, key: "Article", value: text(active.article) },
                      { icon: FileText, key: "Account title", value: label(active.account_title) },
                      { icon: Layers, key: "Asset type", value: label(active.asset_type) },
                      {
                        icon: Tag,
                        key: "Document",
                        value: `${active.doc_type} ${active.doc_no ?? "—"}`,
                      },
                      { icon: Calendar, key: "Issue date", value: fmtDate(active.doc_date) },
                    ] as const
                  ).map(({ icon: Icon, key, value }) => (
                    <div key={key} className={qr.detailRow}>
                      <span className={qr.detailIcon} aria-hidden="true">
                        <Icon size={15} />
                      </span>
                      <div className={qr.detailText}>
                        <p className={qr.detailKey}>{key}</p>
                        <p className={qr.detailValue}>{value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Trust footer ─────────────────────────────────────── */}
              <div className={qr.trust}>
                <ShieldCheck size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
                <p>
                  <strong>Verified issuance record.</strong> This QR encodes the
                  receiving employee, item identity, and quantity only — no
                  cost, supplier, or account-number data is shown or encoded.
                </p>
              </div>

              {/* ── Actions ──────────────────────────────────────────── */}
              <div className={`${qr.actions} ${qr.noPrint}`}>
                {active.qr_data_url ? (
                  <a
                    href={active.qr_data_url}
                    download={`issue-${active.doc_type}-${active.doc_no ?? active.issuance_id.slice(0, 8)}-line${active.line_index + 1}.svg`}
                    className={qr.btnPrimary}
                  >
                    <Download size={15} aria-hidden="true" /> Download QR
                  </a>
                ) : null}
                <button type="button" onClick={copyPayload} className={qr.btnOutline}>
                  {copied ? (
                    <Check size={15} aria-hidden="true" />
                  ) : (
                    <Copy size={15} aria-hidden="true" />
                  )}
                  {copied ? "Copied!" : "Copy QR data"}
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className={qr.btnOutline}
                >
                  <Printer size={15} aria-hidden="true" /> Print
                </button>
                <button
                  type="button"
                  onClick={() => setActive(null)}
                  className={qr.btnGhost}
                >
                  Close
                </button>
              </div>
            </article>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
