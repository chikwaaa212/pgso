"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { getIssuance, type IssuanceDetail } from "../../issuances/actions";
import { RepairReceipt } from "../../repairs/repair-receipt";
import { ParReportSheet } from "../../documents/par-report";
import { IcsReportSheet } from "../../documents/ics-report";
import { ReceiptOverlay } from "../../documents/receipt-overlay";
import receipt from "../../inspections/components/receipt.module.css";
import styles from "../../dashboard/page.module.css";
import type { AssetHistory, UnifiedAssetRow } from "../actions";

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  });
}

function repairTone(status: string | null) {
  if (status === "completed") return "ok";
  if (status === "in_progress") return "info";
  return "warn";
}

function repairLabel(status: string | null) {
  if (!status) return "—";
  return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");
}

export function AssetHistorySection({
  asset,
  history,
}: {
  asset: UnifiedAssetRow;
  history: AssetHistory;
}) {
  const [repairId, setRepairId] = useState<string | null>(null);
  const [issuanceId, setIssuanceId] = useState<string | null>(null);
  const [issuanceDoc, setIssuanceDoc] = useState<IssuanceDetail | null>(null);
  const [issuanceLoading, setIssuanceLoading] = useState(false);

  const activeRepair =
    history.repairs.find((r) => r.id === repairId) ?? null;

  function openIssuance(id: string) {
    setIssuanceId(id);
    setIssuanceDoc(null);
    setIssuanceLoading(true);
    void getIssuance(id).then((detail) => {
      setIssuanceDoc(detail);
      setIssuanceLoading(false);
    });
  }

  const ref = asset.id.slice(0, 8).toUpperCase();
  const hasEvents =
    history.issuances.length > 0 ||
    history.repairs.length > 0 ||
    history.requests.length > 0;

  return (
    <Card className={styles.panel}>
      <h2 className={styles.panelTitle}>History</h2>
      <p className={styles.panelSub}>
        Every assignment and repair for this asset — each opens its receipt.
      </p>

      {!hasEvents && !history.assignedToName ? (
        <div className={styles.emptyState}>
          <p className={styles.panelSub}>
            No assignments or repairs recorded for this asset yet.
          </p>
        </div>
      ) : (
        <article className={receipt.receipt}>
          <div className={receipt.receiptInner}>
            {/* ── Masthead ─────────────────────────────────────────── */}
            <header className={receipt.masthead}>
              <p className={receipt.orgName}>PGSO</p>
              <p className={receipt.orgSub}>Property &amp; Supply Management</p>
              <p className={receipt.docTitle}>*** ASSET HISTORY ***</p>
              <p className={receipt.docSub}>
                ASSET RECORD — {ref}
              </p>
            </header>

            <div className={receipt.divider} />

            {/* ── Asset identity ───────────────────────────────────── */}
            <p className={receipt.sectionTitle}>ASSET</p>
            <dl className={receipt.rows}>
              {[
                ["Article", asset.article ?? asset.description ?? "—"],
                ["Account Code", asset.account_code ?? "—"],
                ["Property No.", asset.qr_code ?? "—"],
                ["Asset Type", asset.category ?? "—"],
                ["Location", asset.location ?? "—"],
                [
                  "Status",
                  asset.status === "available" && history.assignedToName
                    ? `ASSIGNED — ${history.assignedToName}`
                    : (asset.status ?? "—").toUpperCase(),
                ],
                [
                  "Current Holder",
                  history.assignedToName ?? "AVAILABLE — NOT ASSIGNED",
                ],
              ].map(([labelText, value]) => (
                <div key={labelText} className={receipt.row}>
                  <dt>{labelText}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>

            <div className={receipt.divider} />

            {/* ── Assignment history ───────────────────────────────── */}
            <p className={receipt.sectionTitle}>
              ASSIGNMENT HISTORY ({history.issuances.length})
            </p>
            {history.issuances.length === 0 ? (
              <p className={receipt.remarksLabel}>
                <span className={receipt.remarks}>Never assigned.</span>
              </p>
            ) : (
              <dl className={receipt.rows}>
                {history.issuances.map((r) => (
                  <div key={r.id} className={receipt.row}>
                    <dt>
                      {r.doc_type}
                      {r.doc_no ? ` ${r.doc_no}` : ""} · {fmtDate(r.doc_date)}
                    </dt>
                    <dd>
                      {r.employee_name}{" "}
                      <button
                        type="button"
                        className={`${styles.inspectLinkSecondary} cursor-pointer`}
                        onClick={() => openIssuance(r.id)}
                      >
                        View {r.doc_type}
                      </button>
                    </dd>
                  </div>
                ))}
              </dl>
            )}

            <div className={receipt.divider} />

            {/* ── Repair history ───────────────────────────────────── */}
            <p className={receipt.sectionTitle}>
              REPAIR HISTORY ({history.repairs.length})
            </p>
            {history.repairs.length === 0 ? (
              <p className={receipt.remarksLabel}>
                <span className={receipt.remarks}>No repairs recorded.</span>
              </p>
            ) : (
              <dl className={receipt.rows}>
                {history.repairs.map((r) => (
                  <div key={r.id} className={receipt.row}>
                    <dt>
                      {fmtDate(r.repair_date)} ·{" "}
                      <span
                        className={receipt.resultBadge}
                        data-tone={repairTone(r.status)}
                      >
                        {repairLabel(r.status).toUpperCase()}
                      </span>{" "}
                      · {r.technician ?? "Unassigned"}
                    </dt>
                    <dd>
                      <button
                        type="button"
                        className={`${styles.inspectLinkSecondary} cursor-pointer`}
                        onClick={() => setRepairId(r.id)}
                      >
                        View receipt
                      </button>
                    </dd>
                  </div>
                ))}
              </dl>
            )}

            <div className={receipt.divider} />

            {/* ── Request history ──────────────────────────────────── */}
            <p className={receipt.sectionTitle}>
              REQUEST HISTORY ({history.requests.length})
            </p>
            {history.requests.length === 0 ? (
              <p className={receipt.remarksLabel}>
                <span className={receipt.remarks}>No requests filed.</span>
              </p>
            ) : (
              <dl className={receipt.rows}>
                {history.requests.map((r) => (
                  <div key={r.id} className={receipt.row}>
                    <dt>
                      {r.request_type
                        ? r.request_type.charAt(0).toUpperCase() +
                          r.request_type.slice(1).replace(/_/g, " ")
                        : "Request"}{" "}
                      · {fmtDate(r.date_requested)}
                    </dt>
                    <dd>
                      {r.employee_name} ·{" "}
                      <span
                        className={receipt.resultBadge}
                        data-tone={
                          r.status === "completed" || r.status === "approved"
                            ? "ok"
                            : r.status === "rejected"
                              ? "bad"
                              : "warn"
                        }
                      >
                        {(r.status ?? "pending").toUpperCase()}
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            )}

            <div className={receipt.divider} />

            {/* ── Footer ───────────────────────────────────────────── */}
            <p className={receipt.receiptKicker}>END OF ASSET HISTORY</p>
            <div
              aria-hidden="true"
              className={receipt.scanned}
              style={{
                background:
                  "repeating-linear-gradient(90deg, #1b2a4a 0 2px, transparent 2px 5px, #1b2a4a 5px 6px, transparent 6px 10px)",
              }}
            />
            <p className={receipt.scannedLabel}>ASSET #{ref}</p>
            <p className={receipt.thanks}>*** Thank you! ***</p>
          </div>
        </article>
      )}

      <ReceiptOverlay
        open={activeRepair !== null}
        title="Repair receipt"
        onClose={() => setRepairId(null)}
      >
        {activeRepair ? (
          <div className={receipt.receiptStack} style={{ maxWidth: "none" }}>
            <RepairReceipt repair={activeRepair} />
          </div>
        ) : null}
      </ReceiptOverlay>

      <ReceiptOverlay
        open={issuanceId !== null}
        title="Accountability receipt"
        onClose={() => {
          setIssuanceId(null);
          setIssuanceDoc(null);
        }}
      >
        {issuanceLoading || !issuanceDoc ? (
          <div className={styles.emptyState}>
            <p className={styles.panelSub}>
              {issuanceLoading
                ? "Loading receipt…"
                : "This record is no longer available."}
            </p>
          </div>
        ) : (
          <div className={receipt.receiptStack} style={{ maxWidth: "none" }}>
            {issuanceDoc.doc_type === "PAR" ? (
              <ParReportSheet issuance={issuanceDoc} />
            ) : (
              <IcsReportSheet issuance={issuanceDoc} />
            )}
          </div>
        )}
      </ReceiptOverlay>
    </Card>
  );
}
