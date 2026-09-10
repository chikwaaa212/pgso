"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestTypeLabel } from "@/app/personnel/requests/request-types";

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

/** Shared camera / upload / paste QR scanner for personnel and admin. */
export function QrScanner({
  crumb,
  title,
  subtitle,
  styles,
}: {
  crumb: string;
  title: string;
  subtitle: string;
  styles: Record<string, string>;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const [scanning, setScanning] = useState(false);
  const [camError, setCamError] = useState("");
  const [pasted, setPasted] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [notice, setNotice] = useState("");

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const tick = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(tick);
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
        setResult(parsePayload(code.data));
        setNotice("QR detected from camera.");
        stopCamera();
        return;
      }
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [stopCamera]);

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

  function decodeFile(file: File) {
    setNotice("");
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const scale = Math.min(1, 1200 / Math.max(img.naturalWidth, img.naturalHeight));
        canvas.width = Math.floor(img.naturalWidth * scale);
        canvas.height = Math.floor(img.naturalHeight * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(data.data, data.width, data.height);
        if (code?.data) {
          setResult(parsePayload(code.data));
          setNotice(`Decoded from ${file.name}.`);
        } else {
          setNotice("No QR code found in that image.");
        }
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setNotice("Could not read that image file.");
    };
    img.src = url;
  }

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>{crumb}</p>
      <div>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.subtitle}>{subtitle}</p>
      </div>

      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>Camera</h2>
        <p className={styles.panelSub}>Point the camera at the QR code.</p>
        <div className="flex flex-wrap items-center gap-2">
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
          className="mt-3 w-full max-w-md rounded-md border"
          style={{ display: scanning ? "block" : "none" }}
        />
        <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
      </Card>

      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>Upload image</h2>
        <p className={styles.panelSub}>Decode a saved QR photo or screenshot.</p>
        <Input
          type="file"
          accept="image/*"
          aria-label="Upload QR image"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) decodeFile(f);
            e.target.value = "";
          }}
        />
      </Card>

      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>Paste QR data</h2>
        <p className={styles.panelSub}>Paste copied QR data to view it.</p>
        <div className="grid gap-2">
          <Label htmlFor="qr-paste" className="sr-only">
            QR data
          </Label>
          <textarea
            id="qr-paste"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            rows={3}
            placeholder='e.g. {"v":1,"kind":"PGSO-REQUEST",…}'
            className="border-input placeholder:text-muted-foreground flex w-full rounded-md border bg-transparent px-3 py-2 font-mono text-xs shadow-xs outline-none"
          />
          <div>
            <Button
              type="button"
              variant="outline"
              disabled={pasted.trim() === ""}
              onClick={() => {
                setNotice("");
                setResult(parsePayload(pasted));
              }}
            >
              Decode pasted data
            </Button>
          </div>
        </div>
      </Card>

      {notice ? <p className={styles.panelSub}>{notice}</p> : null}

      {result ? (
        <Card className={styles.panel}>
          <h2 className={styles.panelTitle}>Scanned info</h2>
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
          ) : (
            <p className="whitespace-pre-wrap break-all font-mono text-xs">
              {result.text || "—"}
            </p>
          )}
          {result.kind !== "raw" ? (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs font-medium">Raw QR data</summary>
              <p className="mt-1 break-all font-mono text-xs text-zinc-600">{result.raw}</p>
            </details>
          ) : (
            <p className={styles.panelSub}>Not a PGSO request or issue QR — showing raw content.</p>
          )}
        </Card>
      ) : null}
    </section>
  );
}
