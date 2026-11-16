"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import jsQR from "jsqr";
import {
  AlertCircle,
  ArrowUpRight,
  Camera,
  ClipboardList,
  ClipboardPaste,
  Copy,
  FileText,
  History,
  Info,
  Package,
  PackageCheck,
  QrCode,
  RotateCcw,
  ScanLine,
  ShieldCheck,
  Upload,
  UserRound,
  Wrench,
} from "lucide-react";

import { requestTypeLabel } from "@/app/personnel/requests/request-types";
import { parseAssetTagRef, type PublicAssetTag } from "@/lib/asset-tag";
import { scanActionsFor, type ScanPortal } from "@/lib/scan-actions";
import {
  getScannedAssetHistory,
  getScannedAssetOption,
} from "@/lib/scan-actions-server";
import type {
  AssetHistory,
  AssetHistoryIssuance,
  AssetHistoryRepair,
  AssetHistoryRequest,
} from "@/app/personnel/assets/actions";
import {
  parseScanPayload,
  scanResultLabel,
  type AssetScanEnrichment,
  type ScanResult,
} from "@/lib/scan-payload";
import {
  bustClientCache,
  CLIENT_CACHE_KEYS,
  getClientCache,
  setClientCache,
} from "@/lib/client-cache";
import s from "./QrScanner.module.css";

interface RecentScan {
  id: string;
  at: number;
  result: ScanResult;
}

function fmtDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  });
}

