import type { AnalyticsConfig } from "./config";
import type { CanonicalPpmpRow } from "../types";
import type { ItemSeries } from "./series";
import { fmtInt, fmtPct, pctChange } from "./series";
import { averageQty } from "./yoy";
import { splitScheduleRange } from "../schedule";
import { evidenceOf } from "./types";
import type { Anomaly } from "./types";

function mean(ns: number[]): number {
  return ns.reduce((a, b) => a + b, 0) / ns.length;
}

function stdev(ns: number[]): number {
  if (ns.length < 2) return 0;
  const m = mean(ns);
  return Math.sqrt(ns.reduce((a, b) => a + (b - m) * (b - m), 0) / (ns.length - 1));
}

/**
 * Transparent rule-based anomaly flags. Every hit is a POTENTIAL ANOMALY
 * requiring human review — never an error/fraud verdict. Small samples
 * fall back to percentage thresholds (z-score needs n>=4 and nonzero sd).
 */
export function buildAnomalies(series: ItemSeries[], config: AnalyticsConfig): Anomaly[] {
  const out: Anomaly[] = [];
  const push = (a: Anomaly) => out.push(a);

  for (const s of series) {
    const pts = s.points;
    if (pts.length < 2) continue;
    const last = pts[pts.length - 1];
    const prev = pts[pts.length - 2];
    const evidence = [...prev.evidence, ...last.evidence];

    // First appearance in the selected years.
    const earlierQty = pts.slice(0, -1).some((p) => p.qty !== null);
    if (!earlierQty && last.qty !== null) {
      push({
        item_key: s.key,
        description: s.description,
        method: "first_appearance",
        threshold: "n/a (no baseline)",
        observed: `${fmtInt(last.qty)} in ${last.year}`,
        baseline: "absent in earlier selected years",
        status: "POTENTIAL ANOMALY",
        message: `Review recommended — "${s.description}" appears for the first time in the selected years.`,
        calc_trace: `No quantity baseline exists before ${last.year}; first stated quantity is ${fmtInt(last.qty)}.`,
        evidence: last.evidence,
      });
      continue;
    }
    // Disappearance in the latest year.
    if (earlierQty && last.qty === null && last.budget_cents === null) {
      push({
        item_key: s.key,
        description: s.description,
        method: "disappearance",
        threshold: "n/a",
        observed: `absent in ${last.year}`,
        baseline: `present in ${pts
          .slice(0, -1)
          .filter((p) => p.qty !== null)
          .map((p) => p.year)
          .join(", ")}`,
        status: "POTENTIAL ANOMALY",
        message: `Review recommended — "${s.description}" was present before but is absent in ${last.year}.`,
        calc_trace: `Stated in earlier years, no quantity or budget stated in ${last.year}.`,
        evidence,
      });
      continue;
    }
    if (prev.qty === null || last.qty === null) continue;

    // Year-over-year spike.
    const pct = pctChange(prev.qty, last.qty);
    if (pct !== null && Math.abs(pct) >= config.qty_increase_pct && prev.qty !== 0) {
      push({
        item_key: s.key,
        description: s.description,
        method: "yoy_spike",
        threshold: `|change| ≥ ${config.qty_increase_pct}%`,
        observed: `${fmtInt(last.qty)} in ${last.year} (${fmtPct(pct)} vs ${prev.year})`,
        baseline: `${fmtInt(prev.qty)} in ${prev.year}`,
        status: "POTENTIAL ANOMALY",
        message: `Review recommended — quantity changed by ${fmtPct(pct)} year over year, beyond the ${config.qty_increase_pct}% review threshold.`,
        calc_trace: `${fmtInt(last.qty)} − ${fmtInt(prev.qty)} = ${fmtInt(last.qty - prev.qty)} (${fmtPct(pct)}).`,
        evidence,
      });
    }

    // Deviation from the item's own history (z-score, needs depth).
    const hist = pts.slice(0, -1).map((p) => p.qty).filter((q): q is number => q !== null);
    if (hist.length >= 3) {
      const m = mean(hist);
      const sd = stdev(hist);
      if (sd > 0) {
        const z = (last.qty - m) / sd;
        if (Math.abs(z) >= config.anomaly_z) {
          push({
            item_key: s.key,
            description: s.description,
            method: "z_score",
            threshold: `|z| ≥ ${config.anomaly_z}`,
            observed: `${fmtInt(last.qty)} in ${last.year} (z=${z.toFixed(2)})`,
            baseline: `mean ${m.toFixed(2)} over ${hist.length} earlier year(s)`,
            status: "POTENTIAL ANOMALY",
            message: `Review recommended — latest quantity deviates significantly from this item's own history.`,
            calc_trace: `z = (${fmtInt(last.qty)} − ${m.toFixed(2)}) / ${sd.toFixed(2)} = ${z.toFixed(2)}.`,
            evidence,
          });
        }
      }
    }

    // Current proposal vs historical average.
    const avg = averageQty({ ...s, points: pts.slice(0, -1) });
    if (avg !== null && avg !== 0) {
      const dev = ((last.qty - avg) / Math.abs(avg)) * 100;
      if (Math.abs(dev) >= config.qty_increase_pct && Math.abs(dev) > Math.abs(pct ?? 0)) {
        push({
          item_key: s.key,
          description: s.description,
          method: "vs_average",
          threshold: `|deviation| ≥ ${config.qty_increase_pct}%`,
          observed: `${fmtInt(last.qty)} in ${last.year} (${fmtPct(dev)} vs average)`,
          baseline: `historical average ${avg.toFixed(2)}`,
          status: "POTENTIAL ANOMALY",
          message: `Review recommended — proposed quantity is significantly above/below the historical average.`,
          calc_trace: `(${fmtInt(last.qty)} − ${avg.toFixed(2)}) / ${avg.toFixed(2)} = ${fmtPct(dev)}.`,
          evidence,
        });
      }
    }

    // Cost divergence: budget jumps while quantity is flat.
    const pb = prev.budget_cents;
    const lb = last.budget_cents;
    if (pb !== null && lb !== null && pb !== 0) {
      const budgetPct = ((lb - pb) / Math.abs(pb)) * 100;
      const qtyPct = pct ?? 0;
      if (Math.abs(budgetPct) >= config.cost_increase_pct && Math.abs(qtyPct) <= 10) {
        push({
          item_key: s.key,
          description: s.description,
          method: "cost_divergence",
          threshold: `|budget Δ| ≥ ${config.cost_increase_pct}% with |qty Δ| ≤ 10%`,
          observed: `budget ${fmtPct(budgetPct)} vs quantity ${fmtPct(pct)}`,
          baseline: `previous budget ${pb / 100}, quantity ${fmtInt(prev.qty)}`,
          status: "POTENTIAL ANOMALY",
          message: `Review recommended — estimated cost moved while quantity stayed flat; verify the unit-cost basis.`,
          calc_trace: `Budget Δ ${fmtPct(budgetPct)} with quantity Δ ${fmtPct(pct)}.`,
          evidence,
        });
      }
    }
  }
  return out;
}

