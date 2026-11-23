/**
 * Public asset-tag payloads.
 *
 * Asset QR tags encode the asset detail-page URL rather than JSON (see
 * `src/lib/qrcode.ts`), so both the scanner and the public lookup endpoint
 * need the same recognition rules. Keep them here so they cannot drift.
 */

export const ASSET_TAG_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Non-sensitive fields safe to show to a signed-out scanner. */
export interface PublicAssetTag {
  kind: "asset" | "stock" | "unit";
  id: string;
  /** Per-piece code for `kind: "unit"` tags (AST_ITM_CODE_xxxx). */
  item_code?: string | null;
  property_number: string | null;
  qr_code: string | null;
  account_code: string | null;
  article: string | null;
  description: string | null;
  category: string | null;
  status: string | null;
  condition: string | null;
  location: string | null;
  quantity: number | null;
  unit: string | null;
  date_acquired: string | null;
}

export interface AssetTagRef {
  id: string;
  kind: "asset" | "stock" | "unit";
}

const ASSET_PATH_RE =
  /\/(?:personnel|super-admin)\/assets\/(?:(stock|unit)\/)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?=$|[/?#])/i;

/**
 * Recognize an asset tag from either an asset page URL (what we generate) or
 * an explicit `{"kind":"PGSO-ASSET","id":"…"}` payload. Returns null for
 * anything else so the caller can fall back to request/issue handling.
 */
export function parseAssetTagRef(text: string): AssetTagRef | null {
  const raw = text.trim();
  if (!raw) return null;

  if (raw.startsWith("{")) {
    try {
      const o = JSON.parse(raw) as Record<string, unknown>;
      if (o.kind === "PGSO-ASSET" && typeof o.id === "string") {
        const id = o.id.trim();
        if (ASSET_TAG_ID_RE.test(id)) {
          const source =
            o.source === "stock" || o.source === "unit"
              ? o.source
              : o.type === "stock" || o.type === "unit"
                ? o.type
                : "asset";
          return { id, kind: source };
        }
      }
    } catch {
      /* not JSON — fall through to URL matching */
    }
  }

  const m = raw.match(ASSET_PATH_RE);
  if (!m) return null;
  const kind = m[1] === "stock" ? "stock" : m[1] === "unit" ? "unit" : "asset";
  return { id: m[2], kind };
}

/** Detail-page path for the current role context. */
export function assetTagHref(ref: AssetTagRef, superAdmin = false): string {
  const base = superAdmin ? "/super-admin/assets" : "/personnel/assets";
  if (ref.kind === "unit") return `${base}/unit/${ref.id}`;
  return ref.kind === "stock" ? `${base}/stock/${ref.id}` : `${base}/${ref.id}`;
}
