import { parseScheduleMonth, quarterOf, splitScheduleRange } from "../schedule";
import type { CanonicalPpmpRow } from "../types";
import type { QuarterlyCalendar, QuarterCell } from "./types";

export const DELIVERY_QUARTER_RULE =
  "Whole budget counts in the delivery quarter: each line's lump estimated budget lands entirely in the quarter of its expected-delivery month (ranges resolve to the range end). Lines without a readable delivery month sit in Unscheduled and are counted below — never guessed.";

interface Acc {
  starts: number;
  deliveries: number;
  budget: number;
  hasBudget: boolean;
}

/**
 * Quarterly procurement calendar over all parsed lines (all files).
 * Scheduling only: counts of starts/deliveries and budget loading by
 * delivery quarter. Quantity trends/forecasts stay yearly — annual plans
 * cannot support quarterly quantity history without invented data.
 */
export function buildQuarterly(rows: CanonicalPpmpRow[]): {
  calendar: QuarterlyCalendar;
  limitationNotes: string[];
} {
  const cells = new Map<string, Acc & { year: number; quarter: 1 | 2 | 3 | 4 }>();
  let unscheduledStarts = 0;
  let unscheduledDeliveries = 0;
  let unscheduledBudget = 0;
  let hasUnscheduledBudget = false;

  const at = (year: number, quarter: 1 | 2 | 3 | 4) => {
    const key = `${year}-Q${quarter}`;
    let acc = cells.get(key);
    if (!acc) {
      acc = { year, quarter, starts: 0, deliveries: 0, budget: 0, hasBudget: false };
      cells.set(key, acc);
    }
    return acc;
  };

  for (const r of rows) {
    const start = parseScheduleMonth(r.start, r.fiscal_year);
    if (start) at(start.year, quarterOf(start)).starts++;
    else unscheduledStarts++;

    const [, delEnd] = splitScheduleRange(r.delivery, r.fiscal_year);
    if (delEnd) {
      const acc = at(delEnd.year, quarterOf(delEnd));
      acc.deliveries++;
      if (r.budget_cents !== null) {
        acc.budget += r.budget_cents;
        acc.hasBudget = true;
      }
    } else {
      unscheduledDeliveries++;
      if (r.budget_cents !== null) {
        unscheduledBudget += r.budget_cents;
        hasUnscheduledBudget = true;
      }
    }
  }

  const ordered: QuarterCell[] = [...cells.values()]
    .sort((a, b) => a.year - b.year || a.quarter - b.quarter)
    .map((a) => ({
      year: a.year,
      quarter: a.quarter,
      starts: a.starts,
      deliveries: a.deliveries,
      budget_cents: a.hasBudget ? a.budget : null,
    }));

  const limitationNotes: string[] = [];
  if (unscheduledStarts > 0) {
    limitationNotes.push(
      `${unscheduledStarts} line(s) have no readable procurement-start month and are excluded from the starts calendar.`
    );
  }
  if (unscheduledDeliveries > 0) {
    limitationNotes.push(
      `${unscheduledDeliveries} line(s) have no readable delivery month and sit in Unscheduled (budget excluded from quarterly loading).`
    );
  }

  return {
    calendar: {
      cells: ordered,
      unscheduledStarts,
      unscheduledDeliveries,
      unscheduledBudgetCents: hasUnscheduledBudget ? unscheduledBudget : null,
      rule: DELIVERY_QUARTER_RULE,
    },
    limitationNotes,
  };
}
