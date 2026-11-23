import Link from "next/link";
import { ArrowLeft, ExternalLink, History, QrCode, UserRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { AssetUnitDetail } from "@/lib/asset-unit-detail";
import styles from "@/app/personnel/dashboard/page.module.css";

function fmtDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Manila",
  });
}

const ACTION_BTN =
  "inline-flex h-7 items-center gap-1.5 rounded-[4px] border border-yellow-600 bg-yellow-500 px-3 text-xs font-semibold text-navy-900 no-underline opacity-90 transition-colors hover:bg-yellow-400 hover:opacity-100";

/**
 * Scannable per-piece record. The QR on the physical tag opens this page:
 * immutable item code, current holder, and the issuance that assigned it.
 */
export function AssetUnitDetailView({
  unit,
  backHref,
  assetBase,
}: {
  unit: AssetUnitDetail;
  backHref: string;
  assetBase: string;
}) {
  const parentHref = unit.parent
    ? unit.parent.kind === "stock"
      ? `${assetBase}/stock/${unit.parent.id}`
      : `${assetBase}/${unit.parent.id}`
    : null;

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Asset units / {unit.item_code}</p>

      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold text-navy-900">
            <QrCode size={20} aria-hidden="true" className="text-slate-400" />
            <code className="rounded bg-slate-100 px-2 py-1 text-base">{unit.item_code}</code>
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold capitalize text-blue-700 ring-1 ring-blue-200">
              {unit.status}
            </span>
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {unit.parent?.article ?? unit.parent?.description ?? "Tracked asset piece"}
            {unit.parent?.account_code ? ` · ${unit.parent.account_code}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={backHref} className={ACTION_BTN}>
            <ArrowLeft size={13} aria-hidden="true" />
            Back
          </Link>
          {parentHref ? (
            <Link href={parentHref} className={ACTION_BTN}>
              <ExternalLink size={13} aria-hidden="true" />
              Open asset
            </Link>
          ) : null}
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        <Card className={styles.panel}>
          <div className="flex flex-col items-center gap-2 p-4">
            {unit.qr_data_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={unit.qr_data_url}
                alt={`QR code for ${unit.item_code}`}
                width={160}
                height={160}
                className="h-40 w-40"
                decoding="async"
              />
            ) : (
              <span className="flex h-40 w-40 items-center justify-center rounded border border-dashed border-slate-300 text-slate-400">
                <QrCode size={32} aria-hidden="true" />
              </span>
            )}
            <p className="text-xs font-semibold text-navy-900">{unit.item_code}</p>
            <p className="text-center text-[11px] text-slate-500">
              Scan to identify this piece and its current holder.
            </p>
          </div>
        </Card>

        <Card className={styles.panel}>
          <div className="p-4">
            <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-navy-900">
              <UserRound size={14} aria-hidden="true" />
              Accountability
            </h2>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-slate-500">Current holder</dt>
                <dd className="text-sm text-navy-900">{unit.holder_name ?? "Unassigned — on hand"}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-slate-500">Assigned</dt>
                <dd className="text-sm text-navy-900">{fmtDate(unit.assigned_at)}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-slate-500">Condition</dt>
                <dd className="text-sm capitalize text-navy-900">{unit.condition ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-slate-500">Tag created</dt>
                <dd className="text-sm text-navy-900">{fmtDate(unit.created_at)}</dd>
              </div>
            </dl>

            <h2 className="mb-2 mt-5 flex items-center gap-1.5 text-sm font-semibold text-navy-900">
              <History size={14} aria-hidden="true" />
              Assignment record
            </h2>
            {unit.issuance ? (
              <p className="text-sm text-slate-700">
                {unit.issuance.doc_type ?? "Issuance"}
                {unit.issuance.doc_no ? ` ${unit.issuance.doc_no}` : ""}
                {unit.issuance.doc_date ? ` · ${fmtDate(unit.issuance.doc_date)}` : ""}
              </p>
            ) : unit.assigned_to ? (
              <p className="text-sm text-slate-700">On record as the current holder.</p>
            ) : (
              <p className="text-sm text-slate-500">Not yet issued to an employee.</p>
            )}

            {unit.parent ? (
              <>
                <h2 className="mb-2 mt-5 text-sm font-semibold text-navy-900">Parent asset</h2>
                <dl className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-slate-500">Account code</dt>
                    <dd className="text-sm text-navy-900">{unit.parent.account_code ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-slate-500">Property no.</dt>
                    <dd className="text-sm text-navy-900">{unit.parent.property_number ?? "—"}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-[11px] uppercase tracking-wide text-slate-500">Description</dt>
                    <dd className="text-sm text-navy-900">{unit.parent.description ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-slate-500">Location</dt>
                    <dd className="text-sm text-navy-900">{unit.parent.location ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-slate-500">Date acquired</dt>
                    <dd className="text-sm text-navy-900">{fmtDate(unit.parent.date_acquired)}</dd>
                  </div>
                </dl>
              </>
            ) : null}
          </div>
        </Card>
      </div>
    </section>
  );
}
