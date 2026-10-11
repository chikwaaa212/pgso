import { parseScheduleMonth, splitScheduleRange } from "../schedule";
import { classifyTrend } from "./trends";
import type { CanonicalPpmpRow } from "../types";
import type { DeliveryMomentum, FileInsights } from "./types";
import { evidenceOf } from "./types";
import { formatCentavos } from "../money";

const TOP_N = 10;

interface Bucket {
  name: string;
  lines: number;
  budget: number;
  hasBudget: boolean;
  top: { description: string; budget_cents: number }[];
}

function bucketize(
  rows: CanonicalPpmpRow[],
  keyOf: (r: CanonicalPpmpRow) => string,
  trackTop: boolean
): { name: string; lines: number; budget_cents: number | null; top: { description: string; budget_cents: number }[] }[] {
  const map = new Map<string, Bucket>();
  for (const r of rows) {
    const key = keyOf(r) || "Unspecified";
    let b = map.get(key);
    if (!b) {
      b = { name: key, lines: 0, budget: 0, hasBudget: false, top: [] };
      map.set(key, b);
    }
    b.lines++;
    if (r.budget_cents !== null) {
      b.budget += r.budget_cents;
      b.hasBudget = true;
      if (trackTop) {
        b.top.push({ description: r.description, budget_cents: r.budget_cents });
      }
    }
  }
  return [...map.values()]
    .sort((a, b) => b.budget - a.budget || b.lines - a.lines)
    .slice(0, TOP_N)
    .map((b) => ({
      name: b.name,
      lines: b.lines,
      budget_cents: b.hasBudget ? b.budget : null,
      top: b.top.sort((x, y) => y.budget_cents - x.budget_cents).slice(0, 3),
    }));
}

function sharePct(part: number | null, total: number | null): string {
  if (part === null || total === null || total === 0) return "n/a";
  return `${((part / total) * 100).toFixed(1)}%`;
}

/**
 * Within-file interpretation: works on a single annual PPMP with no
 * history. All narrative lines are deterministic templates over computed
 * numbers — no generative model, every figure traceable to evidence.
 */
export function buildFileInsights(rows: CanonicalPpmpRow[], epsilonPct = 5): FileInsights {
  const budgets = rows.map((r) => r.budget_cents).filter((b): b is number => b !== null);
  const totalBudget = budgets.length > 0 ? budgets.reduce((a, b) => a + b, 0) : null;

  const byCategory = bucketize(rows, (r) => r.category ?? "Unspecified", true);
  const byOffice = bucketize(rows, (r) => r.office ?? "Unspecified", false);
  const byMode = bucketize(rows, (r) => (r.mode ?? "").trim() || "Unspecified", false);

  // Monthly schedule from start/delivery months.
  const starts = new Map<string, number>();
  const deliveries = new Map<string, number>();
  let withStart = 0;
  let withDelivery = 0;
  for (const r of rows) {
    const s = parseScheduleMonth(r.start, r.fiscal_year);
    if (s) {
      withStart++;
      const k = `${s.year}-${String(s.month).padStart(2, "0")}`;
      starts.set(k, (starts.get(k) ?? 0) + 1);
    }
    const [, delEnd] = splitScheduleRange(r.delivery, r.fiscal_year);
    if (delEnd) {
      withDelivery++;
      const k = `${delEnd.year}-${String(delEnd.month).padStart(2, "0")}`;
      deliveries.set(k, (deliveries.get(k) ?? 0) + 1);
    }
  }
  const monthly = (m: Map<string, number>) =>
    [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([month, lines]) => ({ month, lines }));

  // Top items by budget + repeated descriptions.
  const byBudget = [...rows]
    .filter((r) => r.budget_cents !== null)
    .sort((a, b) => (b.budget_cents as number) - (a.budget_cents as number))
    .slice(0, TOP_N);
  const seen = new Map<string, { description: string; count: number; first: CanonicalPpmpRow }>();
  for (const r of rows) {
    const norm = r.description.toLowerCase().replace(/[^a-z0-9]/g, "");
    const hit = seen.get(norm);
    if (hit) hit.count++;
    else seen.set(norm, { description: r.description, count: 1, first: r });
  }
  const duplicates = [...seen.values()]
    .filter((d) => d.count > 1)
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_N)
    .map((d) => ({
      description: d.description,
      occurrences: d.count,
      evidence: rows
        .filter(
          (r) => r.description.toLowerCase().replace(/[^a-z0-9]/g, "") ===
            d.description.toLowerCase().replace(/[^a-z0-9]/g, "")
        )
        .slice(0, 8)
        .map(evidenceOf),
    }));

  const top3 = byCategory.slice(0, 3);
  const top3Sum = top3.every((c) => c.budget_cents !== null)
    ? top3.reduce((a, c) => a + (c.budget_cents as number), 0)
    : null;

  const narrative: string[] = [];
  const offices = new Set(rows.map((r) => r.office ?? "Unspecified")).size;
  const cats = new Set(rows.map((r) => r.category ?? "Unspecified")).size;
  narrative.push(
    `This file holds ${rows.length.toLocaleString("en-PH")} procurement line(s)` +
      (totalBudget !== null ? ` totaling ${formatCentavos(totalBudget)}` : " (no readable budgets)") +
      ` across ${cats} categor${cats === 1 ? "y" : "ies"} and ${offices} office(s).`
  );
  if (byCategory.length > 0 && byCategory[0].budget_cents !== null) {
    const top = byCategory
      .slice(0, 3)
      .map((c) => `'${c.name}' (${formatCentavos(c.budget_cents as number)}, ${sharePct(c.budget_cents, totalBudget)} of spend)`)
      .join(", ");
    narrative.push(
      `Spend leaders: ${top}.` +
        (top3Sum !== null
          ? ` The top 3 categories cover ${sharePct(top3Sum, totalBudget)} of all planned spend.`
          : "")
    );
  }
  if (byMode.length > 0) {
    const modes = byMode
      .slice(0, 3)
      .map((m) => `${m.name} (${m.lines} line(s)${m.budget_cents !== null ? `, ${formatCentavos(m.budget_cents)}` : ""})`)
      .join("; ");
    narrative.push(`Procurement modes in use: ${modes}.`);
  }
  const busyDeliveries = [...deliveries.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
  if (busyDeliveries.length > 0) {
    narrative.push(
      `Busiest delivery months: ${busyDeliveries.map(([m, n]) => `${m} (${n} line(s))`).join(" and ")}.`
    );
  }
  if (duplicates.length > 0) {
    narrative.push(
      `${duplicates.length} description(s) repeat (e.g. '${duplicates[0].description}' ×${duplicates[0].occurrences}) — confirm intentional repeats versus accidental duplicates.`
    );
  }
  const missing = rows.length - withDelivery;
  if (missing > 0) {
    narrative.push(
      `${missing} line(s) carry no readable delivery month and sit outside the quarterly calendar.`
    );
  }

  return {
    totalLines: rows.length,
    totalBudgetCents: totalBudget,
    byCategory,
    byOffice,
    byMode,
    monthlyStarts: monthly(starts),
    monthlyDeliveries: monthly(deliveries),
    scheduleCoverage: { withStart, withDelivery, total: rows.length },
    topItems: byBudget.map((r) => ({
      description: r.description,
      budget_cents: r.budget_cents as number,
      qty: r.qty,
      unit: r.unit,
      category: r.category,
      evidence: [evidenceOf(r)],
    })),
    duplicates,
    deliveryMomentum: buildMomentum(rows, epsilonPct),
    narrative,
  };
}

