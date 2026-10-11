import type { CanonicalPpmpRow } from "../types";
import type { EvidenceRef, YearFile } from "./types";
import { evidenceOf } from "./types";

/** One item's yearly observations (duplicates within a year aggregated). */
export interface ItemSeries {
  key: string;
  description: string;
  unit: string | null;
  points: {
    year: number;
    qty: number | null;
    budget_cents: number | null;
    evidence: EvidenceRef[];
  }[];
}

function yearOf(row: CanonicalPpmpRow, fallback: number | null): number | null {
  return row.fiscal_year ?? fallback;
}

/**
 * Group rows by item_key across resolved fiscal years. Rows without any
 * resolvable year are counted separately (caller records a limitation).
 */
export function buildSeries(files: YearFile[]): { series: ItemSeries[]; yearless: number } {
  const byKey = new Map<string, { description: string; unit: string | null; byYear: Map<number, CanonicalPpmpRow[]> }>();
  let yearless = 0;
  for (const f of files) {
    for (const r of f.rows) {
      const y = yearOf(r, f.fiscalYear);
      if (y === null) {
        yearless++;
        continue;
      }
      let entry = byKey.get(r.item_key);
      if (!entry) {
        entry = { description: r.description, unit: r.unit, byYear: new Map() };
        byKey.set(r.item_key, entry);
      }
      const list = entry.byYear.get(y) ?? [];
      list.push(r);
      entry.byYear.set(y, list);
      // Keep the most recent description spelling for display.
      entry.description = r.description;
      if (r.unit) entry.unit = r.unit;
    }
  }
  const series: ItemSeries[] = [];
  for (const [key, entry] of byKey) {
    const points = [...entry.byYear.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([year, rows]) => {
        const qtys = rows.map((r) => r.qty).filter((q): q is number => q !== null);
        const budgets = rows
          .map((r) => r.budget_cents)
          .filter((b): b is number => b !== null);
        return {
          year,
          qty: qtys.length === rows.length ? qtys.reduce((a, b) => a + b, 0) : null,
          budget_cents:
            budgets.length > 0 ? budgets.reduce((a, b) => a + b, 0) : null,
          evidence: rows.map(evidenceOf),
        };
      });
    series.push({ key, description: entry.description, unit: entry.unit, points });
  }
  series.sort((a, b) => a.description.localeCompare(b.description));
  return { series, yearless };
}

/** Percentage change; null when undefined (no baseline). */
export function pctChange(prev: number, cur: number): number | null {
  if (prev === 0) return cur === 0 ? 0 : null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

export function fmtPct(pct: number | null): string {
  if (pct === null) return "n/a (no baseline)";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

export function fmtInt(n: number | null): string {
  if (n === null) return "not stated";
  return Number.isInteger(n) ? n.toLocaleString("en-PH") : n.toFixed(2);
}
