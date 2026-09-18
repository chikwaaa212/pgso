"use client";

import { useRef, useState } from "react";
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
import { getClientCache, setClientCache } from "@/lib/client-cache";
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

// ─── QR detail cache ───────────────────────────────────────────────────────
// Opened QRs are cached client-side (memory + sessionStorage, shared across
// the personnel / employee / admin pages) so a QR viewed earlier paints
// instantly instead of refetching: fresh (<5min) skips the network, stale
// paints instantly then refreshes silently, cold shows the skeleton. Same
// scheme as the receipt viewer (useReceipt).
const QR_CACHE_PREFIX = "pgso:client:receipt:qr";
const QR_FRESH_MS = 5 * 60_000;
const QR_MAX_MS = 30 * 60_000;

interface CachedQr {
  payload: string;
  dataUrl: string;
  meta: QrMeta | null;
}

function readQrCache(requestId: string): { data: CachedQr; age: number } | null {
  try {
    const hit = getClientCache<CachedQr>(`${QR_CACHE_PREFIX}:${requestId}`);
    if (!hit) return null;
    const age = Date.now() - hit.fetchedAt;
    if (age >= QR_MAX_MS) return null;
    return { data: hit.data, age };
  } catch {
    return null;
  }
}

function writeQrCache(requestId: string, data: CachedQr) {
  try {
    setClientCache(`${QR_CACHE_PREFIX}:${requestId}`, data);
  } catch {
    // Quota / storage blocked — in-memory copy still applies.
  }
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
  const liveId = useRef<string | null>(null);

  async function onOpen() {
    liveId.current = requestId;
    setOpen(true);
    if (dataUrl) return;
    const cached = readQrCache(requestId);
    if (cached && cached.age < QR_FRESH_MS) {
      // Fresh — paint instantly, skip the network entirely.
      setPayload(cached.data.payload);
      setDataUrl(cached.data.dataUrl);
      setMeta(cached.data.meta);
      return;
    }
    if (cached) {
      // Stale — paint instantly, refresh silently in the background.
      setPayload(cached.data.payload);
      setDataUrl(cached.data.dataUrl);
      setMeta(cached.data.meta);
    } else {
      setLoading(true);
    }
    setError("");
    const res = await getCompletedRequestQr(requestId);
    if (liveId.current !== requestId) return;
    setLoading(false);
    if (!res.success) {
      // Keep stale cached content on screen; only cold starts surface the error.
      if (!cached) setError(res.error ?? "Failed to generate the QR.");
      return;
    }
    const next: CachedQr = {
      payload: res.payload ?? "",
      dataUrl: res.dataUrl ?? "",
      meta: (res.meta as QrMeta | undefined) ?? null,
    };
    writeQrCache(requestId, next);
    setPayload(next.payload);
    setDataUrl(next.dataUrl);
    setMeta(next.meta);
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
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void onOpen()}
        className="h-8 rounded-[4px] px-3.5 text-xs font-semibold"
      >
        View QR
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v) liveId.current = null;
          setOpen(v);
        }}
      >
        <DialogContent className={`${qr.dialogWide} sm:max-w-2xl`} showCloseButton={false}>
          <DialogTitle className="sr-only">
            {meta
              ? `Request QR record — ${requestTypeLabel(meta.request_type)} ${meta.ref}`
              : "Request QR record"}
          </DialogTitle>
          {loading ? (
            <div role="status" aria-label="Generating QR…">
              <article
                className={`${qr.record} ${qr.printArea}`}
                aria-hidden="true"
              >
                <header className={qr.masthead}>
                  <div className={qr.mastheadPattern} />
                  <p className={qr.kicker}>
                    <span className={qr.kickerDot} />
                    PGSO · Property &amp; Supply Management
                  </p>
                  <div className={qr.mastheadRow}>
                    <div>
                      <div className="h-7 w-48 animate-pulse rounded bg-white/25" />
                      <div className="mt-2 h-4 w-56 animate-pulse rounded bg-white/20" />
                    </div>
                    <div className={qr.docBadge}>
                      <div className="h-5 w-10 animate-pulse rounded bg-white/25" />
                      <div className="mt-1 h-3 w-14 animate-pulse rounded bg-white/20" />
                    </div>
                  </div>
                </header>

                <div className={qr.receiver}>
                  <span
                    className={qr.avatar}
                    style={{ background: "var(--color-navy-100)" }}
                  />
                  <div className={qr.receiverMeta} style={{ flex: 1 }}>
                    <p className={qr.receiverLabel}>
                      <User size={11} /> Requested by
                    </p>
                    <div className="mt-1 h-5 w-40 animate-pulse rounded bg-navy-100" />
                    <div className="mt-1 h-3 w-56 animate-pulse rounded bg-navy-100" />
                  </div>
                </div>

                <div className={qr.body}>
                  <div className={qr.qrPanel}>
                    <div className={qr.qrFrame}>
                      <span className={`${qr.tick} ${qr.tickTL}`} />
                      <span className={`${qr.tick} ${qr.tickTR}`} />
                      <span className={`${qr.tick} ${qr.tickBL}`} />
                      <span className={`${qr.tick} ${qr.tickBR}`} />
                      <div
                        className="animate-pulse rounded bg-navy-100"
                        style={{ width: "11.5rem", height: "11.5rem" }}
                      />
                    </div>
                    <p className={qr.scanHint}>
                      <ScanLine size={13} /> Scan to verify
                    </p>
                    <div className="h-5 w-28 animate-pulse rounded bg-navy-100" />
                  </div>

                  <div className={qr.details}>
                    <p className={qr.detailsTitle}>Completed transaction</p>
                    {(
                      [
                        { icon: FileText, key: "Type" },
                        { icon: Package, key: "Item" },
                        { icon: Hash, key: "Quantity" },
                        { icon: Calendar, key: "Requested" },
                        { icon: Calendar, key: "Completed" },
                      ] as const
                    ).map(({ icon: Icon, key }) => (
                      <div key={key} className={qr.detailRow}>
                        <span className={qr.detailIcon}>
                          <Icon size={15} />
                        </span>
                        <div className={qr.detailText} style={{ flex: 1 }}>
                          <p className={qr.detailKey}>{key}</p>
                          <div className="mt-1 h-4 w-3/4 animate-pulse rounded bg-navy-100" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className={qr.trust}>
                  <div className="h-4 w-4 animate-pulse rounded-full bg-navy-100" />
                  <div style={{ flex: 1 }}>
                    <div className="h-3 w-full animate-pulse rounded bg-navy-100" />
                    <div className="mt-1 h-3 w-2/3 animate-pulse rounded bg-navy-100" />
                  </div>
                </div>

                <div className={`${qr.actions} ${qr.noPrint}`}>
                  <span className="inline-flex h-8 w-32 animate-pulse rounded-[4px] bg-navy-100" />
                  <span className="inline-flex h-8 w-28 animate-pulse rounded-[4px] bg-navy-100" />
                </div>
              </article>
            </div>
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
