import type { ItemSeries } from "./series";
import { fmtPct } from "./series";
import { formatCentavos } from "../money";
import type { CostChange } from "./types";

/** Year-over-year estimated-budget changes with qty-vs-price decomposition. */
export function buildCosts(series: ItemSeries[]): CostChange[] {
  const out: CostChange[] = [];
  for (const s of series) {
    for (let i = 0; i < s.points.length - 1; i++) {
      const a = s.points[i];
      const b = s.points[i + 1];
      if (a.budget_cents === null || b.budget_cents === null) continue;
      const pct =
        a.budget_cents === 0
          ? b.budget_cents === 0
            ? 0
            : null
          : ((b.budget_cents - a.budget_cents) / Math.abs(a.budget_cents)) * 100;
      let qtyDriven: boolean | null = null;
      let qtyPart = "quantity not stated";
      if (a.qty !== null && b.qty !== null) {
        const qtyPct =
          a.qty === 0 ? null : ((b.qty - a.qty) / Math.abs(a.qty)) * 100;
        qtyPart = `quantity ${fmtPct(qtyPct)}`;
        qtyDriven =
          qtyPct === null || pct === null ? null : Math.abs(qtyPct) >= Math.abs(pct);
      }
      out.push({
        item_key: s.key,
        description: s.description,
        from_year: a.year,
        to_year: b.year,
        prev_budget_cents: a.budget_cents,
        cur_budget_cents: b.budget_cents,
        pct_change: pct,
        qty_driven: qtyDriven,
        calc_trace:
          `${formatCentavos(b.budget_cents)} − ${formatCentavos(a.budget_cents)} = ${fmtPct(pct)}; ` +
          `${qtyPart}.`,
        evidence: [...a.evidence, ...b.evidence],
      });
    }
  }
  return out;
}
