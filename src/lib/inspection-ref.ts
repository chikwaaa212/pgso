/**
 * Human-readable inspection delivery references.
 *
 * Routes use `INS-<first 8 hex of the delivery UUID>` (e.g. INS-23A4B3FE)
 * instead of the raw UUID, matching the reference shown across the UI.
 * Server readers resolve the reference back to the full UUID.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const REF_RE = /^INS-([0-9a-f]{8})$/i
const BARE_HEX_RE = /^[0-9a-f]{8}$/i

/** Display/link reference for a delivery id. */
export function inspectionRef(deliveryId: string): string {
  return `INS-${deliveryId.slice(0, 8).toUpperCase()}`
}

/** URL for the inspection detail (or a nested tab) of a delivery. */
export function inspectionHref(
  deliveryId: string,
  suffix = "",
  portal: "personnel" | "super-admin" = "personnel"
): string {
  return `/${portal}/inspections/${inspectionRef(deliveryId)}${suffix}`
}

/**
 * Split a route param into a full UUID or an 8-char reference prefix.
 * Accepts the canonical `INS-XXXXXXXX` form, a bare 8-char reference, and
 * legacy full UUIDs so old links keep working.
 */
export function parseInspectionRefParam(
  param: string
): { id?: string; prefix?: string } {
  let value = param
  try {
    value = decodeURIComponent(param)
  } catch {
    value = param
  }
  value = value.trim()

  if (UUID_RE.test(value)) return { id: value }

  const ref = REF_RE.exec(value)
  if (ref) return { prefix: ref[1].toLowerCase() }

  if (BARE_HEX_RE.test(value)) return { prefix: value.toLowerCase() }

  return {}
}
