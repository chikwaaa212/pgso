/**
 * Custom-field bag helpers (pure — no server-only, no DB).
 * User-defined column values live in the `custom_fields` JSONB bag on
 * assets + inventory; only string values are ever stored.
 */

export type CustomBag = Record<string, string>;

/** Normalize a raw JSONB bag into string values. */
export function normalizeCustomBag(bag: unknown): CustomBag {
  if (!bag || typeof bag !== 'object' || Array.isArray(bag)) return {};
  const out: CustomBag = {};
  for (const [k, v] of Object.entries(bag as Record<string, unknown>)) {
    if (v === null || v === undefined) continue;
    out[k] = typeof v === 'string' ? v : String(v);
  }
  return out;
}

/**
 * Parse a `custom_fields::text` column value from the registry UNION query
 * into a CustomBag. Corrupt/NULL text fails closed to {} (never throws).
 */
export function parseCustomBagText(raw: string | null | undefined): CustomBag {
  if (!raw) return {};
  try {
    return normalizeCustomBag(JSON.parse(raw));
  } catch {
    return {};
  }
}
