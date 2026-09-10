"use client";

import type { IssuanceDetail } from "../issuances/actions";
import acc from "../issuances/issuance.module.css";

function fmt(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  });
}

function val(v: string | null | undefined) {
  return v?.trim() ? v.trim() : "";
}

function peso(n: number | null | undefined) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "";
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(n);
}

/** Appendix 71 PAR sheet — same ruled look as the IAR sheet + PAR FORM.xls. */
export function ParReportSheet({ issuance: r }: { issuance: IssuanceDetail }) {
  if (r.image_url) {
    return (
      <figure className={acc.scanWrap}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={r.image_url}
          alt={`Signed PAR scan ${r.doc_no ?? ""}`}
          className={acc.scanImg}
        />
        <figcaption className={acc.scanCap}>
          Signed PAR scan{r.doc_no ? ` — ${r.doc_no}` : ""} ·{" "}
          <a href={r.image_url} target="_blank" rel="noreferrer">
            Open full size
          </a>
        </figcaption>
      </figure>
    );
  }

  const d = (r.issuance_data ?? {}) as Record<string, unknown> & {
    lines?: Array<{
      quantity?: number;
      unit?: string;
      description?: string;
      label?: string;
      propertyNo?: string;
      dateAcquired?: string;
      total?: number;
    }>;
  };
  const header = {
    entity: val(d.entity as string | null | undefined),
    fundCluster: val(d.fundCluster as string | null | undefined),
    parNo: val(r.doc_no),
  };
  // Consolidated (multi-item) approvals store every line in
  // issuance_data.lines — one document lists all lines. Fall back to the
  // legacy single-row columns otherwise.
  const lines = Array.isArray(d.lines) && d.lines.length > 0 ? d.lines : null;
  const rows = lines
    ? lines.map((l) => ({
        qty: l.quantity ?? 1,
        unit: val(l.unit),
        description: val(l.description) || val(l.label) || r.item_label,
        propertyNo: val(l.propertyNo),
        dateAcquired: val(l.dateAcquired),
        amount: peso(l.total),
      }))
    : [
        {
          qty: r.quantity,
          unit: val(d.unit as string | null | undefined),
          description: val(d.description as string | null | undefined) || r.item_label,
          propertyNo: val(d.propertyNo as string | null | undefined),
          dateAcquired: val(d.dateAcquired as string | null | undefined),
          amount: peso(r.total_amount),
        },
      ];

  const MIN_ROWS = 12;
  const blanks = Math.max(0, MIN_ROWS - rows.length);

  const toName = val(d.toName as string | null | undefined) || r.employee_name;
  const toPosition = val(d.toPosition as string | null | undefined);
  const toDate = val(d.toDate as string | null | undefined) || val(r.doc_date);
  const fromName = val(d.fromName as string | null | undefined);
  const fromPosition = val(d.fromPosition as string | null | undefined);
  const fromDate = val(d.fromDate as string | null | undefined) || val(r.doc_date);

  return (
    <article className={acc.airSheet} aria-label="Property Acknowledgment Receipt">
      <p className={acc.appendix}>Appendix 71</p>
      <h1 className={acc.title}>PROPERTY ACKNOWLEDGMENT RECEIPT</h1>

      <div className={acc.headerGrid}>
        <div className={acc.headerColLeft}>
          <div className={acc.field}>
            <span className={acc.fieldLabel}>Entity Name :</span>
            <span className={acc.fieldValue}>{header.entity}</span>
          </div>
          <div className={acc.field}>
            <span className={acc.fieldLabel}>Fund Cluster :</span>
            <span className={acc.fieldValue}>{header.fundCluster}</span>
          </div>
        </div>
        <div className={acc.headerColRight}>
          <div className={acc.field}>
            <span className={acc.fieldLabel}>PAR No. :</span>
            <span className={acc.fieldValue}>{header.parNo}</span>
          </div>
          <div className={acc.field}>
            <span className={acc.fieldLabel}>Date :</span>
            <span className={acc.fieldValue}>{fmt(r.doc_date)}</span>
          </div>
        </div>
      </div>

      <table className={acc.itemsTable}>
        <thead>
          <tr>
            <th className={acc.cellParQty}>Quantity</th>
            <th className={acc.cellParUnit}>Unit</th>
            <th className={acc.cellParDesc}>Description</th>
            <th className={acc.cellParProp}>
              Property
              <br />
              Number
            </th>
            <th className={acc.cellParDate}>
              Date
              <br />
              Acquired
            </th>
            <th className={acc.cellParAmount}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={`item-${i}`}>
              <td className={acc.cellCenter}>{row.qty}</td>
              <td className={acc.cellCenter}>{row.unit}</td>
              <td>{row.description}</td>
              <td className={acc.cellCenter}>{row.propertyNo}</td>
              <td className={acc.cellCenter}>{fmt(row.dateAcquired) || row.dateAcquired}</td>
              <td style={{ textAlign: "right" }}>{row.amount}</td>
            </tr>
          ))}
          {Array.from({ length: blanks }).map((_, i) => (
            <tr key={`blank-${i}`}>
              <td>&nbsp;</td>
              <td>&nbsp;</td>
              <td>&nbsp;</td>
              <td>&nbsp;</td>
              <td>&nbsp;</td>
              <td>&nbsp;</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className={acc.bottomGrid}>
        <section className={acc.bottomLeft}>
          <p className={acc.bottomTitle}>Received by:</p>
          <div className={acc.bottomBody}>
            <div className={acc.sig}>
              <p className={acc.sigName}>{toName}</p>
              <p className={acc.sigLabel}>Signature over Printed Name of End User</p>
            </div>
            <div className={acc.field}>
              <span className={acc.fieldLabel}>Position/Office :</span>
              <span className={acc.fieldValue}>{toPosition}</span>
            </div>
            <div className={acc.field}>
              <span className={acc.fieldLabel}>Date :</span>
              <span className={acc.fieldValue}>{fmt(toDate) || toDate}</span>
            </div>
          </div>
        </section>
        <section className={acc.bottomRight}>
          <p className={acc.bottomTitle}>Issued by:</p>
          <div className={acc.bottomBody}>
            <div className={acc.sig} style={{ marginTop: 12 }}>
              <p className={acc.sigName}>{fromName}</p>
              <p className={acc.sigLabel}>
                Signature over Printed Name of Supply and/or Property Custodian
              </p>
            </div>
            <div className={acc.field}>
              <span className={acc.fieldLabel}>Position/Office :</span>
              <span className={acc.fieldValue}>{fromPosition}</span>
            </div>
            <div className={acc.field}>
              <span className={acc.fieldLabel}>Date :</span>
              <span className={acc.fieldValue}>{fmt(fromDate) || fromDate}</span>
            </div>
          </div>
        </section>
      </div>
    </article>
  );
}
