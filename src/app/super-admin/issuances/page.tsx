"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { browseIssuance, browseIssuances } from "../browse/actions";
import type { IssuanceDetail } from "@/app/personnel/issuances/actions";
import { useCachedAction } from "@/hooks/use-cached-action";
import { useReceipt } from "@/hooks/use-receipt";
import { CLIENT_CACHE_KEYS } from "@/lib/client-cache";
import { Card } from "@/components/ui/card";
import { ReceiptLoading } from "@/components/personnel/ReceiptLoading";
import { ReceiptOverlay } from "@/app/personnel/documents/receipt-overlay";
import { ParReportSheet } from "@/app/personnel/documents/par-report";
import { IcsReportSheet } from "@/app/personnel/documents/ics-report";
import receipt from "@/app/personnel/inspections/components/receipt.module.css";
import IssuancesLoading from "./loading";
import styles from "@/app/personnel/dashboard/page.module.css";
import air from "@/app/personnel/inspections/air-section.module.css";

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
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(n);
}

export default function SuperAdminIssuancesPage() {
  // Same client caching as the personnel issuances page: back-navigation
  // paints instantly from memory / sessionStorage and only revalidates
  // silently when stale (30s, matching the server list cache).
  const { data: cached, loading } = useCachedAction(
    CLIENT_CACHE_KEYS.adminIssuances,
    browseIssuances,
    { staleTime: 30_000 }
  );
  const [view, setView] = useState<"table" | "grid">("table");
  // Overlay receipt viewer with per-record client caching (same shared
  // scheme as personnel — admin-prefixed keys keep per-role caches
  // separate): viewing a receipt opens a modal, not a new page.
  const viewer = useReceipt<IssuanceDetail | null>();
  const openReceipt = (id: string) =>
    viewer.open(id, `admin-issuance:${id}`, () => browseIssuance(id));
  const rows = useMemo(() => cached ?? [], [cached]);

  if (loading) {
    return <IssuancesLoading />;
  }

  const doc = viewer.doc ?? null;
  const isIcs = doc?.doc_type === "ICS";
  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Super Admin / Issuances</p>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>PAR / ICS Issuances</h1>
          <p className={styles.subtitle}>
            {rows.length} {rows.length === 1 ? "record" : "records"} · value
            over ₱50,000 → PAR, ₱50,000 or less → ICS · every issuance from all
            personnel
          </p>
        </div>
        <div className={styles.actions}>
          <div
            className={air.tabs}
            role="group"
            aria-label="Change layout"
          >
            {(["table", "grid"] as const).map((v) => (
              <button
                key={v}
                type="button"
                className={air.tab}
                data-active={view === v}
                aria-pressed={view === v}
                onClick={() => setView(v)}
              >
                {v === "table" ? "Table" : "Grid"}
              </button>
            ))}
          </div>
        </div>
      </div>
      <Card className={styles.panel}>
        {rows.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.panelSub}>
              No PAR/ICS records yet — they appear here once personnel issue
              items with a signed PAR or ICS.
            </p>
          </div>
        ) : view === "table" ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Doc</th>
                  <th>No.</th>
                  <th>Employee</th>
                  <th>Logged By</th>
                  <th>Item</th>
                  <th>Qty</th>
                  <th>Total</th>
                  <th>Date</th>
                  <th>Report</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <span className={styles.status} data-tone={r.doc_type === "PAR" ? "ok" : "info"}>
                        {r.doc_type}
                      </span>
                    </td>
                    <td>{r.doc_no ?? "—"}</td>
                    <td>{r.employee_name}</td>
                    <td>{r.logged_by ?? "—"}</td>
                    <td>{r.item_label}</td>
                    <td>{r.quantity}</td>
                    <td>{peso(r.total_amount)}</td>
                    <td>{fmt(r.doc_date)}</td>
                    <td>
                      <button
                        type="button"
                        className={`${styles.inspectLinkSecondary} cursor-pointer`}
                        onClick={() => openReceipt(r.id)}
                      >
                        View {r.doc_type}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={air.grid}>
            {rows.map((r) => (
              <article key={r.id} className={air.card}>
                <div className={air.cardTop}>
                  <span className={air.ref}>{r.doc_no ?? r.doc_type}</span>
                  <span className={air.chips}>
                    <span
                      className={styles.status}
                      data-tone={r.doc_type === "PAR" ? "ok" : "info"}
                    >
                      {r.doc_type}
                    </span>
                  </span>
                </div>
                <dl className={air.meta}>
                  <div>
                    <dt>Employee</dt>
                    <dd>{r.employee_name}</dd>
                  </div>
                  <div>
                    <dt>Logged by</dt>
                    <dd>{r.logged_by ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Date</dt>
                    <dd>{fmt(r.doc_date)}</dd>
                  </div>
                  <div>
                    <dt>Quantity</dt>
                    <dd>{r.quantity}</dd>
                  </div>
                  <div>
                    <dt>Total</dt>
                    <dd>{peso(r.total_amount)}</dd>
                  </div>
                  <div className={air.metaFull}>
                    <dt>Item</dt>
                    <dd>{r.item_label}</dd>
                  </div>
                </dl>
                <div className={air.actions}>
                  <button
                    type="button"
                    className={`${air.primary} cursor-pointer`}
                    onClick={() => openReceipt(r.id)}
                  >
                    View {r.doc_type}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </Card>

      <ReceiptOverlay
        open={viewer.selectedId !== null}
        title={
          isIcs ? "Inventory Custodian Slip" : "Property Acknowledgment Receipt"
        }
        onClose={viewer.close}
      >
        {viewer.docLoading ? (
          <ReceiptLoading label="Loading report…" />
        ) : !doc ? (
          <div className={styles.emptyState}>
            <p className={styles.panelSub}>
              This record is no longer available.
            </p>
          </div>
        ) : (
          <div className={receipt.receiptStack} style={{ maxWidth: "none" }}>
            {isIcs ? (
              <IcsReportSheet issuance={doc} />
            ) : (
              <ParReportSheet issuance={doc} />
            )}
            <p className={styles.panelSub}>
              <Link
                href={`/super-admin/issuances/${doc.id}`}
                className={styles.inspectLinkSecondary}
              >
                Open full report
              </Link>{" "}
              ·{" "}
              <a
                href={`/api/personnel/issuances/${doc.id}/${isIcs ? "ics-xlsx" : "par-xlsx"}`}
                className={styles.inspectLinkSecondary}
              >
                Download Excel
              </a>
            </p>
          </div>
        )}
      </ReceiptOverlay>
    </section>
  );
}
