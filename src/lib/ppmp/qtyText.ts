import "server-only";

import { parseMoneyToCentavos } from "./money";

export interface ParsedQty {
  qty: number | null;
  unit: string | null;
  /** Unit price hint parsed from "@ price/unit" or "price/unit" fragments. */
  priceCents: number | null;
  /** Description remnant (e.g. "Diesel Fuel" from "Diesel Fuel 60.00/liter"). */
  head: string | null;
  /** True when the cell held quantity-like text but nothing could be read. */
  unparseable: boolean;
}

/**
 * Parse the GPPB "Quantity and Size" free-text cell.
 * Observed shapes: "10 reams", "1 Lot", "1 pc", "1 JO", "1 liter",
 * "Rice @ 2,506.00/sack", "Diesel Fuel 60.00/liter".
 * Never throws; unreadable input yields { qty: null, unit: null } plus
 * unparseable=true so callers record a limitation instead of guessing.
 */
export function parseQuantityText(value: unknown): ParsedQty {
  const empty: ParsedQty = { qty: null, unit: null, priceCents: null, head: null, unparseable: false };
  if (value === null || value === undefined) return empty;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return { ...empty, unparseable: true };
    return { qty: value, unit: null, priceCents: null, head: null, unparseable: false };
  }
  if (typeof value !== "string") return empty;
  const s = value.replace(/\s+/g, " ").trim();
  if (s === "") return empty;

  // Trailing "@ price/unit" or "price/unit" fragment (unit price hint).
  let priceCents: number | null = null;
  let unit: string | null = null;
  let head = s;
  const atMatch = s.match(/@\s*([\d,]+(?:\.\d+)?)\s*\/\s*([A-Za-z.]+)\s*$/);
  if (atMatch) {
    priceCents = parseMoneyToCentavos(atMatch[1]);
    unit = atMatch[2].replace(/\.+$/, "") || null;
    head = s.slice(0, atMatch.index).trim();
  } else {
    const perMatch = s.match(/([\d,]+(?:\.\d+)?)\s*\/\s*([A-Za-z.]+)\s*$/);
    if (perMatch && !/^\s*[\d,]+(?:\.\d+)?\s*\/\s*[A-Za-z.]+\s*$/.test(head)) {
      // "Diesel Fuel 60.00/liter": price/unit suffix after a description.
      priceCents = parseMoneyToCentavos(perMatch[1]);
      unit = perMatch[2].replace(/\.$/, "").replace(/\.\s*$/, "") || null;
      head = s.slice(0, perMatch.index).trim();
    } else if (/^[\d,]+(?:\.\d+)?\s*\/\s*[A-Za-z.]+\s*$/.test(s)) {
      // Bare "60.00/liter": price per unit, no quantity stated.
      const m = s.match(/^([\d,]+(?:\.\d+)?)\s*\/\s*([A-Za-z.]+)\s*$/);
      return {
        qty: null,
        unit: m ? m[2].replace(/\.\s*$/, "") : null,
        priceCents: m ? parseMoneyToCentavos(m[1]) : null,
        head: null,
        unparseable: false,
      };
    }
  }

  // Leading "N unit" quantity.
  const lead = head.match(/^([\d,]+(?:\.\d+)?)\s+([A-Za-z.]+(?:\s+[A-Za-z.]+)?)\s*$/);
  if (lead) {
    const qty = Number(lead[1].replace(/,/g, ""));
    if (!Number.isFinite(qty) || qty < 0)
      return { qty: null, unit, priceCents, head: null, unparseable: true };
    return {
      qty,
      unit: (unit ?? lead[2].replace(/\.\s*$/, "").trim()) || null,
      priceCents,
      head: null,
      unparseable: false,
    };
  }
  // Bare number ("10").
  if (/^[\d,]+(?:\.\d+)?$/.test(head)) {
    const qty = Number(head.replace(/,/g, ""));
    if (!Number.isFinite(qty) || qty < 0)
      return { qty: null, unit, priceCents, head: null, unparseable: true };
    return { qty, unit, priceCents, head: null, unparseable: false };
  }
  // "Rice" (description remnant after stripping "@ price/unit").
  if (head !== "" && head !== s)
    return { qty: null, unit, priceCents, head, unparseable: false };
  return { qty: null, unit, priceCents, head: null, unparseable: head !== "" };
}
