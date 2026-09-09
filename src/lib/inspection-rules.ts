export interface QtyCheck {
  id: string;
  actualQty: string | number;
}

export interface PoItem {
  id: string;
  quantity: number;
  stocked_qty?: number | null;
}

/**
 * Passed is only allowed when every item's effective received quantity
 * exactly equals its PO quantity.
 */
export function isPassedAllowed(
  checks: QtyCheck[],
  items: PoItem[]
): boolean {
  if (items.length === 0) return false;
  return items.every((item) => {
    const check = checks.find((c) => c.id === item.id);
    if (!check) return false;
    const actual = Number(check.actualQty);
    return Number.isFinite(actual) && actual === item.quantity;
  });
}

/** Outstanding balance for an item: PO qty minus already-counted receipts. */
export function remainingOf(item: PoItem): number {
  return Math.max(0, item.quantity - (item.stocked_qty ?? 0));
}

/**
 * The questioning form collects this round's received quantity per item.
 * Convert to cumulative totals (already-counted + this round) for the
 * Passed gate, the saved record, and the stock watermark math.
 */
export function toCumulative(
  checks: QtyCheck[],
  items: PoItem[]
): { id: string; actualQty: number }[] {
  return checks.map((c) => {
    const item = items.find((i) => i.id === c.id);
    const base = item?.stocked_qty ?? 0;
    const round = c.actualQty === "" ? 0 : Number(c.actualQty);
    const clean = Number.isFinite(round) && round > 0 ? round : 0;
    return { id: c.id, actualQty: base + clean };
  });
}
