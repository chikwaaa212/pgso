import "server-only";

/**
 * Money parsing for PPMP amounts. All analytics use integer centavos to
 * avoid floating-point drift (e.g. 0.1 + 0.2). Returns null when the cell
 * does not contain a readable amount — callers must record a limitation,
 * never silently coerce to zero.
 */
export function parseMoneyToCentavos(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return Math.round(value * 100);
  }
  if (value instanceof Date) return null;
  if (typeof value !== "string") return null;
  let s = value.trim();
  if (s === "") return null;
  // Parenthesized accounting negatives: not expected in PPMP budgets;
  // treat as unreadable rather than guessing the sign.
  if (/^\(.*\)$/.test(s)) return null;
  s = s
    .replace(/[₱₽$]/g, "")
    .replace(/\bphp\b/gi, "")
    .replace(/,/g, "")
    .trim();
  // Allow a trailing unit fragment ("5000 / lot" is not a clean amount).
  const m = s.match(/^(-?\d+(?:\.\d{1,4})?)/);
  if (!m) return null;
  // Reject strings with leftover alpha content ("TBD", "5k", "N/A").
  const rest = s.slice(m[1].length).trim();
  if (rest !== "" && /[a-zA-Z]/.test(rest)) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

/** Display helper: centavos -> "₱1,234.50". Formatting only, never used in thresholds. */
export function formatCentavos(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const pesos = Math.floor(abs / 100);
  const rem = String(abs % 100).padStart(2, "0");
  return `${sign}₱${pesos.toLocaleString("en-PH")}.${rem}`;
}
