import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { browseIssuance, browseIssuances } from "../../browse/actions";
import { AdminToolbar } from "@/components/super-admin/BrowseTable";
import { fmtDate } from "@/lib/format";
import { ParReportSheet } from "@/app/personnel/documents/par-report";
import { IcsReportSheet } from "@/app/personnel/documents/ics-report";
import receipt from "@/app/personnel/inspections/components/receipt.module.css";
import acc from "@/app/personnel/issuances/issuance.module.css";

export const metadata: Metadata = {
  title: "PAR / ICS Report (Oversight)",
};

export default async function SuperAdminIssuanceReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const issuance = await browseIssuance(id);
  if (!issuance) notFound();

  const isPar = issuance.doc_type === "PAR";

  const others = (await browseIssuances())
    .filter(
      (r) =>
        r.id !== issuance.id &&
        (r.employee_id === issuance.employee_id ||
          (issuance.asset_id !== null && r.asset_id === issuance.asset_id) ||
          (issuance.inventory_id !== null && r.inventory_id === issuance.inventory_id))
    )
    .slice(0, 10);

  return (
    <div className={receipt.page}>
      <AdminToolbar backHref="/super-admin/issuances" backLabel="PAR / ICS" />

      {isPar ? (
        <ParReportSheet issuance={issuance} />
      ) : (
        <IcsReportSheet issuance={issuance} />
      )}

      {others.length > 0 ? (
        <section className={acc.history} aria-label="Related issuances">
          <h2 className={acc.historyTitle}>
            Related issuances ({others.length})
          </h2>
          <ul className={acc.historyList}>
            {others.map((r) => (
              <li key={r.id} className={acc.historyItem}>
                <Link href={`/super-admin/issuances/${r.id}`}>
                  {r.doc_type}
                  {r.doc_no ? ` ${r.doc_no}` : ""} · {r.employee_name} · {fmtDate(r.created_at)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
