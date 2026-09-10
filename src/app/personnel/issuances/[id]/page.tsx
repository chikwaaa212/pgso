import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getIssuance, getIssuances } from "../actions";
import { ParReportSheet } from "../../documents/par-report";
import { IcsReportSheet } from "../../documents/ics-report";
import { IssuanceToolbar } from "./toolbar";
import receipt from "../../inspections/components/receipt.module.css";
import acc from "../issuance.module.css";

export const metadata: Metadata = {
  title: "PAR / ICS Accountability Report",
};

function fmt(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  });
}

export default async function IssuanceReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const issuance = await getIssuance(id);
  if (!issuance) notFound();

  const isPar = issuance.doc_type === "PAR";

  const others = (await getIssuances())
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
      <IssuanceToolbar
        issuanceId={issuance.id}
        docType={issuance.doc_type}
        imageUrl={issuance.image_url}
      />

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
              <li
                key={r.id}
                className={acc.historyItem}
                data-current={false}
              >
                <span
                  className={acc.historyKind}
                  data-kind={r.doc_type === "PAR" ? "form" : "scan"}
                >
                  {r.doc_type}
                </span>
                <span className={acc.historyMain}>
                  {r.doc_no ?? "Signed scan"}
                </span>
                <span className={acc.historyMeta}>
                  {r.employee_name} · {r.item_label} · {fmt(r.doc_date)}
                </span>
                <a
                  className={acc.historyView}
                  href={`/personnel/issuances/${r.id}`}
                >
                  View
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
