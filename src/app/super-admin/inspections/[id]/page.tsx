import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { browseInspection } from "../../browse/actions";
import {
  AdminToolbar,
  StatusPill,
} from "@/components/super-admin/BrowseTable";
import { fmtDate } from "@/lib/format";
import { InspectionReceipt } from "@/app/personnel/inspections/components/inspection-receipt";
import { label } from "@/lib/labels";
import tableStyles from "../../users/page.module.css";
import sectionStyles from "../page.module.css";

export const runtime = "nodejs";

export const metadata = {
  title: "Inspection Detail (Oversight)",
};

export default async function SuperAdminInspectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await browseInspection(id);
  if (!detail) notFound();
  const { delivery, history, iar } = detail;
  const inspection = delivery.inspection_data;

  return (
    <section className={sectionStyles.section}>
      <p className={sectionStyles.crumb}>Super Admin / Inspections / {delivery.id.slice(0, 8).toUpperCase()}</p>
      <AdminToolbar backHref="/super-admin/inspections" backLabel="Inspections" />
      <div>
        <h1 className={sectionStyles.title}>Inspection detail</h1>
        <p className={sectionStyles.subtitle}>
          {delivery.supplier ?? "Unknown supplier"} · {delivery.po_reference ?? "no PO"} ·{" "}
          <StatusPill value={delivery.inspection_status} /> · read-only
        </p>
      </div>

      <Card className={sectionStyles.panel}>
        <h2 className={sectionStyles.panelTitle}>Inspection history</h2>
        {history.length === 0 ? (
          <p className={sectionStyles.panelSub}>No inspections recorded for this delivery yet.</p>
        ) : (
          <div className={tableStyles.tableWrap}>
            <table className={tableStyles.table}>
              <thead>
                <tr>
                  <th>Inspector</th>
                  <th>Date</th>
                  <th>Result</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td>{h.inspector_name ?? "—"}</td>
                    <td>{fmtDate(h.inspection_date)}</td>
                    <td>
                      <StatusPill value={h.result} />
                    </td>
                    <td style={{ whiteSpace: "normal", minWidth: "14rem" }}>{h.remarks ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {inspection ? (
        <Card className={sectionStyles.panel}>
          <h2 className={sectionStyles.panelTitle}>Inspection receipt</h2>
          <p className={sectionStyles.panelSub}>Printable record as filed by personnel.</p>
          <InspectionReceipt delivery={delivery} inspection={inspection} />
        </Card>
      ) : null}

      <Card className={sectionStyles.panel}>
        <h2 className={sectionStyles.panelTitle}>IAR records ({iar.length})</h2>
        {iar.length === 0 ? (
          <p className={sectionStyles.panelSub}>No inspection & acceptance reports filed yet.</p>
        ) : (
          <div className={tableStyles.tableWrap}>
            <table className={tableStyles.table}>
              <thead>
                <tr>
                  <th>Kind</th>
                  <th>IAR no.</th>
                  <th>IAR date</th>
                  <th>Invoice</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {iar.map((r) => (
                  <tr key={r.id}>
                    <td>{label(r.kind)}</td>
                    <td>{r.iar_no ?? "—"}</td>
                    <td>{fmtDate(r.iar_date)}</td>
                    <td>{r.iar_invoice_no ?? "—"}</td>
                    <td>
                      <StatusPill value={r.inspection_result} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </section>
  );
}
