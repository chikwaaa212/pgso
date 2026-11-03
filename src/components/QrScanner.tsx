"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import jsQR from "jsqr";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requestTypeLabel } from "@/app/personnel/requests/request-types";
import {
  parseAssetTagRef,
  type AssetTagRef,
  type PublicAssetTag,
} from "@/lib/asset-tag";
import { scanActionsFor, type ScanPortal } from "@/lib/scan-actions";
import {
  CLIENT_CACHE_KEYS,
  getClientCache,
  setClientCache,
} from "@/lib/client-cache";

type ScanResult =
  | {
      kind: "request";
      ref: string;
      type: string;
      employee: string;
      recipient: string | null;
      item: string | null;
      items: number;
      qty: number | null;
      from: string | null;
      to: string | null;
      requested: string | null;
      resolved: string | null;
      raw: string;
    }
  | {
      kind: "issue";
      doc: string;
      no: string | null;
      date: string | null;
      employee: string;
      account_code: string | null;
      article: string | null;
      qty: number | null;
      raw: string;
    }
  | {
      /** Asset/stock tag — details come from the public lookup endpoint. */
      kind: "asset";
      ref: AssetTagRef;
      asset: PublicAssetTag | null;
      /** Set when the lookup itself failed (network/server), vs. 404. */
      lookupError?: string;
      raw: string;
    }
  | { kind: "raw"; text: string };

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

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function num(v: unknown): number | null {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parsePayload(text: string): ScanResult {
  const raw = text.trim();
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (o.kind === "PGSO-REQUEST") {
      return {
        kind: "request",
        ref: str(o.ref) ?? "—",
        type: str(o.type) ?? "—",
        employee: str(o.employee) ?? "—",
        recipient: str(o.recipient),
        item: str(o.item),
        items: num(o.items) ?? 0,
        qty: num(o.qty),
        from: str(o.from),
        to: str(o.to),
        requested: str(o.requested),
        resolved: str(o.resolved),
        raw,
      };
    }
    if (o.kind === "PGSO-ISSUE") {
      return {
        kind: "issue",
        doc: str(o.doc) ?? "—",
        no: str(o.no),
        date: str(o.date),
        employee: str(o.employee) ?? "—",
        account_code: str(o.account_code),
        article: str(o.article),
        qty: num(o.qty),
        raw,
      };
    }
  } catch {
    /* not JSON — fall through to raw */
  }
  return { kind: "raw", text: raw };
}

/**
 * Asset tags encode a detail-page URL, which the request/issue parser cannot
 * understand. Resolve them through the public lookup endpoint so the scanner
 * can show identifying details even when signed out.
 */
async function resolveScan(text: string): Promise<ScanResult> {
  const ref = parseAssetTagRef(text);
  if (!ref) return parsePayload(text);
  const raw = text.trim();
  try {
    const res = await fetch(`/api/public/assets/${ref.id}`, {
      cache: "no-store",
    });
    if (res.ok) {
      const asset = (await res.json()) as PublicAssetTag;
      return { kind: "asset", ref, asset, raw };
    }
    if (res.status === 404) {
      return { kind: "asset", ref, asset: null, raw };
    }
    return {
      kind: "asset",
      ref,
      asset: null,
      lookupError: "Could not load asset details right now. Try again.",
      raw,
    };
  } catch {
    return {
      kind: "asset",
      ref,
      asset: null,
      lookupError: "Could not load asset details — check your connection.",
      raw,
    };
  }
}