function median(ns: number[]): number {
  const sorted = [...ns].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Within-file flags for single-file runs (no history available):
 * unreadable delivery months (summarized, not per-line), budget outliers
 * against their own category's median, and repeated descriptions.
 * Same advisory language as cross-year flags.
 */
export function buildFileAnomalies(rows: CanonicalPpmpRow[]): Anomaly[] {
  const out: Anomaly[] = [];

  const undated = rows.filter((r) => {
    const [, delEnd] = splitScheduleRange(r.delivery, r.fiscal_year);
    return delEnd === null;
  });
  if (undated.length > 0) {
    out.push({
      item_key: "__missing_schedule__",
      description: `${undated.length} line(s) without a readable delivery month`,
      method: "missing_schedule",
      threshold: "any unreadable delivery month",
      observed: `${undated.length} of ${rows.length} line(s)`,
      baseline: "a readable expected-delivery month per line",
      status: "POTENTIAL ANOMALY",
      message: `Review recommended — ${undated.length} line(s) carry no readable delivery month and sit outside the quarterly calendar. Confirm schedules before finalizing.`,
      calc_trace: `${undated.length} / ${rows.length} lines have no parseable delivery month (blank or free text like "as needed").`,
      evidence: undated.slice(0, 8).map(evidenceOf),
    });
  }

  const byCategory = new Map<string, CanonicalPpmpRow[]>();
  for (const r of rows) {
    if (r.budget_cents === null) continue;
    const key = r.category ?? "Unspecified";
    const list = byCategory.get(key) ?? [];
    list.push(r);
    byCategory.set(key, list);
  }
  const outlierHits: { r: CanonicalPpmpRow; ratio: number; med: number }[] = [];
  for (const [, list] of byCategory) {
    if (list.length < 4) continue;
    const med = median(list.map((r) => r.budget_cents as number));
    if (med <= 0) continue;
    for (const r of list) {
      const ratio = (r.budget_cents as number) / med;
      if (ratio >= 3 || ratio <= 1 / 3) outlierHits.push({ r, ratio, med });
    }
  }
  outlierHits
    .sort((a, b) => Math.max(b.ratio, 1 / b.ratio) - Math.max(a.ratio, 1 / a.ratio))
    .slice(0, 10)
    .forEach(({ r, ratio, med }) => {
      const high = ratio >= 3;
      out.push({
        item_key: r.item_key,
        description: r.description,
        method: "category_outlier",
        threshold: "budget ≥3× or ≤⅓ of category median",
        observed: `${(r.budget_cents as number) / 100} vs median ${med / 100} (${ratio.toFixed(1)}×)`,
        baseline: `median of ${r.category ?? "its category"}`,
        status: "POTENTIAL ANOMALY",
        message: high
          ? `Review recommended — "${r.description}" is budgeted far above its category's typical range. Verify the amount.`
          : `Review recommended — "${r.description}" is budgeted far below its category's typical range. Verify nothing is missing.`,
        calc_trace: `Line budget / category median = ${ratio.toFixed(2)} (threshold ≥3 or ≤0.33).`,
        evidence: [evidenceOf(r)],
      });
    });

  const byDesc = new Map<string, { description: string; rows: CanonicalPpmpRow[] }>();
  for (const r of rows) {
    const norm = r.description.toLowerCase().replace(/[^a-z0-9]/g, "");
    const hit = byDesc.get(norm);
    if (hit) hit.rows.push(r);
    else byDesc.set(norm, { description: r.description, rows: [r] });
  }
  [...byDesc.values()]
    .filter((d) => d.rows.length > 1)
    .sort((a, b) => b.rows.length - a.rows.length)
    .slice(0, 5)
    .forEach((d) => {
      out.push({
        item_key: d.rows[0].item_key,
        description: d.description,
        method: "duplicate_description",
        threshold: "same description more than once",
        observed: `×${d.rows.length}`,
        baseline: "one line per distinct item",
        status: "POTENTIAL ANOMALY",
        message: `Review recommended — "${d.description}" appears ${d.rows.length} times. Confirm intentional repeats versus accidental duplicates.`,
        calc_trace: `${d.rows.length} lines share the normalized description "${d.description.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 40)}".`,
        evidence: d.rows.slice(0, 5).map(evidenceOf),
      });
    });

  return out;
}
