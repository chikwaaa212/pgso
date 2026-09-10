"use client";

import { useState } from "react";
import {
  Calendar,
  Check,
  Copy,
  Download,
  FileText,
  Hash,
  Package,
  ScanLine,
  ShieldCheck,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { getCompletedRequestQr } from "@/app/personnel/requests/actions";
import { requestTypeLabel } from "@/app/personnel/requests/request-types";
import qr from "@/app/personnel/issues/qr-record.module.css";

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  });
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface QrMeta {
  ref: string;
  request_type: string;
  employee_name: string;
  recipient_name: string | null;
  asset_label: string | null;
  item_count: number;
  quantity: number;
  transfer_to: string | null;
  from_holder: string | null;
  lines: { description: string; quantity: number }[];
  date_requested: string | null;
  date_resolved: string | null;
}

/** QR proof for a completed request — personnel, employee, and admin. */
export function RequestQrButton({ requestId }: { requestId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState("");
  const [dataUrl, setDataUrl] = useState("");
  const [meta, setMeta] = useState<QrMeta | null>(null);
  const [copied, setCopied] = useState(false);

  async function onOpen() {
    setOpen(true);
    if (dataUrl) return;
    setLoading(true);
    setError("");
    const res = await getCompletedRequestQr(requestId);
    setLoading(false);
    if (!res.success) {
      setError(res.error ?? "Failed to generate the QR.");
      return;
    }
    setPayload(res.payload ?? "");
    setDataUrl(res.dataUrl ?? "");
    setMeta(res.meta ?? null);
  }

  async function copyPayload() {
    if (!payload) return;
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => void onOpen()}>
        View QR
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={`${qr.dialogWide} sm:max-w-2xl`} showCloseButton={false}>
          <DialogTitle className="sr-only">
            {meta
              ? `Request QR record — ${requestTypeLabel(meta.request_type)} ${meta.ref}`
              : "Request QR record"}
          </DialogTitle>
          {loading ? (
            <p className={qr.scanHint}>Generating QR…</p>
          ) : error ? (
            <p role="alert" className={qr.scanHint}>
              {error}
            </p>
          ) : meta ? (
            <article className={`${qr.record} ${qr.printArea}`} aria-label="Request QR record">
              <header className={qr.masthead}>
                <div className={qr.mastheadPattern} aria-hidden="true" />
                <p className={qr.kicker}>
                  <span className={qr.kickerDot} aria-hidden="true" />
                  PGSO · Property &amp; Supply Management
                </p>
                <div className={qr.mastheadRow}>
                  <div>
                    <h2 className={qr.mastheadTitle}>Request QR Record</h2>
                    <p className={qr.mastheadSub}>
                      {requestTypeLabel(meta.request_type)} · Completed{" "}
                      {fmtDate(meta.date_resolved)}
                    </p>
                  </div>
                  <div className={qr.docBadge}>
                    <span className={qr.docBadgeKind}>REQ</span>
                    <span className={qr.docBadgeNo}>{meta.ref}</span>
                  </div>
                </div>
              </header>

              <div className={qr.receiver}>
                <span className={qr.avatar} aria-hidden="true">
                  {initials(meta.employee_name)}
                </span>
                <div className={qr.receiverMeta}>
                  <p className={qr.receiverLabel}>
                    <User size={11} aria-hidden="true" /> Requested by
                  </p>
                  <p className={qr.receiverName}>{meta.employee_name}</p>
                  <p className={qr.receiverCap}>
                    {meta.recipient_name
                      ? `Handled by ${meta.recipient_name}`
                      : "Personnel transaction"}
                    {meta.item_count > 1 ? ` · ${meta.item_count} items` : ""}
                  </p>
                </div>
              </div>

              <div className={qr.body}>
                <div className={qr.qrPanel}>
                  <div className={qr.qrFrame}>
                    {dataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={dataUrl}
                        alt={`QR record for completed ${meta.request_type} ${meta.ref}`}
                      />
                    ) : null}
                  </div>
                  <p className={qr.scanHint}>
                    <ScanLine size={13} aria-hidden="true" /> Scan to verify
                  </p>
                  <p className={qr.refCode} title={payload}>
                    REF {meta.ref}
                  </p>
                </div>

                <div className={qr.details}>
                  <p className={qr.detailsTitle}>Completed transaction</p>
                  {(
                    [
                      { key: "Type", value: requestTypeLabel(meta.request_type) },
                      { key: "Item", value: meta.asset_label?.trim() || "—" },
                      { key: "Quantity", value: String(meta.quantity ?? 1) },
                      ...(meta.from_holder
                        ? [{ key: "From (previous holder)", value: meta.from_holder }]
                        : []),
                      ...(meta.transfer_to
                        ? [{ key: "To (transferred to)", value: meta.transfer_to }]
                        : []),
                      { key: "Requested", value: fmtDate(meta.date_requested) },
                      { key: "Completed", value: fmtDate(meta.date_resolved) },
                    ] as const
                  ).map(({ key, value }) => (
                    <div key={key} className={qr.detailRow}>
                      <span className={qr.detailIcon} aria-hidden="true">
                        {key === "Item" ? (
                          <Package size={15} />
                        ) : key === "Type" ? (
                          <FileText size={15} />
                        ) : key === "Requested" ? (
                          <Calendar size={15} />
                        ) : (
                          <Hash size={15} />
                        )}
                      </span>
                      <div className={qr.detailText}>
                        <p className={qr.detailKey}>{key}</p>
                        <p className={qr.detailValue}>{value}</p>
                      </div>
                    </div>
                  ))}
                  {meta.lines.length > 1 ? (
                    <div className={qr.detailRow}>
                      <span className={qr.detailIcon} aria-hidden="true">
                        <Package size={15} />
                      </span>
                      <div className={qr.detailText}>
                        <p className={qr.detailKey}>Items</p>
                        <p className={qr.detailValue}>
                          {meta.lines.map((l, i) => (
                            <span key={i} style={{ display: "block" }}>
                              {l.quantity > 1
                                ? `${l.description} ×${l.quantity}`
                                : l.description}
                            </span>
                          ))}
                        </p>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className={qr.trust}>
                <ShieldCheck size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
                <p>
                  <strong>Verified completed request.</strong> This QR encodes the
                  request type, employee, item, quantity, transfer parties, and
                  dates only — no cost data.
                </p>
              </div>

              <div className={`${qr.actions} ${qr.noPrint}`}>
                {dataUrl ? (
                  <a
                    href={dataUrl}
                    download={`request-${meta.ref}.svg`}
                    className={qr.btnPrimary}
                  >
                    <Download size={15} aria-hidden="true" /> Download QR
                  </a>
                ) : null}
                <button type="button" onClick={() => void copyPayload()} className={qr.btnOutline}>
                  {copied ? (
                    <Check size={15} aria-hidden="true" />
                  ) : (
                    <Copy size={15} aria-hidden="true" />
                  )}
                  {copied ? "Copied!" : "Copy QR data"}
                </button>
              </div>
            </article>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
