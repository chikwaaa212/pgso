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
  kind: "asset" | "stock";
  id: string;
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
  kind: "asset" | "stock";
}

const ASSET_PATH_RE =
  /\/personnel\/assets\/(?:(stock)\/)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?=$|[/?#])/i;

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
          return {
            id,
            kind: o.source === "stock" || o.type === "stock" ? "stock" : "asset",
          };
        }
      }
    } catch {
      /* not JSON — fall through to URL matching */
    }
  }

  const m = raw.match(ASSET_PATH_RE);
  if (!m) return null;
  return { id: m[2], kind: m[1] ? "stock" : "asset" };
}

/** Detail-page path for the current role context. */
export function assetTagHref(ref: AssetTagRef, superAdmin = false): string {
  const base = superAdmin ? "/super-admin/assets" : "/personnel/assets";
  return ref.kind === "stock" ? `${base}/stock/${ref.id}` : `${base}/${ref.id}`;
}
