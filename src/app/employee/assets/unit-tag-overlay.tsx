"use client";

import { Download, ScanLine } from "lucide-react";
import { ReceiptOverlay } from "@/app/personnel/documents/receipt-overlay";
import type { MyAssetUnit } from "@/app/employee/actions";
import tag from "./unit-tag.module.css";

function fmtDate(value: string | null) {
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

export interface UnitTagParent {
  article: string | null;
  description: string | null;
  account_code: string | null;
  property_number: string | null;
  location: string | null;
  unit: string | null;
}

/**
 * Printable per-piece tag, opened from an employee's tracked-piece row.
 *
 * The overlay reuses the shared receipt print mode, so printing hides the app
 * shell and outputs only this tag — the same flow as PAR / ICS documents.
 */
export function UnitTagOverlay({
  open,
  unit,
  parent,
  onClose,
}: {
  open: boolean;
  unit: MyAssetUnit | null;
  parent: UnitTagParent | null;
  onClose: () => void;
}) {
  return (
    <ReceiptOverlay
      open={open}
      title="Tracked piece tag"
      onClose={onClose}
      printable
    >
      {!unit || !parent ? (
        <p className="py-6 text-center text-sm text-slate-500">
          This piece is no longer available.
        </p>
      ) : (
        <div className={tag.stack}>
          <article className={tag.tag} aria-label={`Tag for ${unit.item_code}`}>
            <header className={tag.head}>
              <div>
                <p className={tag.agency}>Provincial Government of Surigao del Norte</p>
                <p className={tag.office}>General Services Office — PGSO</p>
              </div>
              <span className={tag.badge}>Property tag</span>
            </header>

            <div className={tag.body}>
              <div className={tag.qrPanel}>
                {unit.qr_data_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={unit.qr_data_url}
                    alt={`QR code for ${unit.item_code}`}
                    width={200}
                    height={200}
                    className={tag.qr}
                    decoding="async"
                  />
                ) : (
                  <span className={tag.qrEmpty}>No QR</span>
                )}
                <code className={tag.code}>{unit.item_code}</code>
                <p className={tag.scanHint}>
                  <ScanLine size={12} aria-hidden="true" />
                  Scan to identify this piece
                </p>
              </div>

              <dl className={tag.meta}>
                <div>
                  <dt>Article</dt>
                  <dd>{parent.article ?? "—"}</dd>
                </div>
                {parent.description ? (
                  <div>
                    <dt>Description</dt>
                    <dd>{parent.description}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Account code</dt>
                  <dd>{parent.account_code ?? "—"}</dd>
                </div>
                <div>
                  <dt>Property no.</dt>
                  <dd>{parent.property_number ?? "—"}</dd>
                </div>
                <div>
                  <dt>Custodian</dt>
                  <dd>{unit.holder_name ?? "—"}</dd>
                </div>
                <div>
                  <dt>Issued by</dt>
                  <dd>{unit.issued_by ?? "—"}</dd>
                </div>
                <div>
                  <dt>Assigned</dt>
                  <dd>{fmtDate(unit.assigned_at)}</dd>
                </div>
                {parent.location ? (
                  <div>
                    <dt>Location</dt>
                    <dd>{parent.location}</dd>
                  </div>
                ) : null}
              </dl>
            </div>

            <footer className={tag.foot}>
              <span>
                {unit.status ? unit.status.toUpperCase() : "ASSIGNED"}
                {parent.unit ? ` · Unit ${parent.unit}` : ""}
              </span>
              <span className={tag.footNote}>
                Immutable item code — do not alter or remove this tag.
              </span>
            </footer>
          </article>

          <div className={tag.actions}>
            {unit.qr_data_url ? (
              <a
                href={unit.qr_data_url}
                download={`${unit.item_code}.svg`}
                className={tag.downloadBtn}
              >
                <Download size={14} aria-hidden="true" />
                Download QR
              </a>
            ) : null}
          </div>
        </div>
      )}
    </ReceiptOverlay>
  );
}
