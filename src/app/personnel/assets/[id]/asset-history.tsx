"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  ClipboardList,
  FileText,
  PackageCheck,
  UserRoundCheck,
  Wrench,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { getIssuance, type IssuanceDetail } from "../../issuances/actions";
import { RepairReceipt } from "../../repairs/repair-receipt";
import { ParReportSheet } from "../../documents/par-report";
import { IcsReportSheet } from "../../documents/ics-report";
import { ReceiptOverlay } from "../../documents/receipt-overlay";
import { ReceiptLoading } from "@/components/personnel/ReceiptLoading";
import { formatPeso } from "@/lib/issuance-rules";
import receipt from "../../inspections/components/receipt.module.css";
import styles from "../../dashboard/page.module.css";
import hist from "./history.module.css";
import {
  getAssetHistory,
  type AssetHistory,
  type AssetHistoryIssuance,
  type AssetHistoryRepair,
  type AssetHistoryRequest,
  type UnifiedAssetRow,
} from "../actions";

function toTime(value: string | null | undefined) {
  if (!value) return 0;
  const d = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

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

function fmtShort(id: string) {
  return id.slice(0, 8).toUpperCase();
}

function labelOf(value: string | null | undefined) {
  if (!value) return "—";
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");
}

function statusTone(status: string | null | undefined) {
  const v = (status ?? "").toLowerCase();
  if (v === "completed" || v === "approved") return "ok";
  if (v === "rejected" || v === "cancelled") return "bad";
  if (v === "in_progress" || v === "pending") return "warn";
  return "info";
}

function Field({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: ReactNode;
  /** Renders the value larger — used for amounts and quantities. */
  emphasis?: boolean;
}) {
  return (
    <div className={hist.field} data-emphasis={emphasis || undefined}>
      <span className={hist.fieldLabel}>{label}</span>
      <span className={hist.fieldValue}>{value}</span>
    </div>
  );
}

/** Icon + document tag + reference + subtitle, with right-aligned meta. */
function CardHead({
  icon,
  tag,
  reference,
  subtitle,
  meta,
}: {
  icon: ReactNode;
  tag: string;
  reference: string;
  subtitle: ReactNode;
  meta: ReactNode;
}) {
  return (
    <header className={hist.head}>
      <span className={hist.icon} aria-hidden="true">
        {icon}
      </span>
      <div className={hist.headMain}>
        <p className={hist.title}>
          <span className={hist.tag}>{tag}</span>
          <span className={hist.docNo}>{reference}</span>
        </p>
        <p className={hist.subtitle}>{subtitle}</p>
      </div>
      <div className={hist.headMeta}>{meta}</div>
    </header>
  );
}

/* ─── Assignments ──────────────────────────────────────────────────────── */

function AssignmentCard({
  issuance,
  requestById,
  onOpen,
}: {
  issuance: AssetHistoryIssuance;
  requestById: Map<string, AssetHistoryRequest>;
  onOpen: () => void;
}) {
  const request = issuance.request_id
    ? requestById.get(issuance.request_id)
    : undefined;
  const initiated = issuance.request_id
    ? `Request ${fmtShort(issuance.request_id)}${
        request ? ` · ${labelOf(request.status)}` : ""
      }`
    : "Direct issuance";

  return (
    <article className={hist.card} data-kind="assignment">
      <CardHead
        icon={<PackageCheck size={15} />}
        tag={issuance.doc_type}
        reference={issuance.doc_no ?? `#${fmtShort(issuance.id)}`}
        subtitle={
          <>
            <span className={hist.who}>Assigned to</span>
            <strong>{issuance.employee_name}</strong>
          </>
        }
        meta={
          <span className={hist.date}>
            {fmtDate(issuance.created_at ?? issuance.doc_date)}
          </span>
        }
      />

      <div className={hist.fields}>
        <Field
          label="Assigned by"
          value={issuance.assigned_by_name ?? "Not recorded"}
        />
        <Field label="Initiated" value={initiated} />
        {request ? (
          <Field label="Requested by" value={request.employee_name} />
        ) : null}
        <Field
          label="Quantity"
          emphasis
          value={`${issuance.quantity}${issuance.unit ? ` ${issuance.unit}` : ""}`}
        />
        <Field
          label="Amount"
          emphasis
          value={
            issuance.total_amount != null
              ? formatPeso(issuance.total_amount)
              : "—"
          }
        />
      </div>

      {issuance.purpose ? (
        <p className={hist.note}>
          <span className={hist.noteLabel}>Purpose</span>
          <span className={hist.noteBody}>{issuance.purpose}</span>
        </p>
      ) : null}

      <footer className={hist.foot}>
        <span className={hist.footMeta}>{fmtShort(issuance.id)}</span>
        <button type="button" className={hist.link} onClick={onOpen}>
          View {issuance.doc_type}
          <ArrowUpRight size={12} aria-hidden="true" />
        </button>
      </footer>
    </article>
  );
}

/* ─── Repairs ──────────────────────────────────────────────────────────── */

function RepairCard({
  repair,
  onOpen,
}: {
  repair: AssetHistoryRepair;
  onOpen: () => void;
}) {
  return (
    <article className={hist.card} data-kind="repair">
      <CardHead
        icon={<Wrench size={15} />}
        tag="Repair"
        reference={`#${fmtShort(repair.id)}`}
        subtitle={<span className={hist.who}>Repair work order</span>}
        meta={
          <>
            <span className={hist.badge} data-tone={statusTone(repair.status)}>
              {labelOf(repair.status)}
            </span>
            <span className={hist.date}>
              {fmtDate(repair.created_at ?? repair.repair_date)}
            </span>
          </>
        }
      />

      <div className={hist.fields}>
        <Field label="Reported by" value={repair.reporter_name} />
        <Field label="Repair date" value={fmtDate(repair.repair_date)} />
        <Field label="Technician" value={repair.technician ?? "Unassigned"} />
        <Field
          label="Cost"
          emphasis
          value={repair.cost != null ? formatPeso(repair.cost) : "—"}
        />
      </div>

      {repair.description ? (
        <p className={hist.note}>
          <span className={hist.noteLabel}>Issue</span>
          <span className={hist.noteBody}>{repair.description}</span>
        </p>
      ) : null}

      <footer className={hist.foot}>
        <span className={hist.footMeta}>{fmtShort(repair.id)}</span>
        <button type="button" className={hist.link} onClick={onOpen}>
          View receipt
          <ArrowUpRight size={12} aria-hidden="true" />
        </button>
      </footer>
    </article>
  );
}

/* ─── Requests ─────────────────────────────────────────────────────────── */

function RequestCard({ request }: { request: AssetHistoryRequest }) {
  return (
    <article className={hist.card} data-kind="request">
      <CardHead
        icon={<FileText size={15} />}
        tag="Request"
        reference={labelOf(request.request_type)}
        subtitle={
          <>
            <span className={hist.who}>Requested by</span>
            <strong>{request.employee_name}</strong>
          </>
        }
        meta={
          <>
            <span
              className={hist.badge}
              data-tone={statusTone(request.status)}
            >
              {labelOf(request.status)}
            </span>
            <span className={hist.date}>
              {fmtDate(request.date_requested)}
            </span>
          </>
        }
      />

      <div className={hist.fields}>
        <Field
          label="Handled by"
          value={request.handled_by_name ?? "Not recorded"}
        />
        <Field label="Requested" value={fmtDate(request.date_requested)} />
        {request.date_resolved ? (
          <Field label="Resolved" value={fmtDate(request.date_resolved)} />
        ) : null}
      </div>

      {request.description ? (
        <p className={hist.note}>
          <span className={hist.noteLabel}>Details</span>
          <span className={hist.noteBody}>{request.description}</span>
        </p>
      ) : null}

      <footer className={hist.foot}>
        <span className={hist.footMeta}>{fmtShort(request.id)}</span>
      </footer>
    </article>
  );
}

/* ─── Current holder without a linked document ─────────────────────────── */

function HolderCard({
  asset,
  holderName,
}: {
  asset: UnifiedAssetRow;
  holderName: string;
}) {
  return (
    <article className={hist.card} data-kind="holder">
      <CardHead
        icon={<UserRoundCheck size={15} />}
        tag="Assignment"
        reference={`#${fmtShort(asset.id)}`}
        subtitle={
          <>
            <span className={hist.who}>Held by</span>
            <strong>{holderName}</strong>
          </>
        }
        meta={<span className={hist.date}>No linked document</span>}
      />

      <div className={hist.fields}>
        <Field label="Status" value={labelOf(asset.status)} />
        <Field
          label="On hand"
          emphasis
          value={`${asset.quantity ?? 0}${asset.unit ? ` ${asset.unit}` : ""}`}
        />
        <Field label="Location" value={asset.location ?? "—"} />
      </div>

      <p className={hist.note}>
        <span className={hist.noteLabel}>Note</span>
        <span className={hist.noteBody}>
          This item was assigned through a request approval or an older record,
          so no PAR/ICS document is linked to it.
        </span>
      </p>
    </article>
  );
}

/* ─── Section ──────────────────────────────────────────────────────────── */

type HistoryEvent =
  | { kind: "assignment"; at: number; issuance: AssetHistoryIssuance }
  | { kind: "repair"; at: number; repair: AssetHistoryRepair }
  | { kind: "request"; at: number; request: AssetHistoryRequest };

export function AssetHistorySection({
  asset,
  history,
  embedded = false,
  noun = "asset",
}: {
  asset: UnifiedAssetRow;
  history: AssetHistory;
  /** Renders inside the detail page's History tab (no duplicate card heading). */
  embedded?: boolean;
  /** Record noun used in copy ("asset" on the registry, "stock" in stocks). */
  noun?: string;
}) {
  const [repairId, setRepairId] = useState<string | null>(null);
  const [issuanceId, setIssuanceId] = useState<string | null>(null);
  const [issuanceDoc, setIssuanceDoc] = useState<IssuanceDetail | null>(null);
  const [issuanceLoading, setIssuanceLoading] = useState(false);

  // The page payload is a server render; an assignment may have happened
  // since. Repaint from a fresh read the moment the History tab opens so the
  // list never shows a stale "nothing recorded yet".
  const [timeline, setTimeline] = useState<AssetHistory>(history);
  useEffect(() => {
    let cancelled = false;
    void getAssetHistory(asset.id)
      .then((next) => {
        if (!cancelled) setTimeline(next);
      })
      .catch(() => {
        /* keep the server payload on failure */
      });
    return () => {
      cancelled = true;
    };
  }, [asset.id]);

  const activeRepair =
    timeline.repairs.find((r) => r.id === repairId) ?? null;

  function openIssuance(id: string) {
    setIssuanceId(id);
    setIssuanceDoc(null);
    setIssuanceLoading(true);
    void getIssuance(id).then((detail) => {
      setIssuanceDoc(detail);
      setIssuanceLoading(false);
    });
  }

  const requestById = new Map(timeline.requests.map((r) => [r.id, r]));

  const events: HistoryEvent[] = [
    ...timeline.issuances.map((issuance) => ({
      kind: "assignment" as const,
      at: toTime(issuance.created_at ?? issuance.doc_date),
      issuance,
    })),
    ...timeline.repairs.map((repair) => ({
      kind: "repair" as const,
      at: toTime(repair.created_at ?? repair.repair_date),
      repair,
    })),
    ...timeline.requests.map((request) => ({
      kind: "request" as const,
      at: toTime(request.date_requested),
      request,
    })),
  ].sort((a, b) => b.at - a.at);

  const hasEvents = events.length > 0;
  const holderName = timeline.assignedToName;
  const showHolderCard = !!holderName && timeline.issuances.length === 0;

  const content = (
    <>
      {!embedded ? (
        <>
          <h2 className={styles.panelTitle}>History</h2>
          <p className={styles.panelSub}>
            Every assignment, request, and repair for this {noun} — each card
            opens its receipt.
          </p>
        </>
      ) : null}

      {!hasEvents && !showHolderCard ? (
        <div className={hist.empty}>
          <p className={hist.emptyTitle}>No history yet</p>
          <p className={hist.emptyText}>
            Assignments, requests, and repairs for this item will appear here.
          </p>
        </div>
      ) : (
        <>
          <div className={hist.summary}>
            <span className={hist.stat} data-kind="assignment">
              <PackageCheck size={12} aria-hidden="true" />
              <strong>{timeline.issuances.length}</strong> Assignments
            </span>
            <span className={hist.stat} data-kind="repair">
              <Wrench size={12} aria-hidden="true" />
              <strong>{timeline.repairs.length}</strong> Repairs
            </span>
            <span className={hist.stat} data-kind="request">
              <ClipboardList size={12} aria-hidden="true" />
              <strong>{timeline.requests.length}</strong> Requests
            </span>
          </div>

          <div className={hist.grid}>
            {showHolderCard && holderName ? (
              <HolderCard asset={asset} holderName={holderName} />
            ) : null}
            {events.map((event) => {
              if (event.kind === "assignment") {
                return (
                  <AssignmentCard
                    key={`assignment-${event.issuance.id}`}
                    issuance={event.issuance}
                    requestById={requestById}
                    onOpen={() => openIssuance(event.issuance.id)}
                  />
                );
              }
              if (event.kind === "repair") {
                return (
                  <RepairCard
                    key={`repair-${event.repair.id}`}
                    repair={event.repair}
                    onOpen={() => setRepairId(event.repair.id)}
                  />
                );
              }
              return (
                <RequestCard
                  key={`request-${event.request.id}`}
                  request={event.request}
                />
              );
            })}
          </div>
        </>
      )}
    </>
  );

  return (
    <>
      {embedded ? (
        <div className={hist.section}>{content}</div>
      ) : (
        <Card className={styles.panel}>{content}</Card>
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
        title={
          issuanceDoc?.doc_type === "PAR"
            ? "Property Acknowledgment Receipt"
            : issuanceDoc?.doc_type === "ICS"
              ? "Inventory Custodian Slip"
              : "Accountability receipt"
        }
        onClose={() => {
          setIssuanceId(null);
          setIssuanceDoc(null);
        }}
        printable={!issuanceLoading && !!issuanceDoc}
      >
        {issuanceLoading ? (
          <ReceiptLoading label="Loading receipt…" />
        ) : !issuanceDoc ? (
          <div className={hist.empty}>
            <p className={hist.emptyTitle}>Record unavailable</p>
            <p className={hist.emptyText}>
              This record is no longer available.
            </p>
          </div>
        ) : (
          <div className={receipt.receiptStack} style={{ maxWidth: "none" }}>
            {issuanceDoc.doc_type === "PAR" ? (
              <ParReportSheet issuance={issuanceDoc} />
            ) : (
              <IcsReportSheet issuance={issuanceDoc} />
            )}
            <p className={hist.receiptLinks}>
              <Link
                href={`/personnel/issuances/${issuanceDoc.id}`}
                className={hist.receiptLink}
              >
                Open full report
              </Link>{" "}
              ·{" "}
              <a
                href={`/api/personnel/issuances/${issuanceDoc.id}/${
                  issuanceDoc.doc_type === "PAR" ? "par" : "ics"
                }-xlsx`}
                className={hist.receiptLink}
              >
                Download Excel
              </a>
            </p>
          </div>
        )}
      </ReceiptOverlay>
    </>
  );
}