function fmtMoney(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function initials(name: string | null) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function rawOf(result: ScanResult): string {
  return "raw" in result && result.raw ? result.raw : result.kind === "raw" ? result.text : "";
}

/** Key used to de-duplicate the recent-scan list. */
function scanKey(result: ScanResult): string {
  const raw = rawOf(result);
  return raw || JSON.stringify(scanResultLabel(result));
}

/**
 * Cached results may predate newer fields (line items, enrichment). Re-run the
 * current parser so a restored scan always has the full shape.
 */
function normalizeCached(result: ScanResult): ScanResult {
  if (result.kind === "asset") {
    return { ...result, enrichment: result.enrichment ?? null, history: result.history ?? null };
  }
  if (result.kind === "raw") return parseScanPayload(result.text ?? "");
  const raw = rawOf(result);
  return raw ? parseScanPayload(raw) : result;
}

/**
 * Resolve a decoded payload into display data.
 *
 * Request/issue payloads are self-describing. Asset tags encode a detail-page
 * URL, so they are looked up through the public endpoint (identification only),
 * and signed-in staff additionally resolve the custodian/cost through the
 * auth-scoped action. Public scans never receive those staff-only fields.
 */
async function resolveScan(text: string, portal: ScanPortal): Promise<ScanResult> {
  const ref = parseAssetTagRef(text);
  if (!ref) return parseScanPayload(text);

  const raw = text.trim();
  let asset: PublicAssetTag | null = null;
  let lookupError: string | undefined;

  try {
    const res = await fetch(`/api/public/assets/${ref.id}`, { cache: "no-store" });
    if (res.ok) {
      asset = (await res.json()) as PublicAssetTag;
    } else if (res.status !== 404) {
      lookupError = "Could not load asset details right now. Try again.";
    }
  } catch {
    lookupError = "Could not load asset details — check your connection.";
  }

  let enrichment: AssetScanEnrichment | null = null;
  let history: AssetHistory | null = null;
  if (portal !== "public" && asset) {
    const [resolved, trail] = await Promise.allSettled([
      getScannedAssetOption(ref.id),
      getScannedAssetHistory(ref.id),
    ]);

    if (resolved.status === "fulfilled" && "prefill" in resolved.value) {
      enrichment = {
        holderName: resolved.value.prefill.holderName,
        assignedToName: resolved.value.prefill.assignedToName,
        accountTitle: resolved.value.prefill.option.account_title,
        unitCost: resolved.value.prefill.option.unit_cost,
        quantity: resolved.value.prefill.option.quantity,
        location: resolved.value.prefill.option.location,
      };
    }

    if (trail.status === "fulfilled" && "history" in trail.value) {
      history = trail.value.history;
    }
  }

  return { kind: "asset", ref, asset, enrichment, history, lookupError, raw };
}

function Field({
  label,
  value,
  empty,
}: {
  label: string;
  value: string | number | null | undefined;
  empty?: boolean;
}) {
  const text =
    value === null || value === undefined || value === "" ? "—" : String(value);
  return (
    <div className={s.field}>
      <span className={s.fieldLabel}>{label}</span>
      <span className={s.fieldValue} data-empty={empty ?? text === "—"}>
        {text}
      </span>
    </div>
  );
}

function PersonCard({
  label,
  name,
  meta,
  sideLabel,
  sideValue,
}: {
  label: string;
  name: string;
  meta?: string | null;
  sideLabel?: string;
  sideValue?: string | null;
}) {
  return (
    <div className={s.personCard}>
      <span className={s.avatar} aria-hidden="true">
        {initials(name)}
      </span>
      <div className={s.personInfo}>
        <span className={s.personLabel}>{label}</span>
        <span className={s.personName}>{name}</span>
        {meta ? <span className={s.personMeta}>{meta}</span> : null}
      </div>
      {sideLabel && sideValue ? (
        <div className={s.personSide}>
          <span className={s.personLabel}>{sideLabel}</span>
          <span className={s.personMeta}>{sideValue}</span>
        </div>
      ) : null}
    </div>
  );
}

export function QrScanner({
  crumb,
  title,
  subtitle,
  styles,
}: {
  /** Optional breadcrumb; omit to render no breadcrumb. */
  crumb?: string;
  title: string;
  subtitle: string;
  /** Portal page styles — used only for the outer section spacing. */
  styles?: Record<string, string>;
  /** Retained for page compatibility; the shared layout is already contained. */
  center?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);

  const [scanning, setScanning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [reading, setReading] = useState(false);
  const [camError, setCamError] = useState("");
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [recent, setRecent] = useState<RecentScan[]>([]);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");

  const pathname = usePathname();
  const portal: ScanPortal = pathname?.startsWith("/super-admin")
    ? "super-admin"
    : pathname?.startsWith("/personnel")
      ? "personnel"
      : "public";

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setScanning(false);
  }, []);

  const remember = useCallback((next: ScanResult) => {
    setRecent((prev) => {
      const key = scanKey(next);
      return [
        { id: `${key}:${Date.now()}`, at: Date.now(), result: next },
        ...prev.filter((entry) => scanKey(entry.result) !== key),
      ].slice(0, 5);
    });
  }, []);

  const handleDecoded = useCallback(
    (text: string, doneNotice: string) => {
      const raw = text.trim();
      if (!raw) {
        setNotice("That code was empty. Try another QR code.");
        return;
      }
      setReading(true);
      setCamError("");
      setNotice("Reading QR code…");
      void resolveScan(raw, portal)
        .then((next) => {
          setResult(next);
          remember(next);
          setNotice(doneNotice);
        })
        .catch(() => {
          setNotice("Could not read that code. Try again or use the camera.");
        })
        .finally(() => setReading(false));
    },
    [portal, remember]
  );

  // Restore the last decoded result so leaving and returning to the scanner
  // doesn't lose the information. Runs in an effect to keep SSR markup stable.
  useEffect(() => {
    try {
      const hit = getClientCache<{ result: ScanResult; notice: string }>(
        CLIENT_CACHE_KEYS.scan
      );
      if (hit?.data?.result) {
        const restored = normalizeCached(hit.data.result);
        setResult(restored);
        setNotice(hit.data.notice ?? "");
        remember(restored);
      }
    } catch {
      /* cache unavailable — start empty */
    }
  }, [remember]);

  useEffect(() => {
    if (!result) return;
    try {
      setClientCache(CLIENT_CACHE_KEYS.scan, { result, notice });
    } catch {
      /* cache unavailable — result still shows */
    }
  }, [result, notice]);

  useEffect(() => stopCamera, [stopCamera]);

  const tick = useCallback(
    function frame() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
        rafRef.current = requestAnimationFrame(frame);
        return;
      }
      const scale = Math.min(1, 720 / (video.videoWidth || 720));
      canvas.width = Math.max(1, Math.floor(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.floor(video.videoHeight * scale));
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(img.data, img.width, img.height, {
          inversionAttempts: "attemptBoth",
        });
        if (code?.data) {
          stopCamera();
          handleDecoded(code.data, "QR detected from the camera.");
          return;
        }
      }
      rafRef.current = requestAnimationFrame(frame);
    },
    [handleDecoded, stopCamera]
  );

  async function startCamera() {
    if (starting || scanning) return;
    setCamError("");
    setNotice("");
    setStarting(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCamError("Camera is not available in this browser. Upload a QR image instead.");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
      }
      setScanning(true);
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      stopCamera();
      setCamError(
        "Could not open the camera. Check the browser permission, or upload a QR image instead."
      );
    } finally {
      setStarting(false);
    }
  }

  async function decodeImage(file: File) {
    setCamError("");
    setNotice("");
    setReading(true);
    const url = URL.createObjectURL(file);
    let decoded: string | null = null;
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Image failed to load"));
        img.src = url;
      });
      const maxSide = 1600;
      const largest = Math.max(img.naturalWidth, img.naturalHeight);
      const scale = largest > maxSide ? maxSide / largest : 1;
      const width = Math.max(1, Math.round(img.naturalWidth * scale));
      const height = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = canvasRef.current ?? document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("Canvas unavailable");
      ctx.drawImage(img, 0, 0, width, height);
      const imgData = ctx.getImageData(0, 0, width, height);
      const code = jsQR(imgData.data, width, height, {
        inversionAttempts: "attemptBoth",
      });
      decoded = code?.data ?? null;
      if (!decoded) {
        setNotice("No QR code found in that image. Try a sharper, uncropped photo.");
      }
    } catch {
      setNotice("That image could not be read. Try a PNG or JPG screenshot of the QR code.");
    } finally {
      URL.revokeObjectURL(url);
      setReading(false);
    }
    if (decoded) handleDecoded(decoded, `QR detected in “${file.name}”.`);
  }

  async function copyRaw(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Raw QR data copied to the clipboard.");
    } catch {
      setNotice("Could not copy automatically. Open the raw data and select it.");
    }
  }

  function scanAnother() {
    stopCamera();
    bustClientCache(CLIENT_CACHE_KEYS.scan);
    setResult(null);
    setNotice("");
    setCamError("");
    setPasteOpen(false);
    setPasteText("");
  }

  const sectionClass = [styles?.section, s.section].filter(Boolean).join(" ");
  const statusLabel = scanning
    ? "Camera live"
    : reading
      ? "Reading…"
      : result
        ? "Code captured"
        : "Camera idle";

  const rawText = result ? rawOf(result) : "";

  return (
    <section className={sectionClass} data-portal={portal}>
      {crumb ? <p className={s.crumb}>{crumb}</p> : null}

      <div className={s.header}>
        <div className={s.headerMain}>
          <span className={s.eyebrow}>
            <ScanLine size={13} aria-hidden="true" /> QR Scanner
          </span>
          <h1 className={s.title}>{title}</h1>
          <p className={s.subtitle}>{subtitle}</p>
        </div>
        <span className={s.statusPill} data-live={scanning}>
          <span className={s.statusDot} aria-hidden="true" />
          {statusLabel}
        </span>
      </div>

      <div className={s.layout}>
        <div className={s.column}>
          <div className={s.card}>
            <div className={s.cardHead}>
              <div>
                <h2 className={s.cardTitle}>Scan a code</h2>
                <p className={s.cardSub}>
                  Hold the QR inside the frame, or upload an image of it.
                </p>
              </div>
            </div>

            <div className={s.viewport} data-live={scanning}>
              <video
                ref={videoRef}
                playsInline
                muted
                aria-label="Camera preview"
                className={s.video}
                style={{ display: scanning ? "block" : "none" }}
              />
              {!scanning ? (
                <div className={s.idle}>
                  <span className={s.idleIcon} aria-hidden="true">
                    <Camera size={22} />
                  </span>
                  <p className={s.idleTitle}>Camera is off</p>
                  <p className={s.idleText}>
                    Start the camera for live scanning, upload a photo, or paste a
                    QR payload manually.
                  </p>
                </div>
              ) : (
                <>
                  <div className={s.reticle} aria-hidden="true" />
                  <div className={s.corner} aria-hidden="true" />
                  <div className={s.scanLine} aria-hidden="true" />
                  <span className={s.viewportBadge}>
                    <span className={s.viewportBadgeDot} aria-hidden="true" />
                    Looking for a QR code
                  </span>
                </>
              )}
              {reading ? (
                <div className={s.reading}>
                  <span className={s.spinner} aria-hidden="true" />
                  Reading code…
                </div>
              ) : null}
            </div>

            <div className={s.controls}>
              {!scanning ? (
                <button
                  type="button"
                  className={s.actionPrimary}
                  onClick={() => void startCamera()}
                  disabled={starting || reading}
                >
                  <Camera size={14} aria-hidden="true" />
                  {starting ? "Opening camera…" : "Start camera"}
                </button>
              ) : (
                <button type="button" className={s.actionPrimary} onClick={stopCamera}>
                  Stop camera
                </button>
              )}
              <button
                type="button"
                className={s.actionSecondary}
                onClick={() => fileRef.current?.click()}
                disabled={reading}
              >
                <Upload size={14} aria-hidden="true" />
                Upload image
              </button>
              <button
                type="button"
                className={s.actionSecondary}
                onClick={() => setPasteOpen((v) => !v)}
                aria-expanded={pasteOpen}
              >
                <ClipboardPaste size={14} aria-hidden="true" />
                {pasteOpen ? "Hide paste box" : "Paste code"}
              </button>
              {result ? (
                <button type="button" className={s.actionSecondary} onClick={scanAnother}>
                  <RotateCcw size={14} aria-hidden="true" />
                  Scan another
                </button>
              ) : null}
            </div>

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className={s.fileInput}
              aria-label="Upload a QR code image"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void decodeImage(file);
                event.target.value = "";
              }}
            />

            {pasteOpen ? (
              <div className={s.pastePanel}>
                <label className={s.fieldLabel} htmlFor="qr-paste">
                  Paste a QR payload
                </label>
                <textarea
                  id="qr-paste"
                  className={s.textarea}
                  value={pasteText}
                  onChange={(event) => setPasteText(event.target.value)}
                  placeholder={'Paste the QR text here, e.g. {"kind":"PGSO-REQUEST",…}'}
                  spellCheck={false}
                />
                <div className={s.controls}>
                  <button
                    type="button"
                    className={s.actionPrimary}
                    disabled={!pasteText.trim() || reading}
                    onClick={() => handleDecoded(pasteText, "QR decoded from pasted data.")}
                  >
                    Decode pasted code
                  </button>
                  <button
                    type="button"
                    className={s.actionSecondary}
                    onClick={() => setPasteText("")}
                    disabled={!pasteText}
                  >
                    Clear text
                  </button>
                </div>
              </div>
            ) : null}

            {camError ? (
              <p className={s.alert} role="alert">
                <AlertCircle size={15} aria-hidden="true" />
                {camError}
              </p>
            ) : null}
            {notice ? <p className={s.helper}>{notice}</p> : null}
          </div>

          {result ? (
            <ResultCard
              result={result}
              portal={portal}
              onCopy={() => void copyRaw(rawText)}
              onRescan={scanAnother}
              onRetry={() => handleDecoded(rawText, "QR re-read.")}
            />
          ) : (
            <div className={s.emptyState}>
              <span className={s.resultIcon} aria-hidden="true">
                <QrCode size={20} />
              </span>
              <h2 className={s.emptyTitle}>No code scanned yet</h2>
              <p className={s.emptyText}>
                Scan a request slip, a signed PAR/ICS, or an asset tag. The
                details will appear here with the right next steps for your
                account.
              </p>
            </div>
          )}
        </div>

        <aside className={s.asideColumn}>
          <div className={s.card}>
            <h2 className={s.cardTitle}>Codes this scanner reads</h2>
            <ul className={s.guideList}>
              <li className={s.guideItem}>
                <span className={s.guideIcon} aria-hidden="true">
                  <FileText size={15} />
                </span>
                <span className={s.guideText}>
                  <span className={s.guideTitle}>Completed request</span>
                  <span className={s.guideBody}>
                    Shows the requester, item lines, and completion dates.
                  </span>
                </span>
              </li>
              <li className={s.guideItem}>
                <span className={s.guideIcon} aria-hidden="true">
                  <ShieldCheck size={15} />
                </span>
                <span className={s.guideText}>
                  <span className={s.guideTitle}>PAR / ICS issuance</span>
                  <span className={s.guideBody}>
                    Shows the document number, issued-to employee, and item.
                  </span>
                </span>
              </li>
              <li className={s.guideItem}>
                <span className={s.guideIcon} aria-hidden="true">
                  <Package size={15} />
                </span>
                <span className={s.guideText}>
                  <span className={s.guideTitle}>Asset or stock tag</span>
                  <span className={s.guideBody}>
                    Shows property details, location, status, and record actions.
                  </span>
                </span>
              </li>
            </ul>
          </div>

          <div className={s.card}>
            <h2 className={s.cardTitle}>Tips for a clean read</h2>
            <ol className={s.steps}>
              <li>Fill the frame with the QR code and keep the camera steady.</li>
              <li>Use even light; avoid glare on glossy stickers or paper.</li>
              <li>If the camera struggles, upload a screenshot or photo instead.</li>
              <li>Every scan stays in Recent scans for this browser session.</li>
            </ol>
          </div>

          <div className={s.card}>
            <div className={s.recentHead}>
              <h2 className={s.cardTitle}>Recent scans</h2>
              {recent.length ? (
                <button
                  type="button"
                  className={s.textButton}
                  onClick={() => setRecent([])}
                >
                  Clear
                </button>
              ) : null}
            </div>
            {recent.length ? (
              <ul className={s.recentList}>
                {recent.map((entry) => {
                  const label = scanResultLabel(entry.result);
                  return (
                    <li key={entry.id}>
                      <button
                        type="button"
                        className={s.recentItem}
                        onClick={() => {
                          setResult(entry.result);
                          setNotice("Restored from recent scans.");
                        }}
                      >
                        <span className={s.recentIcon} aria-hidden="true">
                          {entry.result.kind === "asset" ? (
                            <Package size={15} />
                          ) : entry.result.kind === "raw" ? (
                            <QrCode size={15} />
                          ) : (
                            <FileText size={15} />
                          )}
                        </span>
                        <span className={s.recentBody}>
                          <span className={s.recentTitle}>{label.title}</span>
                          <span className={s.recentMeta}>{label.subtitle}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className={s.recentEmpty}>
                Scans you make in this session will be listed here so you can
                reopen them without rescanning.
              </p>
            )}
          </div>

          {portal === "public" ? (
            <div className={s.card}>
              <h2 className={s.cardTitle}>Signed-out access</h2>
              <p className={s.guideBody}>
                Asset tags are identification-only here. Sign in with a PGSO
                account to see the custodian, costs, and custody history.
              </p>
            </div>
          ) : null}
        </aside>
      </div>
    </section>
  );
}

function ResultCard({
  result,
  portal,
  onCopy,
  onRescan,
  onRetry,
}: {
  result: ScanResult;
  portal: ScanPortal;
  onCopy: () => void;
  onRescan: () => void;
  onRetry: () => void;
}) {
  const actions = (
    <div className={s.resultActions}>
      <button type="button" className={s.actionSecondary} onClick={onCopy}>
        <Copy size={13} aria-hidden="true" />
        Copy raw
      </button>
      <button type="button" className={s.actionSecondary} onClick={onRescan}>
        <RotateCcw size={13} aria-hidden="true" />
        Scan another
      </button>
    </div>
  );

  if (result.kind === "request") {
    const person = result.recipient ? `Handled by ${result.recipient}` : null;
    return (
      <article className={s.resultCard}>
        <div className={s.resultHero}>
          <div className={s.resultIdentity}>
            <span className={s.resultIcon} aria-hidden="true">
              <FileText size={20} />
            </span>
            <div className={s.resultHeadline}>
              <span className={s.resultType}>
                Completed request · {requestTypeLabel(result.type)}
              </span>
              <h2 className={s.resultTitle}>Request {result.ref}</h2>
              <p className={s.resultSub}>{result.employee}</p>
            </div>
          </div>
          {actions}
        </div>
        <div className={s.resultBody}>
          <PersonCard
            label="Requested by"
            name={result.employee}
            meta={person}
            sideLabel="Status"
            sideValue={result.status ?? "Completed"}
          />
          <div className={s.grid}>
            <Field label="Reference" value={result.ref} />
            <Field label="Items" value={result.items || null} />
            <Field label="Total quantity" value={result.qty} />
            <Field label="Requested" value={fmtDate(result.requested)} />
            <Field label="Completed" value={fmtDate(result.resolved)} />
            {result.from ? (
              <Field label="From (previous holder)" value={result.from} />
            ) : null}
            {result.to ? <Field label="Transferred to" value={result.to} /> : null}
          </div>
          {result.lines.length ? (
            <div>
              <p className={s.sectionLabel}>Line items</p>
              <ul className={s.lineList}>
                {result.lines.map((line, index) => (
                  <li key={`${line.description}-${index}`} className={s.lineItem}>
                    <span>{line.description}</span>
                    <span className={s.lineQty}>×{line.quantity}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : result.item ? (
            <div className={s.grid}>
              <Field label="Item" value={result.item} />
            </div>
          ) : null}
        </div>
        <div className={s.resultFoot}>
          <span className={s.notice}>
            <Info size={13} aria-hidden="true" />
            Snapshot from when this request was completed.
          </span>
        </div>
      </article>
    );
  }

  if (result.kind === "issue") {
    const docNo = [result.doc, result.no].filter(Boolean).join(" ");
    return (
      <article className={s.resultCard}>
        <div className={s.resultHero}>
          <div className={s.resultIdentity}>
            <span className={s.resultIcon} aria-hidden="true">
              <ShieldCheck size={20} />
            </span>
            <div className={s.resultHeadline}>
              <span className={s.resultType}>
                Issued property · {result.doc}
              </span>
              <h2 className={s.resultTitle}>{docNo || "Issued item"}</h2>
              <p className={s.resultSub}>{result.article ?? result.employee}</p>
            </div>
          </div>
          {actions}
        </div>
        <div className={s.resultBody}>
          <PersonCard
            label="Issued to"
            name={result.employee}
            meta={result.account_title}
            sideLabel="Date issued"
            sideValue={fmtDate(result.date)}
          />
          <div className={s.grid}>
            <Field label="Document" value={result.doc} />
            <Field label="Document no." value={result.no} />
            <Field label="Account code" value={result.account_code} />
            <Field label="Account title" value={result.account_title} />
            <Field label="Article" value={result.article} />
            <Field label="Asset type" value={result.asset_type} />
            <Field label="Quantity" value={result.qty} />
            <Field label="Date issued" value={fmtDate(result.date)} />
          </div>
        </div>
        <div className={s.resultFoot}>
          <span className={s.notice}>
            <Info size={13} aria-hidden="true" />
            Identifies one line on the signed accountability document.
          </span>
        </div>
      </article>
    );
  }

  if (result.kind === "asset") {
    const { asset, enrichment } = result;
    const staff = portal !== "public";
    if (!asset) {
      return (
        <article className={s.resultCard}>
          <div className={s.resultHero}>
            <div className={s.resultIdentity}>
              <span className={s.resultIcon} aria-hidden="true">
                <AlertCircle size={20} />
              </span>
              <div className={s.resultHeadline}>
                <span className={s.resultType}>Asset tag</span>
                <h2 className={s.resultTitle}>Details unavailable</h2>
                <p className={s.resultSub}>
                  {result.lookupError ??
                    "This tag no longer matches a record — it may have been deleted."}
                </p>
              </div>
            </div>
            {actions}
          </div>
          <div className={s.resultBody}>
            <p className={s.guideBody}>
              The tag itself is still readable, but the record behind it could
              not be loaded. Try again in a moment or open the asset list to
              search manually.
            </p>
            <div className={s.controls}>
              <button type="button" className={s.actionPrimary} onClick={onRetry}>
                <RotateCcw size={14} aria-hidden="true" />
                Try again
              </button>
            </div>
            <div className={s.rawBox}>
              <p className={s.rawCode}>{rawOf(result) || "—"}</p>
            </div>
          </div>
        </article>
      );
    }

    const isStock = asset.kind === "stock";
    const title =
      asset.article ?? asset.property_number ?? asset.qr_code ?? "Scanned record";
    const accountCode = asset.account_code ?? null;
    const holder = enrichment?.holderName ?? null;
    const holderMeta = enrichment?.assignedToName
      ? `Assigned to ${enrichment.assignedToName}`
      : enrichment?.location ?? null;

    return (
      <article className={s.resultCard}>
        <div className={s.resultHero}>
          <div className={s.resultIdentity}>
            <span className={s.resultIcon} aria-hidden="true">
              {isStock ? <Package size={20} /> : <QrCode size={20} />}
            </span>
            <div className={s.resultHeadline}>
              <span className={s.resultType}>
                {isStock ? "Stock item" : "Property / asset"}
              </span>
              <h2 className={s.resultTitle}>{title}</h2>
              <p className={s.resultSub}>
                {asset.description || asset.category || "PGSO record"}
              </p>
            </div>
          </div>
          {actions}
        </div>
        <div className={s.resultBody}>
          {staff ? (
            holder ? (
              <PersonCard
                label={isStock ? "Stock location" : "Custodian / holder"}
                name={holder}
                meta={holderMeta}
                sideLabel="Status"
                sideValue={asset.status ?? null}
              />
            ) : (
              <PersonCard
                label="Record"
                name={asset.property_number ?? asset.qr_code ?? "PGSO property"}
                meta={asset.location}
                sideLabel="Status"
                sideValue={asset.status ?? null}
              />
            )
          ) : (
            <div className={s.signInNote}>
              <UserRound size={16} aria-hidden="true" />
              <span>
                Identification only. Sign in with a personnel account to see the
                custodian, costs, and full custody history.
              </span>
            </div>
          )}

          <div className={s.grid}>
            <Field
              label="Property no."
              value={asset.property_number ?? asset.qr_code}
            />
            <Field label="Account code" value={accountCode} />
            <Field
              label="Category"
              value={asset.category}
            />
            <Field label="Status" value={asset.status} />
            <Field label="Condition" value={asset.condition} />
            <Field label="Location" value={asset.location} />
            <Field
              label="Quantity"
              value={[asset.quantity, asset.unit]
                .filter((v) => v !== null && v !== "")
                .join(" ")}
              empty={asset.quantity === null}
            />
            <Field label="Date acquired" value={fmtDate(asset.date_acquired)} />
            {staff ? (
              <Field
                label="Account title"
                value={enrichment?.accountTitle ?? null}
              />
            ) : null}
            {staff ? (
              <Field
                label="Unit cost"
                value={
                  enrichment?.unitCost !== null &&
                  enrichment?.unitCost !== undefined
                    ? fmtMoney(enrichment.unitCost)
                    : null
                }
              />
            ) : null}
          </div>

          {staff ? (
            <AssetHistoryBlock
              key={result.ref.id}
              assetId={result.ref.id}
              portal={portal}
              initial={result.history}
            />
          ) : null}

          <div>
            <p className={s.sectionLabel}>Next steps</p>
            <div className={s.resultActions}>
              {scanActionsFor(result.ref, portal).map((action) => (
                <Link
                  key={action.id}
                  href={action.href}
                  className={
                    action.kind === "primary" ? s.actionPrimary : s.actionSecondary
                  }
                >
                  {action.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
        <div className={s.resultFoot}>
          <span className={s.notice}>
            <Info size={13} aria-hidden="true" />
            {staff
              ? "Actions open the record in your portal; permissions still apply."
              : "Sign in to act on this record or view its history."}
          </span>
        </div>
      </article>
    );
  }

  return (
    <article className={s.resultCard}>
      <div className={s.resultHero}>
        <div className={s.resultIdentity}>
          <span className={s.resultIcon} aria-hidden="true">
            <QrCode size={20} />
          </span>
          <div className={s.resultHeadline}>
            <span className={s.resultType}>Unrecognized code</span>
            <h2 className={s.resultTitle}>Not a PGSO record</h2>
            <p className={s.resultSub}>
              The code was read, but it is not a request, issuance, or asset tag
              generated by this system.
            </p>
          </div>
        </div>
        {actions}
      </div>
      <div className={s.resultBody}>
        <div className={s.rawBox}>
          <p className={s.rawCode}>{result.text || "Empty payload"}</p>
        </div>
      </div>
      <div className={s.resultFoot}>
        <span className={s.notice}>
          <Info size={13} aria-hidden="true" />
          Raw content is shown above so you can verify what was scanned.
        </span>
      </div>
    </article>
  );
}

/* ─── Scanned asset history ────────────────────────────────────────────── */

type ScanHistoryEvent =
  | { kind: "assignment"; at: number; item: AssetHistoryIssuance }
  | { kind: "request"; at: number; item: AssetHistoryRequest }
  | { kind: "repair"; at: number; item: AssetHistoryRepair };

function historyTime(value: string | null | undefined) {
  if (!value) return 0;
  const d = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

function statusTone(status: string | null | undefined) {
  const v = (status ?? "").toLowerCase();
  if (v === "completed" || v === "approved") return "ok";
  if (v === "rejected" || v === "cancelled") return "bad";
  if (v === "in_progress" || v === "pending") return "warn";
  return "info";
}

function statusLabel(value: string | null | undefined) {
  if (!value) return "—";
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");
}

function shortId(id: string) {
  return id.slice(0, 8).toUpperCase();
}

function historyEvents(history: AssetHistory): ScanHistoryEvent[] {
  return [
    ...history.issuances.map((issuance) => ({
      kind: "assignment" as const,
      at: historyTime(issuance.created_at ?? issuance.doc_date),
      item: issuance,
    })),
    ...history.requests.map((request) => ({
      kind: "request" as const,
      at: historyTime(request.date_requested),
      item: request,
    })),
    ...history.repairs.map((repair) => ({
      kind: "repair" as const,
      at: historyTime(repair.created_at ?? repair.repair_date),
      item: repair,
    })),
  ].sort((a, b) => b.at - a.at);
}

/**
 * Assignment, request, and repair trail for a scanned asset/stock tag.
 *
 * The scan resolver usually supplies the trail up front; restored scans (for
 * example from the recent list) may not have it, so this re-reads it through
 * the same auth-scoped action the asset detail History tab uses.
 */
function AssetHistoryBlock({
  assetId,
  portal,
  initial,
}: {
  assetId: string;
  portal: ScanPortal;
  initial?: AssetHistory | null;
}) {
  const [history, setHistory] = useState<AssetHistory | null>(initial ?? null);
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState("");

  useEffect(() => {
    if (history) return;
    let cancelled = false;
    void getScannedAssetHistory(assetId)
      .then((res) => {
        if (cancelled) return;
        if ("history" in res) setHistory(res.history);
        else setError(res.error);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the record history.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [assetId, history]);

  const base = portal === "super-admin" ? "/super-admin" : "/personnel";
  const events = history ? historyEvents(history) : [];

  return (
    <section className={s.historySection}>
      <div className={s.historyHead}>
        <div className={s.historyHeading}>
          <span className={s.historyHeadingIcon} aria-hidden="true">
            <History size={15} />
          </span>
          <div className={s.historyHeadingText}>
            <h3 className={s.historyHeadingTitle}>History &amp; records</h3>
            <p className={s.historyHeadingSub}>
              Every assignment, request, and repair tied to this item.
            </p>
          </div>
        </div>
        {history ? (
          <div className={s.historyStats}>
            <span className={s.historyStat} data-kind="assignment">
              <PackageCheck size={12} aria-hidden="true" />
              <strong>{history.issuances.length}</strong> assignments
            </span>
            <span className={s.historyStat} data-kind="request">
              <ClipboardList size={12} aria-hidden="true" />
              <strong>{history.requests.length}</strong> requests
            </span>
            <span className={s.historyStat} data-kind="repair">
              <Wrench size={12} aria-hidden="true" />
              <strong>{history.repairs.length}</strong> repairs
            </span>
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className={s.historyState}>
          <span className={s.historyStateIcon} aria-hidden="true">
            <History size={16} />
          </span>
          <p className={s.historyStateTitle}>Loading record history…</p>
          <p className={s.historyStateText}>
            Pulling assignments, requests, and repair tickets for this item.
          </p>
        </div>
      ) : error ? (
        <div className={s.historyState} data-tone="error">
          <span className={s.historyStateIcon} aria-hidden="true">
            <AlertCircle size={16} />
          </span>
          <p className={s.historyStateTitle}>History unavailable</p>
          <p className={s.historyStateText}>{error}</p>
        </div>
      ) : !history || events.length === 0 ? (
        <div className={s.historyState}>
          <span className={s.historyStateIcon} aria-hidden="true">
            <History size={16} />
          </span>
          <p className={s.historyStateTitle}>No records yet</p>
          <p className={s.historyStateText}>
            Assignments, requests, and repairs will appear here once this item
            is issued or serviced.
          </p>
        </div>
      ) : (
        <ol className={s.historyList}>
          {events.map((event) => {
            if (event.kind === "assignment") {
              const issuance = event.item;
              const amount =
                issuance.total_amount != null
                  ? fmtMoney(issuance.total_amount)
                  : "—";
              return (
                <li
                  key={`assignment-${issuance.id}`}
                  className={s.historyItem}
                  data-kind="assignment"
                >
                  <span className={s.historyNode} aria-hidden="true">
                    <PackageCheck size={15} />
                  </span>
                  <article className={s.historyCard}>
                    <header className={s.historyCardHead}>
                      <div className={s.historyCardTitleRow}>
                        <span className={s.historyKind}>{issuance.doc_type}</span>
                        <h4 className={s.historyCardTitle}>
                          {issuance.doc_no ?? `#${shortId(issuance.id)}`}
                        </h4>
                        <span className={s.historyBadge} data-tone="ok">
                          {issuance.source === "request"
                            ? "From request"
                            : "Direct issuance"}
                        </span>
                      </div>
                      <span className={s.historyDate}>
                        {fmtDate(issuance.doc_date ?? issuance.created_at)}
                      </span>
                    </header>
                    <div className={s.historyFacts}>
                      <HistoryFact
                        label="Issued to"
                        value={issuance.employee_name}
                        strong
                      />
                      <HistoryFact
                        label="Assigned by"
                        value={issuance.assigned_by_name ?? "Not recorded"}
                      />
                      <HistoryFact
                        label="Quantity"
                        value={`${issuance.quantity}${
                          issuance.unit ? ` ${issuance.unit}` : ""
                        }`}
                      />
                      <HistoryFact label="Amount" value={amount} />
                    </div>
                    {issuance.purpose ? (
                      <p className={s.historyNote}>
                        <span className={s.historyNoteLabel}>Purpose</span>
                        <span>{issuance.purpose}</span>
                      </p>
                    ) : null}
                    <footer className={s.historyCardFoot}>
                      <span className={s.historyRef}>
                        #{shortId(issuance.id)}
                      </span>
                      <Link
                        href={`${base}/issuances/${issuance.id}`}
                        className={s.historyLink}
                      >
                        Open {issuance.doc_type}
                        <ArrowUpRight size={12} aria-hidden="true" />
                      </Link>
                    </footer>
                  </article>
                </li>
              );
            }

            if (event.kind === "request") {
              const request = event.item;
              return (
                <li
                  key={`request-${request.id}`}
                  className={s.historyItem}
                  data-kind="request"
                >
                  <span className={s.historyNode} aria-hidden="true">
                    <ClipboardList size={15} />
                  </span>
                  <article className={s.historyCard}>
                    <header className={s.historyCardHead}>
                      <div className={s.historyCardTitleRow}>
                        <span className={s.historyKind}>Request</span>
                        <h4 className={s.historyCardTitle}>
                          {requestTypeLabel(request.request_type)}
                        </h4>
                        <span
                          className={s.historyBadge}
                          data-tone={statusTone(request.status)}
                        >
                          {statusLabel(request.status)}
                        </span>
                      </div>
                      <span className={s.historyDate}>
                        {fmtDate(request.date_requested)}
                      </span>
                    </header>
                    <div className={s.historyFacts}>
                      <HistoryFact
                        label="Requested by"
                        value={request.employee_name}
                        strong
                      />
                      <HistoryFact
                        label="Handled by"
                        value={request.handled_by_name ?? "Not recorded"}
                      />
                      <HistoryFact
                        label="Requested"
                        value={fmtDate(request.date_requested)}
                      />
                      <HistoryFact
                        label="Resolved"
                        value={fmtDate(request.date_resolved)}
                      />
                    </div>
                    {request.description ? (
                      <p className={s.historyNote}>
                        <span className={s.historyNoteLabel}>Details</span>
                        <span>{request.description}</span>
                      </p>
                    ) : null}
                    <footer className={s.historyCardFoot}>
                      <span className={s.historyRef}>#{shortId(request.id)}</span>
                    </footer>
                  </article>
                </li>
              );
            }

            const repair = event.item;
            return (
              <li
                key={`repair-${repair.id}`}
                className={s.historyItem}
                data-kind="repair"
              >
                <span className={s.historyNode} aria-hidden="true">
                  <Wrench size={15} />
                </span>
                <article className={s.historyCard}>
                  <header className={s.historyCardHead}>
                    <div className={s.historyCardTitleRow}>
                      <span className={s.historyKind}>Repair</span>
                      <h4 className={s.historyCardTitle}>
                        #{shortId(repair.id)}
                      </h4>
                      <span
                        className={s.historyBadge}
                        data-tone={statusTone(repair.status)}
                      >
                        {statusLabel(repair.status)}
                      </span>
                    </div>
                    <span className={s.historyDate}>
                      {fmtDate(repair.repair_date)}
                    </span>
                  </header>
                  <div className={s.historyFacts}>
                    <HistoryFact
                      label="Reported by"
                      value={repair.reporter_name}
                      strong
                    />
                    <HistoryFact
                      label="Technician"
                      value={repair.technician ?? "Unassigned"}
                    />
                    <HistoryFact
                      label="Repair date"
                      value={fmtDate(repair.repair_date)}
                    />
                    <HistoryFact
                      label="Cost"
                      value={
                        repair.cost != null ? fmtMoney(repair.cost) : "—"
                      }
                    />
                  </div>
                  {repair.description ? (
                    <p className={s.historyNote}>
                      <span className={s.historyNoteLabel}>Issue</span>
                      <span>{repair.description}</span>
                    </p>
                  ) : null}
                  <footer className={s.historyCardFoot}>
                    <span className={s.historyRef}>#{shortId(repair.id)}</span>
                    <Link
                      href={`${base}/repairs/${repair.id}`}
                      className={s.historyLink}
                    >
                      Open repair
                      <ArrowUpRight size={12} aria-hidden="true" />
                    </Link>
                  </footer>
                </article>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function HistoryFact({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className={s.historyFact}>
      <span className={s.historyFactLabel}>{label}</span>
      <span className={s.historyFactValue} data-strong={strong || undefined}>
        {value}
      </span>
    </div>
  );
}
