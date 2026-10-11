/**
 * Minimal ETag helper (runtime-agnostic, no Node-only imports so route
 * handlers can run on nodejs or edge).
 *
 * ETags are content hashes (`"<len>-<hash>"`), strong enough for 304
 * negotiation on small JSON/template payloads. Authenticated, per-user or
 * per-role responses MUST still send `Cache-Control: private` (never
 * `public`) — the ETag only saves bytes via 304, it does not authorize
 * sharing through proxies/CDNs.
 */

function hashStr(s: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 16777619)
    h2 = Math.imul(h2 + c, 31) | 0
  }
  return `${(h1 >>> 0).toString(16)}${(h2 >>> 0).toString(16)}`
}

export function etagForText(text: string): string {
  return `"${text.length.toString(36)}-${hashStr(text)}"`
}

export function etagForBytes(bytes: Uint8Array): string {
  // Hash a bounded prefix — templates are small (<1MB); full scan is fine
  // but prefix-bounding keeps edge CPU predictable.
  const n = Math.min(bytes.length, 65536)
  let h1 = 0x811c9dc5
  for (let i = 0; i < n; i++) h1 = Math.imul(h1 ^ bytes[i], 16777619)
  return `"${bytes.length.toString(36)}-${(h1 >>> 0).toString(16)}"`
}

/**
 * Returns a 304 when `If-None-Match` matches `etag`, else null (caller sends
 * the 200 with `ETag` + `Cache-Control` headers).
 */
export function notModified(req: Request, etag: string): Response | null {
  try {
    const inm = req.headers.get('if-none-match')
    if (inm && inm.split(',').map((s) => s.trim()).includes(etag)) {
      return new Response(null, {
        status: 304,
        headers: { ETag: etag },
      })
    }
  } catch {
    /* ignore */
  }
  return null
}
