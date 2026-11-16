"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import receiptStyles from "@/app/personnel/inspections/components/receipt.module.css";
import styles from "@/app/personnel/deliveries/delivery-receipt.module.css";
import type { RepairRow } from "./actions";

type Tone = "ok" | "warn" | "info" | "bad";

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

function statusMeta(status: string | null): { label: string; tone: Tone } {
  if (!status) return { label: "—", tone: "info" };
  const label =
    status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");
  if (status === "completed") return { label, tone: "ok" };
  if (status === "in_progress") return { label, tone: "info" };
  return { label, tone: "warn" };
}

function Pill({ label, tone }: { label: string; tone: Tone }) {
  return (
    <span className={styles.pill} data-tone={tone}>
      {label}
    </span>
  );
}

function Field({ label: text, value }: { label: string; value: string }) {
  return (
    <div className={styles.field}>
      <dt className={styles.label}>{text}</dt>
      <dd className={styles.value}>{value}</dd>
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
  const status = statusMeta(r.status);
  const generatedOn = new Date().toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  });

  return (
    <article className={`${styles.sheet} mx-auto w-full max-w-3xl`}>
      {/* Masthead — same structure as the inspection receipt */}
      <header className={styles.top}>
        <div className={styles.brand}>
          <p className={styles.brandName}>PGSO</p>
          <p className={styles.brandSub}>Property &amp; Supply Management</p>
        </div>
        <div className={styles.doc}>
          <p className={styles.docTitle}>Repair Receipt</p>
          <p className={styles.docNo}>{ref}</p>
          <p className={styles.docDate}>Repair ticket</p>
        </div>
      </header>

      {/* Ticket status */}
      <section className={styles.section}>
        <p className={styles.sectionTitle}>Ticket</p>
        <dl className={styles.grid}>
          <Field label="Ticket No." value={ref} />
          <div className={styles.field}>
            <dt className={styles.label}>Progress</dt>
            <dd className={styles.value}>
              <Pill label={status.label} tone={status.tone} />
            </dd>
          </div>
          <Field label="Date Logged" value={fmtDate(r.created_at)} />
          <Field label="Repair Date" value={fmtDate(r.repair_date)} />
          <Field label="Receipt Generated" value={generatedOn} />
        </dl>
      </section>

      {/* Asset */}
      <section className={styles.section}>
        <p className={styles.sectionTitle}>Asset</p>
        <dl className={styles.grid}>
          <Field
            label="Asset"
            value={r.asset_label ?? r.asset_id.slice(0, 8).toUpperCase()}
          />
          <Field label="Account Code" value={r.account_code ?? "—"} />
          <Field label="Account Title" value={r.account_title ?? "—"} />
          <Field label="Asset Type" value={r.asset_type ?? "—"} />
        </dl>
      </section>

      {/* Repair details */}
      <section className={styles.section}>
        <p className={styles.sectionTitle}>Repair Details</p>
        <dl className={styles.grid}>
          <Field label="Reported By" value={r.reporter_name} />
          <Field label="Technician" value={r.technician ?? "Unassigned"} />
          <Field label="Cost" value={fmtCurrency(r.cost)} />
          <Field label="Issue / Work Done" value={r.description || "—"} />
        </dl>
      </section>

      {/* Signatures */}
      <section className={styles.section}>
        <p className={styles.sectionTitle}>Signatures</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="m-0 border-b border-navy-900 pb-1 text-sm font-semibold text-navy-900">
              {r.technician ?? " "}
            </p>
            <p className="mt-1 text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-navy-500">
              Technician
            </p>
          </div>
          <div>
            <p className="m-0 border-b border-navy-900 pb-1 text-sm font-semibold text-navy-900">
              {" "}
            </p>
            <p className="mt-1 text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-navy-500">
              Supply and/or Property Custodian
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <p className={styles.kicker}>End of repair record</p>
        <div className={styles.footerMeta}>
          <div aria-hidden="true" className={styles.barcode} />
          <p className={styles.footerRef}>Repair #{ref}</p>
        </div>
      </footer>
    </article>
  );
}
