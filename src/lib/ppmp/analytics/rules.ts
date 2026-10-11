import type { AnalyticsConfig } from "./config";
import type { ItemSeries } from "./series";
import { fmtInt, fmtPct } from "./series";
import { averageQty, multiYearChange } from "./yoy";
import type { Anomaly, CostChange, Forecast, Recommendation } from "./types";

/**
 * Deterministic decision-support rules. Each recommendation carries the
 * rule id, the worked calculation, and evidence — advisory only, always
 * "review recommended", never an approval/rejection/fraud verdict.
 */
export function buildRecommendations(
  series: ItemSeries[],
  anomalies: Anomaly[],
  costs: CostChange[],
  forecasts: Forecast[],
  config: AnalyticsConfig,
  inventory?: { onHand: Map<string, number> }
): Recommendation[] {
  const out: Recommendation[] = [];

  for (const s of series) {
    if (s.points.length < 2) continue;
    const { pct } = multiYearChange(s);
    const first = s.points[0];
    const last = s.points[s.points.length - 1];
    if (pct !== null && Math.abs(pct) > config.qty_increase_pct && first.qty !== null && last.qty !== null) {
      out.push({
        rule_id: "QTY_MULTI_YR",
        message: `Review recommended — "${s.description}" changed by ${fmtPct(pct)} from ${first.year} to ${last.year}. Review projected quantity against actual consumption and available inventory before finalizing the next PPMP.`,
        calc_trace: `${fmtInt(last.qty)} − ${fmtInt(first.qty)} = ${fmtInt(last.qty - first.qty)} (${fmtPct(pct)}); threshold ±${config.qty_increase_pct}%.`,
        evidence_refs: [first.evidence[0], last.evidence[0]].filter((e) => e !== undefined),
      });
    }
    const avg = averageQty(s);
    if (avg !== null && avg !== 0 && last.qty !== null) {
      const over = ((last.qty - avg) / Math.abs(avg)) * 100;
      if (over > config.qty_increase_pct) {
        out.push({
          rule_id: "QTY_ABOVE_AVG",
          message: `Review quantity justification — "${s.description}" in ${last.year} exceeds the historical average by ${fmtPct(over)}.`,
          calc_trace: `Average (${s.points.map((p) => fmtInt(p.qty)).join(" + ")}) / ${s.points.length} = ${avg.toFixed(2)}; (${fmtInt(last.qty)} − ${avg.toFixed(2)}) / ${avg.toFixed(2)} = ${fmtPct(over)}; threshold +${config.qty_increase_pct}%.`,
          evidence_refs: last.evidence,
        });
      }
    }
    if (inventory && last.qty !== null) {
      const stock = inventory.onHand.get(s.key);
      if (stock !== undefined && avg !== null && avg > 0 && last.qty >= avg && stock >= avg) {
        const cover = stock / avg;
        out.push({
          rule_id: "STOCK_COVER",
          message: `Review recommended because current stock (${fmtInt(stock)} on hand, ~${cover.toFixed(1)}× average annual use) and historical utilization should be considered before approving ${fmtInt(last.qty)} more.`,
          calc_trace: `Cover = ${fmtInt(stock)} / ${avg.toFixed(2)} = ${cover.toFixed(2)}×; proposed ${fmtInt(last.qty)} ≥ average ${avg.toFixed(2)}.`,
          evidence_refs: last.evidence,
        });
      }
    }
  }

  for (const c of costs) {
    if (c.pct_change !== null && Math.abs(c.pct_change) > config.cost_increase_pct) {
      out.push({
        rule_id: "COST_JUMP",
        message: `Review cost basis — "${c.description}" estimated budget changed by ${fmtPct(c.pct_change)} from ${c.from_year} to ${c.to_year}.`,
        calc_trace: c.calc_trace,
        evidence_refs: c.evidence,
      });
    }
  }

  for (const a of anomalies) {
    out.push({
      rule_id: "ANOMALY_REVIEW",
      message: `Potential anomaly requiring review — ${a.message}`,
      calc_trace: `[${a.method}] ${a.calc_trace}`,
      evidence_refs: a.evidence,
    });
  }

  for (const f of forecasts) {
    if (f.confidence === "LOW") {
      out.push({
        rule_id: "FORECAST_CONFIRM",
        message: `Confirm forecast with consumption data — "${f.description}" estimate (${fmtInt(f.point)}) is LOW confidence with only ${f.evidence.length > 0 ? "3" : "few"} historical periods.`,
        calc_trace: f.calc_trace,
        evidence_refs: f.evidence,
      });
    }
  }

  return out;
}
