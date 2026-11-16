import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Banknote,
  Calendar,
  FileText,
  Hash,
  Layers,
  Package,
  User,
} from "lucide-react";
import { getIssuance, getIssuances } from "../actions";
import { ParReportSheet } from "../../documents/par-report";
import { IcsReportSheet } from "../../documents/ics-report";
import { IssuanceToolbar } from "./toolbar";
import styles from "./report.module.css";

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

function peso(n: number | null | undefined) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(n);
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
  const docTitle = isPar
    ? "Property Acknowledgement Receipt"
    : "Inventory Custodian Slip";

  // Consolidated approvals keep every line in issuance_data.lines; single-line
  // documents fall back to the record columns.
  const rawLines = (issuance.issuance_data as { lines?: unknown } | null)?.lines;
  const lines = Array.isArray(rawLines)
    ? (rawLines as Array<{ quantity?: number; total?: number }>)
    : null;
  const lineCount = lines?.length ?? 1;
  const quantity = lines
    ? lines.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0)
    : issuance.quantity;
  const totalValue =
    issuance.total_amount ??
    (lines
      ? lines.reduce((sum, l) => sum + (Number(l.total) || 0), 0)
      : null);

  const others = (await getIssuances())
    .filter(
      (r) =>
        r.id !== issuance.id &&
        (r.employee_id === issuance.employee_id ||
          (issuance.asset_id !== null && r.asset_id === issuance.asset_id) ||
          (issuance.inventory_id !== null &&
            r.inventory_id === issuance.inventory_id))
    )
    .slice(0, 8);

  const facts: { key: string; value: string; muted?: boolean }[] = [
    { key: "Document type", value: isPar ? "PAR" : "ICS" },
    { key: "Document no.", value: issuance.doc_no ?? "Signed scan" },
    { key: "Document date", value: fmt(issuance.doc_date) },
    { key: "Received by", value: issuance.employee_name },
    { key: "Item", value: issuance.item_label },
    { key: "Quantity", value: String(quantity) },
    { key: "Total value", value: peso(totalValue) },
    {
      key: "Signed scan",
      value: issuance.image_url ? "Attached" : "Not attached",
      muted: !issuance.image_url,
    },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.headerMain}>
            <Link href="/personnel/issuances" className={styles.back}>
              <ArrowLeft size={13} aria-hidden="true" />
              All issuances
            </Link>
            <div className={styles.headline}>
              <span
                className={styles.docIcon}
                data-kind={issuance.doc_type}
                aria-hidden="true"
              >
                <FileText size={20} />
              </span>
              <div className={styles.headlineText}>
                <div className={styles.titleRow}>
                  <h1 className={styles.title}>{docTitle}</h1>
                  <span className={styles.docTag} data-kind={issuance.doc_type}>
                    {issuance.doc_type}
                  </span>
                </div>
                <div className={styles.metaRow}>
                  <span className={styles.meta}>
                    <Hash size={12} aria-hidden="true" />
                    <strong>{issuance.doc_no ?? "Signed scan"}</strong>
                  </span>
                  <span className={styles.metaDot} aria-hidden="true" />
                  <span className={styles.meta}>
                    <User size={12} aria-hidden="true" />
                    {issuance.employee_name}
                  </span>
                  <span className={styles.metaDot} aria-hidden="true" />
                  <span className={styles.meta}>
                    <Calendar size={12} aria-hidden="true" />
                    {fmt(issuance.doc_date)}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <IssuanceToolbar
            issuanceId={issuance.id}
            docType={issuance.doc_type}
            imageUrl={issuance.image_url}
          />
        </header>

        <div className={styles.summary}>
          <div className={styles.tile}>
            <p className={styles.tileLabel}>
              <Banknote size={12} aria-hidden="true" />
              Document value
            </p>
            <p className={styles.tileValue}>{peso(totalValue)}</p>
            <p className={styles.tileMeta}>
              {isPar ? "PAR threshold: over ₱50,000" : "ICS threshold: ₱50,000 and below"}
            </p>
          </div>
          <div className={styles.tile}>
            <p className={styles.tileLabel}>
              <Package size={12} aria-hidden="true" />
              Quantity issued
            </p>
            <p className={styles.tileValue}>{quantity}</p>
            <p className={styles.tileMeta}>
              {lineCount} line{lineCount === 1 ? "" : "s"} on this document
            </p>
          </div>
          <div className={styles.tile}>
            <p className={styles.tileLabel}>
              <Layers size={12} aria-hidden="true" />
              Accountability
            </p>
            <p className={styles.tileValue}>{issuance.doc_type}</p>
            <p className={styles.tileMeta}>
              {issuance.image_url
                ? "Signed copy attached"
                : "Generated form — no scan yet"}
            </p>
          </div>
        </div>

        <div className={styles.layout}>
          <div className={styles.docColumn}>
            <div className={styles.paper}>
              {isPar ? (
                <ParReportSheet issuance={issuance} />
              ) : (
                <IcsReportSheet issuance={issuance} />
              )}
            </div>
          </div>

          <aside className={styles.side}>
            <section className={styles.card} aria-label="Document details">
              <h2 className={styles.cardTitle}>
                <FileText
                  size={13}
                  aria-hidden="true"
                  style={{ display: "inline", marginRight: 6, verticalAlign: "-1px" }}
                />
                Document details
              </h2>
              <dl className={styles.facts}>
                {facts.map((f) => (
                  <div className={styles.factRow} key={f.key}>
                    <dt className={styles.factKey}>{f.key}</dt>
                    <dd
                      className={
                        f.muted
                          ? `${styles.factValue} ${styles.factMuted}`
                          : styles.factValue
                      }
                    >
                      {f.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className={styles.card} aria-label="Related issuances">
              <h2 className={styles.cardTitle}>
                Related issuances ({others.length})
              </h2>
              {others.length === 0 ? (
                <p className={styles.emptyRelated}>
                  No other PAR or ICS records for this employee or item yet.
                </p>
              ) : (
                <ul className={styles.related}>
                  {others.map((r) => (
                    <li key={r.id} className={styles.relatedItem}>
                      <span className={styles.relatedKind} data-kind={r.doc_type}>
                        {r.doc_type}
                      </span>
                      <span className={styles.relatedBody}>
                        <span className={styles.relatedMain}>
                          {r.doc_no ?? "Signed scan"}
                        </span>
                        <span className={styles.relatedMeta}>
                          {r.employee_name} · {fmt(r.doc_date)}
                        </span>
                      </span>
                      <Link
                        href={`/personnel/issuances/${r.id}`}
                        className={styles.relatedOpen}
                      >
                        Open
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
