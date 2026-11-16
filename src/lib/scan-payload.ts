import type { AssetTagRef, PublicAssetTag } from "./asset-tag";
import type { AssetHistory } from "@/app/personnel/assets/actions";

/**
 * Every QR payload the system can produce.
 *
 * Keep this parser as the single decoder for the scanner UI:
 * - `PGSO-REQUEST` — completed request records (`getCompletedRequestQr`)
 * - `PGSO-ISSUE`   — issued PAR/ICS lines (`qrPayloadFor`)
 * - asset tags     — `/personnel/assets/{id}` URLs (or `PGSO-ASSET` JSON)
 * - anything else  — shown as raw text so a scan never dead-ends
 */
export interface ScanLine {
  description: string;
  quantity: number;
}

/** Staff-only details resolved through the auth-scoped asset action. */
export interface AssetScanEnrichment {
  holderName: string | null;
  assignedToName: string | null;
  accountTitle: string | null;
  unitCost: number | null;
  quantity: number | null;
  location: string | null;
}

export type ScanResult =
  | {
      kind: "request";
      id: string | null;
      ref: string;
      type: string;
      status: string | null;
      employee: string;
      recipient: string | null;
      item: string | null;
      items: number;
      qty: number | null;
      from: string | null;
      to: string | null;
      requested: string | null;
      resolved: string | null;
      lines: ScanLine[];
      raw: string;
    }
  | {
      kind: "issue";
      ref: string | null;
      doc: string;
      no: string | null;
      date: string | null;
      employee: string;
      account_code: string | null;
      account_title: string | null;
      article: string | null;
      asset_type: string | null;
      qty: number | null;
      raw: string;
    }
  | {
      kind: "asset";
      ref: AssetTagRef;
      asset: PublicAssetTag | null;
      enrichment: AssetScanEnrichment | null;
      /** Staff-only assignment/request/repair trail. */
      history?: AssetHistory | null;
      lookupError?: string;
      raw: string;
    }
  | { kind: "raw"; text: string; raw: string };

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function num(v: unknown): number | null {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function linesFrom(v: unknown): ScanLine[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const line = entry as Record<string, unknown>;
    const description = str(line.description);
    if (!description) return [];
    return [{ description, quantity: num(line.quantity) ?? 1 }];
  });
}

export function parseScanPayload(text: string): ScanResult {
  const raw = text.trim();
  if (raw.startsWith("{")) {
    try {
      const o = JSON.parse(raw) as Record<string, unknown>;
      if (o.kind === "PGSO-REQUEST") {
        const lines = linesFrom(o.lines);
        return {
          kind: "request",
          id: str(o.id),
          ref: str(o.ref) ?? "—",
          type: str(o.type) ?? "—",
          status: str(o.status),
          employee: str(o.employee) ?? "—",
          recipient: str(o.recipient),
          item: str(o.item),
          items: num(o.items) ?? lines.length,
          qty: num(o.qty),
          from: str(o.from),
          to: str(o.to),
          requested: str(o.requested),
          resolved: str(o.resolved),
          lines,
          raw,
        };
      }
      if (o.kind === "PGSO-ISSUE") {
        return {
          kind: "issue",
          ref: str(o.ref),
          doc: str(o.doc) ?? "—",
          no: str(o.no),
          date: str(o.date),
          employee: str(o.employee) ?? "—",
          account_code: str(o.account_code),
          account_title: str(o.account_title),
          article: str(o.article),
          asset_type: str(o.asset_type),
          qty: num(o.qty),
          raw,
        };
      }
    } catch {
      /* not JSON — fall through to raw */
    }
  }
  return { kind: "raw", text: raw, raw };
}

/** Short label used by the recent-scan list. */
export function scanResultLabel(result: ScanResult): {
  title: string;
  subtitle: string;
} {
  switch (result.kind) {
    case "request":
      return {
        title: result.ref,
        subtitle: result.employee || "Completed request",
      };
    case "issue":
      return {
        title: [result.doc, result.no].filter(Boolean).join(" ") || "Issued item",
        subtitle: result.employee || "Issuance",
      };
    case "asset":
      return {
        title:
          result.asset?.article ??
          result.asset?.property_number ??
          result.asset?.qr_code ??
          result.ref.id.slice(0, 8).toUpperCase(),
        subtitle:
          result.asset?.kind === "stock"
            ? "Stock item"
            : result.asset?.category ?? "Property / asset",
      };
    default:
      return {
        title: "Unrecognized code",
        subtitle: result.text.slice(0, 64) || "Empty payload",
      };
  }
}
