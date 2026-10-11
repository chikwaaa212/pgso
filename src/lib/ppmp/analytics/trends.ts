import type { AnalyticsConfig } from "./config";
import type { ItemSeries } from "./series";
import { fmtInt } from "./series";
import type { Trend } from "./types";
import type { CanonicalPpmpRow } from "../types";

/**
 * Sequence-aware trend classification (never "latest > previous" alone):
 * STABLE when the whole range fits the epsilon band, monotonic runs =>
 * INCREASING/DECREASING, anything else => VOLATILE. Nulls in the series
 * mean INSUFFICIENT_DATA (honest gap instead of interpolation).
 */
export function classifyTrend(values: (number | null)[], epsilonPct: number): Trend["qty_class"] {
  if (values.length < 2) return "INSUFFICIENT_DATA";
  if (values.some((v) => v === null)) return "INSUFFICIENT_DATA";
  const nums = values as number[];
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  if (mean === 0) return nums.every((v) => v === 0) ? "STABLE" : "VOLATILE";
  const rangePct = ((Math.max(...nums) - Math.min(...nums)) / Math.abs(mean)) * 100;
  if (rangePct <= epsilonPct) return "STABLE";
  const eps = epsilonPct / 100;
  let up = true;
  let down = true;
  for (let i = 0; i < nums.length - 1; i++) {
    const step = (nums[i + 1] - nums[i]) / Math.max(Math.abs(nums[i]), 1e-9);
    if (step < -eps) up = false;
    if (step > eps) down = false;
  }
  if (up && !down) return "INCREASING";
  if (down && !up) return "DECREASING";
  return "VOLATILE";
}

export function buildTrends(series: ItemSeries[], config: AnalyticsConfig): Trend[] {
  return series
    .filter((s) => s.points.length >= 2)
    .map((s) => {
      const qtySeries = s.points.map((p) => p.qty);
      const cls = classifyTrend(qtySeries, config.trend_epsilon_pct);
      const shown = s.points.map((p) => `${p.year}: ${fmtInt(p.qty)}`).join(", ");
      const trace =
        cls === "INSUFFICIENT_DATA"
          ? `Series [${shown}]: missing quantity in at least one year, or fewer than 2 periods — cannot classify.`
          : `Series [${shown}]: range and step analysis with ±${config.trend_epsilon_pct}% tolerance → ${cls}.`;
      return {
        item_key: s.key,
        description: s.description,
        unit: s.unit,
        series: s.points.map((p) => ({
          year: p.year,
          qty: p.qty,
          budget_cents: p.budget_cents,
        })),
        qty_class: cls,
        calc_trace: trace,
        evidence: s.points.flatMap((p) => p.evidence),
      };
    });
}

/** Re-exported for tests that build rows directly. */
export type { CanonicalPpmpRow };
