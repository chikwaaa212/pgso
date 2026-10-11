import type { AnalyticsConfig } from "./config";
import type { ItemSeries } from "./series";
import { fmtInt } from "./series";
import type { Forecast } from "./types";

function smaLast3(ns: number[]): number {
  const last3 = ns.slice(-3);
  return last3.reduce((a, b) => a + b, 0) / last3.length;
}

function regressionNext(ns: number[]): number {
  const n = ns.length;
  const xs = ns.map((_, i) => i);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ns.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ns[i] - meanY);
    den += (xs[i] - meanX) * (xs[i] - meanX);
  }
  const slope = den === 0 ? 0 : num / den;
  return meanY + slope * (n - meanX);
}

function expSmoothLevel(ns: number[], alpha: number): number {
  let level = ns[0];
  for (let i = 1; i < ns.length; i++) level = alpha * ns[i] + (1 - alpha) * level;
  return level;
}

/** One-step-ahead MAPE backtest (fraction, lower is better). */
function mape(ns: number[], predict: (train: number[]) => number): number | null {
  if (ns.length < 2) return null;
  let sum = 0;
  let count = 0;
  for (let i = 1; i < ns.length; i++) {
    const actual = ns[i];
    if (actual === 0) continue;
    const pred = predict(ns.slice(0, i));
    sum += Math.abs((actual - pred) / actual);
    count++;
  }
  return count === 0 ? null : sum / count;
}

/**
 * Honest small-sample forecasting. Below forecast_min_history there is no
 * forecast at all. With 3 periods: SMA(3) + linear regression, LOW
 * confidence. With 4+: adds exponential smoothing and picks the lowest
 * backtest MAPE, capped at MEDIUM. Never ARIMA at this depth.
 */
export function buildForecasts(series: ItemSeries[], config: AnalyticsConfig): Forecast[] {
  const out: Forecast[] = [];
  for (const s of series) {
    const years = s.points.map((p) => p.year);
    const ns = s.points.map((p) => p.qty);
    if (ns.some((q) => q === null)) continue;
    const vals = ns as number[];
    if (vals.length < config.forecast_min_history) continue;
    const cands: { method: string; point: number; err: number | null }[] = [
      { method: "moving_average_3", point: smaLast3(vals), err: mape(vals, smaLast3) },
      { method: "linear_regression", point: regressionNext(vals), err: mape(vals, regressionNext) },
    ];
    if (vals.length >= 4) {
      const alpha = config.smoothing_alpha;
      cands.push({
        method: `exponential_smoothing_alpha_${alpha}`,
        point: expSmoothLevel(vals, alpha),
        err: mape(vals, (t) => expSmoothLevel(t, alpha)),
      });
    }
    const ranked = cands.filter((c) => Number.isFinite(c.point));
    if (ranked.length === 0) continue;
    ranked.sort((a, b) => (a.err ?? Number.POSITIVE_INFINITY) - (b.err ?? Number.POSITIVE_INFINITY));
    const best = ranked[0];
    const pts = ranked.map((c) => c.point);
    const confidence = vals.length === 3 ? "LOW" : "MEDIUM";
    const shown = vals.map((q, i) => `${years[i]}: ${fmtInt(q)}`).join(", ");
    out.push({
      item_key: s.key,
      description: s.description,
      method: best.method,
      point: Math.round(best.point * 100) / 100,
      band_low: Math.round(Math.min(...pts) * 100) / 100,
      band_high: Math.round(Math.max(...pts) * 100) / 100,
      confidence,
      warning: `Forecast confidence is ${confidence} because only ${vals.length} historical period(s) are available. Treat as a planning input, not a commitment.`,
      calc_trace:
        `History [${shown}]. Candidates: ${ranked.map((c) => `${c.method}=${fmtInt(Math.round(c.point * 100) / 100)}`).join("; ")}. ` +
        `Selected lowest backtest MAPE → ${best.method}.`,
      evidence: s.points.flatMap((p) => p.evidence),
    });
  }
  return out;
}