/** Shared camera-only QR scanner for personnel and admin. */
export function QrScanner({
  crumb,
  title,
  subtitle,
  styles,
  center = false,
}: {
  crumb: string;
  title: string;
  subtitle: string;
  styles: Record<string, string>;
  /** Center the header, panels, and buttons (constrained column). */
  center?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const [scanning, setScanning] = useState(false);
  const [camError, setCamError] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [notice, setNotice] = useState("");
  const pathname = usePathname();
  const superAdmin = pathname?.startsWith("/super-admin") ?? false;
  const portal: ScanPortal = superAdmin
    ? "super-admin"
    : pathname?.startsWith("/personnel")
      ? "personnel"
      : "public";

  // Request/issue payloads decode instantly; asset tags need a public lookup,
  // so show the card only when the result (or failure) is ready.
  const handleDecoded = useCallback((text: string, doneNotice: string) => {
    setNotice("Reading QR…");
    void resolveScan(text).then((next) => {
      setResult(next);
      setNotice(doneNotice);
    });
  }, []);

  // Same instant-back-navigation idea as dashboard / deliveries: the last
  // decoded result is kept in memory + sessionStorage and restored on
  // mount, so leaving and returning doesn't lose the scanned info.
  // Runs in an effect so the first render matches the server HTML.
  useEffect(() => {
    try {
      const hit = getClientCache<{ result: ScanResult; notice: string }>(
        CLIENT_CACHE_KEYS.scan
      );
      if (hit) {
        setResult(hit.data.result);
        setNotice(hit.data.notice);
      }
    } catch {
      /* cache unavailable — start empty */
    }
  }, []);

  useEffect(() => {
    if (result) {
      try {
        setClientCache(CLIENT_CACHE_KEYS.scan, { result, notice });
      } catch {
        /* cache unavailable — result still shows */
      }
    }
  }, [result, notice]);

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const tick = useCallback(function frame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(frame);
      return;
    }
    const scale = Math.min(1, 640 / video.videoWidth);
    canvas.width = Math.floor(video.videoWidth * scale);
    canvas.height = Math.floor(video.videoHeight * scale);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(img.data, img.width, img.height);
      if (code?.data) {
        stopCamera();
        handleDecoded(code.data, "QR detected from camera.");
        return;
      }
    }
    rafRef.current = requestAnimationFrame(frame);
  }, [stopCamera, handleDecoded]);

  async function startCamera() {
    setCamError("");
    setNotice("");
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCamError("Camera is not available in this browser.");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
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
      setCamError("Could not open the camera — check permission, or upload an image instead.");
    }
  }

  // Centered pages constrain panels to a readable column and center
  // the header, titles, and buttons; the default stays left-aligned.
  const panelClass = center
    ? `${styles.panel} mx-auto w-full max-w-2xl`
    : styles.panel;
  const titleClass = center
    ? `${styles.panelTitle} text-center`
    : styles.panelTitle;
  const subClass = center ? `${styles.panelSub} text-center` : styles.panelSub;

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>{crumb}</p>
      <div className={center ? "text-center" : undefined}>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.subtitle}>{subtitle}</p>
      </div>

      <Card className={panelClass}>
        <h2 className={titleClass}>Camera</h2>
        <p className={subClass}>Point the camera at the QR code.</p>
        <div
          className={
            center
              ? "flex flex-wrap items-center justify-center gap-2"
              : "flex flex-wrap items-center gap-2"
          }
        >
          {!scanning ? (
            <Button type="button" onClick={() => void startCamera()}>
              Start camera
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={stopCamera}>
              Stop camera
            </Button>
          )}
        </div>
        {camError ? (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {camError}
          </p>
        ) : null}
        <video
          ref={videoRef}
          playsInline
          muted
          className={
            center
              ? "mx-auto mt-3 w-full max-w-md rounded-md border"
              : "mt-3 w-full max-w-md rounded-md border"
          }
          style={{ display: scanning ? "block" : "none" }}
        />
        <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
      </Card>

      {notice ? <p className={subClass}>{notice}</p> : null}

      {result ? (
        <Card className={panelClass}>
          <h2 className={titleClass}>Scanned info</h2>
          {result.kind === "request" ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <tbody>
                  <tr><td>Type</td><td>{requestTypeLabel(result.type)} (completed request)</td></tr>
                  <tr><td>Reference</td><td>{result.ref}</td></tr>
                  <tr><td>Employee</td><td>{result.employee}</td></tr>
                  <tr><td>Handled by</td><td>{result.recipient ?? "—"}</td></tr>
                  <tr><td>Item</td><td>{result.item ?? "—"}</td></tr>
                  <tr><td>Quantity</td><td>{result.qty ?? "—"}</td></tr>
                  <tr><td>From (previous holder)</td><td>{result.from ?? "—"}</td></tr>
                  <tr><td>To (transferred to)</td><td>{result.to ?? "—"}</td></tr>
                  <tr><td>Requested</td><td>{fmtDate(result.requested)}</td></tr>
                  <tr><td>Completed</td><td>{fmtDate(result.resolved)}</td></tr>
                </tbody>
              </table>
            </div>
          ) : result.kind === "issue" ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <tbody>
                  <tr><td>Document</td><td>{result.doc} {result.no ?? ""}</td></tr>
                  <tr><td>Employee</td><td>{result.employee}</td></tr>
                  <tr><td>Account code</td><td>{result.account_code ?? "—"}</td></tr>
                  <tr><td>Article</td><td>{result.article ?? "—"}</td></tr>
                  <tr><td>Quantity</td><td>{result.qty ?? "—"}</td></tr>
                  <tr><td>Date</td><td>{fmtDate(result.date)}</td></tr>
                </tbody>
              </table>
            </div>
          ) : result.kind === "asset" ? (
            result.asset ? (
              <>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <tbody>
                      <tr>
                        <td>Type</td>
                        <td>{result.asset.kind === "stock" ? "Stock item" : "Property / asset"}</td>
                      </tr>
                      <tr>
                        <td>Property No.</td>
                        <td>{result.asset.property_number ?? result.asset.qr_code ?? "—"}</td>
                      </tr>
                      <tr>
                        <td>Item</td>
                        <td>{result.asset.article ?? "—"}</td>
                      </tr>
                      <tr>
                        <td>Description</td>
                        <td>{result.asset.description ?? "—"}</td>
                      </tr>
                      <tr>
                        <td>Category</td>
                        <td>{result.asset.category ?? "—"}</td>
                      </tr>
                      <tr>
                        <td>Status</td>
                        <td>{result.asset.status ?? "—"}</td>
                      </tr>
                      <tr>
                        <td>Condition</td>
                        <td>{result.asset.condition ?? "—"}</td>
                      </tr>
                      <tr>
                        <td>Location</td>
                        <td>{result.asset.location ?? "—"}</td>
                      </tr>
                      <tr>
                        <td>Quantity</td>
                        <td>
                          {[result.asset.quantity, result.asset.unit]
                            .filter((v) => v !== null && v !== "")
                            .join(" ") || "—"}
                        </td>
                      </tr>
                      <tr>
                        <td>Date acquired</td>
                        <td>{fmtDate(result.asset.date_acquired)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className={`${subClass} mt-3 flex flex-wrap items-center gap-2`}>
                  {scanActionsFor(result.ref, portal).map((action) => (
                    <Link
                      key={action.id}
                      href={action.href}
                      className={
                        action.kind === "primary"
                          ? "inline-flex items-center justify-center rounded-full bg-navy-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-navy-800"
                          : "inline-flex items-center justify-center rounded-full border border-navy-200 px-3 py-1.5 text-xs font-semibold text-navy-800 transition-colors hover:bg-navy-50"
                      }
                    >
                      {action.label}
                    </Link>
                  ))}
                </div>
                {portal === "public" ? (
                  <p className={`${subClass} mt-2`}>
                    Sign in to log a repair, request a transfer, or view the
                    full custody history.
                  </p>
                ) : null}
              </>
            ) : (
              <p className={subClass}>
                {result.lookupError ??
                  "This asset tag no longer matches a record — it may have been deleted."}
              </p>
            )
          ) : (
            <p className="whitespace-pre-wrap break-all font-mono text-xs">
              {result.text || "—"}
            </p>
          )}
          {"raw" in result ? (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs font-medium">Raw QR data</summary>
              <p className="mt-1 break-all font-mono text-xs text-zinc-600">{result.raw}</p>
            </details>
          ) : (
            <p className={subClass}>This QR is not a PGSO request, issue, or asset tag.</p>
          )}
        </Card>
      ) : null}
    </section>
  );
}
