import type { Metadata } from "next";
import { getDeliveryForInspection, getIarRecords } from "../../actions";
import { ReceiptActions } from "../../components/receipt-actions";
import receipt from "../../components/receipt.module.css";
import iar from "./iar.module.css";
import { IarRemoveButton } from "@/components/personnel/IarAttach";

export const metadata: Metadata = {
  title: "Inspection & Acceptance Report",
};

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

function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  });
}

function recordTone(result: string | null) {
  if (result === "passed") return "ok";
  if (result === "failed") return "bad";
  if (result === "partial") return "warn";
  return "info";
}

function Box({ checked }: { checked: boolean }) {
  return (
    <span className={iar.checkbox} aria-hidden="true">
      {checked ? "✓" : ""}
    </span>
  );
}

export default async function IarReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    entity?: string;
    department?: string;
    rcCode?: string;
    fundCluster?: string;
    iarNo?: string;
    iarDate?: string;
    invoiceNo?: string;
    invoiceDate?: string;
    record?: string;
  }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const delivery = await getDeliveryForInspection(id);
  const inspection = delivery.inspection_data;
  const deliveryRef = delivery.id.slice(0, 8).toUpperCase();

  // Every generate / attach is a timestamped record; ?record= views one.
  const records = await getIarRecords(id);
  const selected = sp.record
    ? (records.find((r) => r.id === sp.record) ?? records[0] ?? null)
    : (records[0] ?? null);

  let scanUrl = "";
  let header = {
    entity: "",
    department: "",
    rcCode: "",
    fundCluster: "",
    iarNo: "",
    iarDate: "",
    invoiceNo: "",
    invoiceDate: "",
  };
  let viewInspector = inspection?.inspector_name ?? "";
  let viewInspectDate = inspection?.inspection_date ?? "";

  if (selected) {
    viewInspector = selected.inspector_name ?? viewInspector;
    viewInspectDate = selected.inspection_date ?? viewInspectDate;
    if (selected.kind === "attached" && selected.iar_image_url) {
      scanUrl = selected.iar_image_url;
    } else {
      const d = (selected.iar_data ?? {}) as Record<string, string>;
      header = {
        entity: val(d.entity),
        department: val(d.department),
        rcCode: val(d.rcCode),
        fundCluster: val(d.fundCluster),
        iarNo: val(selected.iar_no),
        iarDate: selected.iar_date ?? "",
        invoiceNo: val(selected.iar_invoice_no),
        invoiceDate: selected.iar_invoice_date ?? "",
      };
    }
  } else {
    // Legacy AIRs saved before the history feature (or dialog params).
    const savedIar = (inspection?.iar_data ?? {}) as Record<string, string>;
    header = {
      entity: val(savedIar.entity ?? sp.entity),
      department: val(savedIar.department ?? sp.department),
      rcCode: val(savedIar.rcCode ?? sp.rcCode),
      fundCluster: val(savedIar.fundCluster ?? sp.fundCluster),
      iarNo: val(inspection?.iar_no ?? sp.iarNo),
      iarDate: inspection?.iar_date ?? sp.iarDate ?? "",
      invoiceNo: val(inspection?.iar_invoice_no ?? sp.invoiceNo),
      invoiceDate: inspection?.iar_invoice_date ?? sp.invoiceDate ?? "",
    };
    scanUrl = inspection?.iar_image_url ?? "";
  }

  const hasScan = scanUrl !== "";
  const view = hasScan ? "scan" : "form";

  const itemChecks = inspection?.item_checks ?? [];
  const checkFor = (itemId: string) => itemChecks.find((c) => c.itemId === itemId);

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

  const passed = (inspection?.result ?? delivery.inspection_status) === "passed";
  const complete = delivery.delivery_status === "complete";
  const partial = delivery.delivery_status === "partial";

  const excelParams = new URLSearchParams({
    entity: header.entity,
    department: header.department,
    rcCode: header.rcCode,
    fundCluster: header.fundCluster,
    iarNo: header.iarNo,
    iarDate: header.iarDate,
    invoiceNo: header.invoiceNo,
    invoiceDate: header.invoiceDate,
  });

  return (
    <div className={receipt.page}>
      <ReceiptActions
        deliveryId={delivery.id}
        excelHref={
          view === "form"
            ? `/api/personnel/inspections/${delivery.id}/air-xlsx?${excelParams.toString()}`
            : undefined
        }
      >
        {view === "scan" ? (
          <IarRemoveButton
            deliveryId={delivery.id}
            recordId={selected?.id}
            imageUrl={scanUrl}
          />
        ) : null}
      </ReceiptActions>

      {!inspection ? (
        <p className={iar.unsavedBanner} role="alert">
          No saved inspection for this delivery yet — Date Inspected and the
          Inspection Officer will be blank. Go back and click Record Inspection
          first.
        </p>
      ) : null}

      {view === "scan" ? (
        <figure className={iar.scanWrap}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={scanUrl}
            alt={`Attached IAR scan for delivery ${deliveryRef}`}
            className={iar.scanImg}
          />
          <figcaption className={iar.scanCap}>
            Attached IAR scan{header.iarNo ? ` — ${header.iarNo}` : ""} ·{" "}
            <a href={scanUrl} target="_blank" rel="noreferrer">
              Open full size
            </a>
          </figcaption>
        </figure>
      ) : (
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
      )}

      {records.length > 0 ? (
        <section className={iar.history} aria-label="Previous AIRs">
          <h2 className={iar.historyTitle}>
            Previous AIRs ({records.length})
          </h2>
          <ul className={iar.historyList}>
            {records.map((r) => {
              const isCurrent = selected?.id === r.id;
              const result = r.inspection_result
                ? r.inspection_result.charAt(0).toUpperCase() +
                  r.inspection_result.slice(1)
                : "—";
              return (
                <li
                  key={r.id}
                  className={iar.historyItem}
                  data-current={isCurrent}
                >
                  <span
                    className={iar.historyKind}
                    data-kind={r.kind === "attached" ? "scan" : "form"}
                  >
                    {r.kind === "attached" ? "Attached" : "Generated"}
                  </span>
                  <span className={iar.historyMain}>
                    {r.iar_no ?? "Attached scan"}
                  </span>
                  <span className={iar.historyMeta}>
                    <span
                      className={iar.historyResult}
                      data-tone={recordTone(r.inspection_result)}
                    >
                      {result}
                    </span>
                    {" · "}
                    {r.inspector_name ?? "—"}
                    {" · inspected "}
                    {fmt(r.inspection_date)}
                  </span>
                  <span className={iar.historyTime}>
                    {r.kind === "attached" ? "Attached " : "Generated "}
                    {fmtDateTime(r.created_at)}
                  </span>
                  {isCurrent ? (
                    <span className={iar.historyCurrent}>Viewing</span>
                  ) : (
                    <a
                      className={iar.historyView}
                      href={`/personnel/inspections/${delivery.id}/iar?record=${r.id}`}
                    >
                      View
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
