import type { ItemSeries } from "./series";
import { fmtInt, fmtPct, pctChange } from "./series";
import type { Yoy } from "./types";

/** Consecutive-year quantity comparisons (integer-safe inputs). */
export function buildYoy(series: ItemSeries[]): Yoy[] {
  const out: Yoy[] = [];
  for (const s of series) {
    for (let i = 0; i < s.points.length - 1; i++) {
      const a = s.points[i];
      const b = s.points[i + 1];
      if (a.qty === null || b.qty === null) continue;
      const abs = b.qty - a.qty;
      const pct = pctChange(a.qty, b.qty);
      out.push({
        item_key: s.key,
        description: s.description,
        from_year: a.year,
        to_year: b.year,
        prev_qty: a.qty,
        cur_qty: b.qty,
        abs_change: abs,
        pct_change: pct,
        calc_trace:
          `${a.year} → ${b.year}: ${fmtInt(b.qty)} − ${fmtInt(a.qty)} = ${fmtInt(abs)} ` +
          `(${fmtPct(pct)}).`,
      });
    }
  }
  return out;
}

/** First-to-last multi-year change per item (null when uncomputable). */
export function multiYearChange(s: ItemSeries): { abs: number | null; pct: number | null } {
  const first = s.points[0];
  const last = s.points[s.points.length - 1];
  if (!first || !last || first.qty === null || last.qty === null)
    return { abs: null, pct: null };
  return { abs: last.qty - first.qty, pct: pctChange(first.qty, last.qty) };
}

export function averageQty(s: ItemSeries): number | null {
  const qs = s.points.map((p) => p.qty).filter((q): q is number => q !== null);
  if (qs.length !== s.points.length || qs.length === 0) return null;
  return qs.reduce((a, b) => a + b, 0) / qs.length;
}
