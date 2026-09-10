"use client";

import type {
  DeliveryForInspection,
  IarRecordRow,
} from "../inspections/actions";
import iar from "../inspections/[id]/iar/iar.module.css";

function fmt(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  });
}

function val(v: string | null | undefined) {
  return v?.trim() ? v.trim() : "";
}

function Box({ checked }: { checked: boolean }) {
  return (
    <span className={iar.checkbox} aria-hidden="true">
      {checked ? "✓" : ""}
    </span>
  );
}

/** The same Appendix-62 IAR sheet shown on the IAR page, for overlays. */
export function IarReportSheet({
  delivery,
  record,
}: {
  delivery: DeliveryForInspection;
  record: IarRecordRow;
}) {
  const deliveryRef = delivery.id.slice(0, 8).toUpperCase();
  const inspection = delivery.inspection_data;

  if (record.kind === "attached" && record.iar_image_url) {
    return (
      <figure className={iar.scanWrap}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={record.iar_image_url}
          alt={`Attached IAR scan for delivery ${deliveryRef}`}
          className={iar.scanImg}
        />
        <figcaption className={iar.scanCap}>
          Attached IAR scan{record.iar_no ? ` — ${record.iar_no}` : ""} ·{" "}
          <a href={record.iar_image_url} target="_blank" rel="noreferrer">
            Open full size
          </a>
        </figcaption>
      </figure>
    );
  }

  const d = (record.iar_data ?? {}) as Record<string, string>;
  const header = {
    entity: val(d.entity),
    department: val(d.department),
    rcCode: val(d.rcCode),
    fundCluster: val(d.fundCluster),
    iarNo: val(record.iar_no),
    iarDate: record.iar_date ?? "",
    invoiceNo: val(record.iar_invoice_no),
    invoiceDate: record.iar_invoice_date ?? "",
  };

  const viewInspector =
    record.inspector_name ?? inspection?.inspector_name ?? "";
  const viewInspectDate =
    record.inspection_date ?? inspection?.inspection_date ?? "";

  const itemChecks = inspection?.item_checks ?? [];
  const checkFor = (itemId: string) =>
    itemChecks.find((c) => c.itemId === itemId);

  const rows = delivery.items.map((item, i) => {
    const check = checkFor(item.id);
    return {
      key: item.id,
      stockNo: val(delivery.account_code) || "",
      description: item.item_name,
      unit: item.unit ?? "",
      qty: check?.actualQty ?? item.quantity,
      index: i,
    };
  });

  // Keep the ruled look of AIR FORM (1).xls — pad with blank rows for handwriting.
  const MIN_ROWS = 12;
  const blanks = Math.max(0, MIN_ROWS - rows.length);

  const poDate = delivery.po_reference
    ? `${delivery.po_reference}${delivery.date_delivered ? ` / ${fmt(delivery.date_delivered)}` : ""}`
    : fmt(delivery.date_delivered);

  const passed =
    (record.inspection_result ?? inspection?.result ?? delivery.inspection_status) ===
    "passed";
  const complete = delivery.delivery_status === "complete";
  const partial = delivery.delivery_status === "partial";

  return (
    <article className={iar.airSheet} aria-label="Inspection and Acceptance Report">
      <p className={iar.appendix}>Appendix 62</p>
      <h1 className={iar.title}>INSPECTION AND ACCEPTANCE REPORT</h1>

      {/* ── Header: matches AIR FORM (1).xls left/right columns ── */}
      <div className={iar.headerGrid}>
        <div className={iar.headerColLeft}>
          <div className={iar.field}>
            <span className={iar.fieldLabel}>Entity Name :</span>
            <span className={iar.fieldValue}>{header.entity}</span>
          </div>
          <div className={iar.field}>
            <span className={iar.fieldLabel}>Supplier :</span>
            <span className={iar.fieldValue}>{val(delivery.supplier)}</span>
          </div>
          <div className={iar.field}>
            <span className={iar.fieldLabel}>PO No./Date :</span>
            <span className={iar.fieldValue}>{val(poDate)}</span>
          </div>
          <div className={iar.field}>
            <span className={iar.fieldLabel}>Requisitioning Office/Dept. :</span>
            <span className={iar.fieldValue}>{header.department}</span>
          </div>
          <div className={iar.field}>
            <span className={iar.fieldLabel}>Responsibility Center Code :</span>
            <span className={iar.fieldValue}>{header.rcCode}</span>
          </div>
        </div>

        <div className={iar.headerColRight}>
          <div className={iar.field}>
            <span className={iar.fieldLabel}>Fund Cluster :</span>
            <span className={iar.fieldValue}>{header.fundCluster}</span>
          </div>
          <div className={iar.field}>
            <span className={iar.fieldLabel}>IAR No. :</span>
            <span className={iar.fieldValue}>{header.iarNo}</span>
          </div>
          <div className={iar.field}>
            <span className={iar.fieldLabel}>Date :</span>
            <span className={iar.fieldValue}>{fmt(header.iarDate)}</span>
          </div>
          <div className={iar.field}>
            <span className={iar.fieldLabel}>Invoice No. :</span>
            <span className={iar.fieldValue}>{header.invoiceNo}</span>
          </div>
          <div className={iar.field}>
            <span className={iar.fieldLabel}>Date :</span>
            <span className={iar.fieldValue}>{fmt(header.invoiceDate)}</span>
          </div>
        </div>
      </div>

      {/* ── Items ── */}
      <table className={iar.itemsTable}>
        <thead>
          <tr>
            <th className={`${iar.cellCenter} ${iar.cellStock}`}>
              Stock/
              <br />
              Property No.
            </th>
            <th className={iar.cellDesc}>Description</th>
            <th className={`${iar.cellCenter} ${iar.cellUnit}`}>Unit</th>
            <th className={`${iar.cellCenter} ${iar.cellQty}`}>Quantity</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td className={iar.cellCenter}>{r.stockNo}</td>
              <td>{r.description}</td>
              <td className={iar.cellCenter}>{r.unit}</td>
              <td className={iar.cellCenter}>{r.qty}</td>
            </tr>
          ))}
          {Array.from({ length: blanks }).map((_, i) => (
            <tr key={`blank-${i}`}>
              <td>&nbsp;</td>
              <td>&nbsp;</td>
              <td>&nbsp;</td>
              <td>&nbsp;</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── Inspection / Acceptance ── */}
      <div className={iar.bottomGrid}>
        <section className={iar.bottomLeft}>
          <p className={iar.bottomTitle}>INSPECTION</p>
          <div className={iar.bottomBody}>
            <div className={iar.field}>
              <span className={iar.fieldLabel}>Date Inspected :</span>
              <span className={iar.fieldValue}>{fmt(viewInspectDate)}</span>
            </div>
            <div className={iar.checkRow}>
              <Box checked={passed} />
              <span>Inspected, verified and found in order as to quantity and specifications</span>
            </div>
            <div className={iar.sig}>
              <p className={iar.sigName}>{viewInspector}</p>
              <p className={iar.sigLabel}>Inspection Officer/Inspection Committee</p>
            </div>
          </div>
        </section>

        <section className={iar.bottomRight}>
          <p className={iar.bottomTitle}>ACCEPTANCE</p>
          <div className={iar.bottomBody}>
            <div className={iar.field}>
              <span className={iar.fieldLabel}>Date Received :</span>
              <span className={iar.fieldValue}>{fmt(delivery.date_delivered)}</span>
            </div>
            <div className={iar.checkRow}>
              <Box checked={complete} />
              <span>Complete</span>
            </div>
            <div className={iar.checkRow}>
              <Box checked={partial} />
              <span>Partial (pls. specify quantity)</span>
            </div>
            <div className={iar.sig}>
              <p className={iar.sigName}>{delivery.recipient_name ?? ""}</p>
              <p className={iar.sigLabel}>Supply and/or Property Custodian</p>
            </div>
          </div>
        </section>
      </div>
    </article>
  );
}
