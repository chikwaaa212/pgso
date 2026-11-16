"use client";

import { useRef, useState } from "react";
import {
  Check,
  Copy,
  Download,
  QrCode,
  ScanLine,
  ShieldCheck,
  X,
} from "lucide-react";
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
      <button
        type="button"
        onClick={() => void onOpen()}
        className={qr.trigger}
      >
        <QrCode size={14} aria-hidden="true" />
        View QR
      </button>
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
                <header className={qr.header}>
                  <div className={qr.headerBar}>
                    <span className="h-5 w-9 animate-pulse rounded bg-navy-100" />
                    <span className="h-3.5 w-28 animate-pulse rounded bg-navy-100" />
                  </div>
                  <div className="h-5 w-52 animate-pulse rounded bg-navy-100" />
                  <div className="mt-2 h-4 w-64 max-w-full animate-pulse rounded bg-navy-100" />
                </header>

                <div className={qr.body}>
                  <div className={qr.qrPanel}>
                    <div className={qr.qrFrame}>
                      <div
                        className="animate-pulse rounded bg-navy-100"
                        style={{ width: "10.5rem", height: "10.5rem" }}
                      />
                    </div>
                    <div className="h-3.5 w-28 animate-pulse rounded bg-navy-100" />
                    <div className="h-3 w-24 animate-pulse rounded bg-navy-100" />
                  </div>

                  <div className={qr.details}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className={qr.detailRow}>
                        <div className="h-3.5 w-16 animate-pulse rounded bg-navy-100" />
                        <div className="h-4 w-3/4 animate-pulse rounded bg-navy-100" />
                      </div>
                    ))}
                  </div>
                </div>

                <footer className={qr.footer}>
                  <div className="h-3.5 w-64 max-w-full animate-pulse rounded bg-navy-100" />
                  <div className={qr.actions}>
                    <span className="inline-flex h-8 w-24 animate-pulse rounded-[4px] bg-navy-100" />
                    <span className="inline-flex h-8 w-28 animate-pulse rounded-[4px] bg-navy-100" />
                  </div>
                </footer>
              </article>
            </div>
          ) : error ? (
            <p role="alert" className={qr.scanHint}>
              {error}
            </p>
          ) : meta ? (
            <article className={`${qr.record} ${qr.printArea}`} aria-label="Request QR record">
              <header className={qr.header}>
                <div className={qr.headerBar}>
                  <span className={qr.docTag}>REQ</span>
                  <span className={qr.docNo}>No. {meta.ref}</span>
                  <button
                    type="button"
                    className={qr.closeBtn}
                    onClick={() => setOpen(false)}
                    aria-label="Close"
                    title="Close"
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </div>
                <h2 className={qr.headerTitle}>
                  {requestTypeLabel(meta.request_type)}
                </h2>
                <p className={qr.headerSub}>
                  Requested by <strong>{meta.employee_name}</strong> · completed{" "}
                  {fmtDate(meta.date_resolved)}
                  {meta.recipient_name ? ` · handled by ${meta.recipient_name}` : ""}
                </p>
              </header>

              <div className={qr.body}>
                <div className={qr.qrPanel}>
                  <div className={qr.qrFrame}>
                    {dataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={dataUrl}
                        alt={`QR record for completed ${meta.request_type} ${meta.ref}`}
                        width={168}
                        height={168}
                        loading="lazy"
                        decoding="async"
                      />
                    ) : null}
                  </div>
                  <p className={qr.scanHint}>
                    <ScanLine size={14} aria-hidden="true" /> Scan to verify
                  </p>
                  <p className={qr.refCode} title={payload}>
                    Ref {meta.ref}
                  </p>
                </div>

                <dl className={qr.details}>
                  {(
                    [
                      { key: "Item", value: meta.asset_label?.trim() || "—" },
                      { key: "Quantity", value: String(meta.quantity ?? 1) },
                      ...(meta.from_holder
                        ? [{ key: "From", value: meta.from_holder }]
                        : []),
                      ...(meta.transfer_to
                        ? [{ key: "To", value: meta.transfer_to }]
                        : []),
                      { key: "Requested", value: fmtDate(meta.date_requested) },
                      { key: "Completed", value: fmtDate(meta.date_resolved) },
                    ] as const
                  ).map(({ key, value }) => (
                    <div key={key} className={qr.detailRow}>
                      <dt className={qr.detailKey}>{key}</dt>
                      <dd className={qr.detailValue}>{value}</dd>
                    </div>
                  ))}
                  {meta.lines.length > 1 ? (
                    <div className={qr.detailRow}>
                      <dt className={qr.detailKey}>Items</dt>
                      <dd className={qr.detailValue}>
                        <span className={qr.detailList}>
                          {meta.lines.map((l, i) => (
                            <span key={i}>
                              {l.quantity > 1
                                ? `${l.description} ×${l.quantity}`
                                : l.description}
                            </span>
                          ))}
                        </span>
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </div>

              <footer className={qr.footer}>
                <p className={qr.note}>
                  <ShieldCheck size={15} aria-hidden="true" />
                  <span>
                    <strong>Verified record.</strong> The QR contains the request,
                    employee, item, quantity, and dates only — no cost data.
                  </span>
                </p>
                <div className={`${qr.actions} ${qr.noPrint}`}>
                  <button type="button" onClick={() => void copyPayload()} className={qr.btnOutline}>
                    {copied ? (
                      <Check size={14} aria-hidden="true" />
                    ) : (
                      <Copy size={14} aria-hidden="true" />
                    )}
                    {copied ? "Copied" : "Copy data"}
                  </button>
                  {dataUrl ? (
                    <a
                      href={dataUrl}
                      download={`request-${meta.ref}.svg`}
                      className={qr.btnPrimary}
                    >
                      <Download size={14} aria-hidden="true" /> Download QR
                    </a>
                  ) : null}
                </div>
              </footer>
            </article>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
