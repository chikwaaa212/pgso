"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import receiptStyles from "@/app/personnel/inspections/components/receipt.module.css";
import type { RepairRow } from "./actions";

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  });
}

function fmtCurrency(value: number | null) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(value);
}

function statusTone(status: string | null) {
  if (status === "completed") return "ok" as const;
  if (status === "in_progress") return "info" as const;
  return "warn" as const;
}

function statusLabel(status: string | null) {
  if (!status) return "—";
  return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");
}

function pair(labelText: string, value: string) {
  return (
    <div key={labelText} className={receiptStyles.row}>
      <dt>{labelText}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function RepairReceiptToolbar() {
  return (
    <div className={receiptStyles.toolbar}>
      <Link
        href="/personnel/repairs"
        className={cn(receiptStyles.toolbarBtn, receiptStyles.toolbarGhost)}
      >
        Back to repairs
      </Link>
      <button
        type="button"
        className={cn(receiptStyles.toolbarBtn, receiptStyles.toolbarPrint)}
        onClick={() => window.print()}
      >
        Print / Save PDF
      </button>
    </div>
  );
}

export function RepairReceipt({ repair: r }: { repair: RepairRow }) {
  const ref = r.id.slice(0, 8).toUpperCase();
  const generatedOn = new Date().toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  });

  return (
    <article className={receiptStyles.receipt}>
      <div className={receiptStyles.receiptInner}>
        {/* ── Masthead ─────────────────────────────────────────────── */}
        <header className={receiptStyles.masthead}>
          <p className={receiptStyles.orgName}>PGSO</p>
          <p className={receiptStyles.orgSub}>Property &amp; Supply Management</p>
          <p className={receiptStyles.docTitle}>*** REPAIR RECEIPT ***</p>
          <p className={receiptStyles.docSub}>REPAIR TICKET — {ref}</p>
        </header>

        <div className={receiptStyles.divider} />

        {/* ── Ticket status ────────────────────────────────────────── */}
        <p className={receiptStyles.sectionTitle}>TICKET</p>
        <dl className={receiptStyles.rows}>
          {pair("Ticket No.", ref)}
          <div className={receiptStyles.row}>
            <dt>Progress</dt>
            <dd>
              <span
                className={receiptStyles.resultBadge}
                data-tone={statusTone(r.status)}
              >
                {statusLabel(r.status).toUpperCase()}
              </span>
            </dd>
          </div>
          {pair("Date Logged", fmtDate(r.created_at))}
          {pair("Repair Date", fmtDate(r.repair_date))}
          {pair("Receipt Generated", generatedOn)}
        </dl>

        <div className={receiptStyles.divider} />

        {/* ── Asset ────────────────────────────────────────────────── */}
        <p className={receiptStyles.sectionTitle}>ASSET</p>
        <dl className={receiptStyles.rows}>
          {pair("Asset", r.asset_label ?? r.asset_id.slice(0, 8).toUpperCase())}
          {pair("Account Code", r.account_code ?? "—")}
          {pair("Account Title", r.account_title ?? "—")}
          {pair("Asset Type", r.asset_type ?? "—")}
        </dl>

        <div className={receiptStyles.divider} />

        {/* ── Repair details ───────────────────────────────────────── */}
        <p className={receiptStyles.sectionTitle}>REPAIR DETAILS</p>
        <dl className={receiptStyles.rows}>
          {pair("Reported By", r.reporter_name)}
          {pair("Technician", r.technician ?? "Unassigned")}
          {pair("Cost", fmtCurrency(r.cost))}
        </dl>

        <p className={receiptStyles.remarksLabel}>
          Issue / Work Done:{" "}
          <span className={receiptStyles.remarks}>{r.description || "—"}</span>
        </p>

        <div className={receiptStyles.signatureRow}>
          <div className={receiptStyles.signature}>
            <p className={receiptStyles.signatureName}>
              {r.technician ?? " "}
            </p>
            <p className={receiptStyles.signatureLabel}>TECHNICIAN</p>
          </div>
          <div className={receiptStyles.signature}>
            <p className={receiptStyles.signatureName}> </p>
            <p className={receiptStyles.signatureLabel}>
              SUPPLY AND/OR PROPERTY CUSTODIAN
            </p>
          </div>
        </div>

        <div className={receiptStyles.divider} />

        {/* ── Footer ───────────────────────────────────────────────── */}
        <p className={receiptStyles.receiptKicker}>END OF REPAIR RECORD</p>
        <div
          aria-hidden="true"
          className={receiptStyles.scanned}
          style={{
            background:
              "repeating-linear-gradient(90deg, #1b2a4a 0 2px, transparent 2px 5px, #1b2a4a 5px 6px, transparent 6px 10px)",
          }}
        />
        <p className={receiptStyles.scannedLabel}>REPAIR #{ref}</p>
        <p className={receiptStyles.thanks}>*** Thank you! ***</p>
      </div>
    </article>
  );
}