/**
 * Within-year delivery momentum: monthly scheduled-delivery counts across
 * the modal file year, classified with the same tolerance rules as yearly
 * trends. Zeros count for months with no scheduled deliveries; lines
 * without readable months are excluded and counted (never interpolated).
 */
function buildMomentum(rows: CanonicalPpmpRow[], epsilonPct: number): DeliveryMomentum | null {
  const byYear = new Map<number, number>();
  const dated: { year: number; month: number }[] = [];
  let undated = 0;
  for (const r of rows) {
    const [, delEnd] = splitScheduleRange(r.delivery, r.fiscal_year);
    if (delEnd) {
      dated.push(delEnd);
      byYear.set(delEnd.year, (byYear.get(delEnd.year) ?? 0) + 1);
    } else {
      undated++;
    }
  }
  if (dated.length < 2) return null;
  const year = [...byYear.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const counts = new Array<number>(12).fill(0);
  let inYear = 0;
  for (const d of dated) {
    if (d.year === year) {
      counts[d.month - 1]++;
      inYear++;
    }
  }
  if (inYear < 2) return null;
  // Span January through the last month with any scheduled delivery:
  // trailing empty months (e.g. Jul–Dec for an H1 plan) are out of scope,
  // not zeros. Leading/middle zeros are genuine gaps and count.
  let lastActive = 0;
  for (let i = 0; i < 12; i++) if (counts[i] > 0) lastActive = i;
  const span = counts.slice(0, lastActive + 1);
  const direction = classifyTrend(span, epsilonPct);
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const shown = span.map((n, i) => `${names[i]}: ${n}`).join(", ");
  const spanLabel = lastActive === 11 ? "Jan–Dec" : `Jan–${names[lastActive]}`;
  return {
    year,
    monthly: span.map((lines, i) => ({
      month: `${year}-${String(i + 1).padStart(2, "0")}`,
      lines,
    })),
    direction,
    calc_trace:
      `Monthly scheduled deliveries ${year} (${spanLabel} span) [${shown}]: range and step analysis ` +
      `with ±${epsilonPct}% tolerance → ${direction}. ` +
      `${undated} line(s) lack readable delivery months and are excluded (counted as missing, not as zero).`,
    datedLines: inYear,
    undatedLines: undated,
  };
}
