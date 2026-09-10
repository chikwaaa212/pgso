/**
 * Shared evaluation rules for asset/stock assignment.
 *
 * Both entry paths — employee-initiated request and personnel-initiated
 * direct assignment — converge here:
 *
 *   1. Personnel reviews the request (employee path only). Denied → end.
 *   2. Issuance check: is the item meant for issuance at all?
 *      Not for issuance → stays in stock, process ends, no document.
 *   3. Value check: total amount > ₱50,000 → PAR, else ICS.
 *   4. Correct document is prepared + signed, then the item is assigned.
 *   5. Employee receives the item + the signed PAR/ICS.
 */

export const ISSUANCE_THRESHOLD = 50_000;

export type AccountabilityDocType = "PAR" | "ICS";

/** > ₱50,000 → PAR, ≤ ₱50,000 → ICS. */
export function resolveDocType(totalAmount: number | null | undefined): AccountabilityDocType {
  const n = Number(totalAmount);
  if (Number.isFinite(n) && n > ISSUANCE_THRESHOLD) return "PAR";
  return "ICS";
}

export function formatPeso(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value)))
    return "—";
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(Number(value));
}

/** Snapshot total for threshold purposes. */
export function issuanceTotal(
  unitCost: number | null | undefined,
  quantity: number | null | undefined,
  fallbackTotal: number | null | undefined = null
): number {
  if (fallbackTotal !== null && fallbackTotal !== undefined && Number.isFinite(Number(fallbackTotal))) {
    return Number(fallbackTotal);
  }
  const u = Number(unitCost);
  const q = Math.max(1, Math.floor(Number(quantity) || 1));
  if (Number.isFinite(u) && u >= 0) return u * q;
  return 0;
}
