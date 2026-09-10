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

/** Appendix 59 ICS sheet — same ruled look as the IAR sheet + ICS FORM.xls. */
export function IcsReportSheet({ issuance: r }: { issuance: IssuanceDetail }) {
  if (r.image_url) {
    return (
      <figure className={acc.scanWrap}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={r.image_url}
          alt={`Signed ICS scan ${r.doc_no ?? ""}`}
          className={acc.scanImg}
        />
        <figcaption className={acc.scanCap}>
          Signed ICS scan{r.doc_no ? ` — ${r.doc_no}` : ""} ·{" "}
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
      unitCost?: number;
      total?: number;
      description?: string;
      label?: string;
      inventoryItemNo?: string;
      estUsefulLife?: string;
    }>;
  };
  const header = {
    entity: val(d.entity as string | null | undefined),
    fundCluster: val(d.fundCluster as string | null | undefined),
    icsNo: val(r.doc_no),
  };
  // Consolidated (multi-item) approvals store every line in
  // issuance_data.lines — one document lists all lines. Fall back to the
  // legacy single-row columns otherwise.
  const lines = Array.isArray(d.lines) && d.lines.length > 0 ? d.lines : null;
  const rows = lines
    ? lines.map((l) => ({
        qty: l.quantity ?? 1,
        unit: val(l.unit),
        unitCost: peso(l.unitCost),
        totalCost: peso(l.total),
        description: val(l.description) || val(l.label) || r.item_label,
        itemNo: val(l.inventoryItemNo),
        life: val(l.estUsefulLife),
      }))
    : [
        {
          qty: r.quantity,
          unit: val(d.unit as string | null | undefined),
          unitCost: peso(r.unit_cost),
          totalCost: peso(r.total_amount),
          description:
            val(d.description as string | null | undefined) || r.item_label,
          itemNo: val(d.inventoryItemNo as string | null | undefined),
          life: val(d.estUsefulLife as string | null | undefined),
        },
      ];

  const MIN_ROWS = 12;
  const blanks = Math.max(0, MIN_ROWS - rows.length);

  const fromName = val(d.fromName as string | null | undefined);
  const fromPosition = val(d.fromPosition as string | null | undefined);
  const fromDate = val(d.fromDate as string | null | undefined) || val(r.doc_date);
  const toName = val(d.toName as string | null | undefined) || r.employee_name;
  const toPosition = val(d.toPosition as string | null | undefined);
  const toDate = val(d.toDate as string | null | undefined) || val(r.doc_date);

  return (
    <article className={acc.airSheet} aria-label="Inventory Custodian Slip">
      <p className={acc.appendix}>Appendix 59</p>
      <h1 className={acc.title}>INVENTORY CUSTODIAN SLIP</h1>

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
            <span className={acc.fieldLabel}>ICS No. :</span>
            <span className={acc.fieldValue}>{header.icsNo}</span>
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
            <th className={acc.cellIcsQty} rowSpan={2}>
              Quantity
            </th>
            <th className={acc.cellIcsUnit} rowSpan={2}>
              Unit
            </th>
            <th colSpan={2}>Amount</th>
            <th className={acc.cellIcsDesc} rowSpan={2}>
              Description
            </th>
            <th className={acc.cellIcsItemNo} rowSpan={2}>
              Inventory Item No.
            </th>
            <th className={acc.cellIcsLife} rowSpan={2}>
              Estimated Useful Life
            </th>
          </tr>
          <tr>
            <th className={acc.cellIcsUnitCost}>Unit Cost</th>
            <th className={acc.cellIcsTotalCost}>Total Cost</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={`item-${i}`}>
              <td className={acc.cellCenter}>{row.qty}</td>
              <td className={acc.cellCenter}>{row.unit}</td>
              <td style={{ textAlign: "right" }}>{row.unitCost}</td>
              <td style={{ textAlign: "right" }}>{row.totalCost}</td>
              <td>{row.description}</td>
              <td className={acc.cellCenter}>{row.itemNo}</td>
              <td className={acc.cellCenter}>{row.life}</td>
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
              <td>&nbsp;</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className={acc.bottomGrid}>
        <section className={acc.bottomLeft}>
          <p className={acc.bottomTitle}>Received from:</p>
          <div className={acc.bottomBody}>
            <div className={acc.sig}>
              <p className={acc.sigName}>{fromName}</p>
              <p className={acc.sigLabel}>Signature Over Printed Name</p>
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
        <section className={acc.bottomRight}>
          <p className={acc.bottomTitle}>Received by:</p>
          <div className={acc.bottomBody}>
            <div className={acc.sig} style={{ marginTop: 12 }}>
              <p className={acc.sigName}>{toName}</p>
              <p className={acc.sigLabel}>Signature Over Printed Name</p>
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
      </div>
    </article>
  );
}
