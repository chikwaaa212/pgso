import { test } from "node:test";
import assert from "node:assert";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { CanonicalPpmpRow } from "../lib/ppmp/types";
import { buildFileInsights } from "../lib/ppmp/analytics/fileInsights";
import { inspectWorkbook } from "../lib/ppmp/inspector";
import { parseLineSheet } from "../lib/ppmp/parser";

function row(
  desc: string,
  opts: Partial<CanonicalPpmpRow> & { budget?: number | null; start?: string | null; delivery?: string | null }
): CanonicalPpmpRow {
  return {
    item_key: desc.toLowerCase().replace(/[^a-z0-9]/g, "") + "|pcs",
    description: desc,
    project: null,
    type: "Goods",
    qty: 10,
    unit: "pcs",
    budget_cents: opts.budget === null || opts.budget === undefined ? null : Math.round(opts.budget * 100),
    budget_scope: "line",
    price_cents: null,
    total_cents: null,
    mode: (opts as { mode?: string }).mode ?? "SVP",
    start: opts.start ?? null,
    end: null,
    delivery: opts.delivery ?? null,
    source_funds: "General Fund",
    office: "PGO",
    fiscal_year: 2026,
    category: (opts as { category?: string }).category ?? "Office Supplies",
    source: {
      file_id: "f",
      filename: "PPMP_2026.xlsx",
      sheet: "S",
      row: 1,
      hash8: "deadbeef",
    },
    variant: "GPPB_12COL",
    confidence: "high",
    calc_notes: [],
  };
}

test("breakdowns, concentration, duplicates, narrative", () => {
  const rows = [
    row("Bond paper", { budget: 100000, category: "Office Supplies", start: "Jan-2026", delivery: "Feb 2026" }),
    row("Bond paper", { budget: 50000, category: "Office Supplies", start: "Jan-2026", delivery: "Feb 2026" }),
    row("Diesel", { budget: 200000, category: "Fuel", start: "Mar-2026", delivery: "Mar-2026" }),
    row("Ink", { budget: null, category: "Office Supplies", start: null, delivery: null }),
  ];
  const insights = buildFileInsights(rows);
  assert.strictEqual(insights.totalLines, 4);
  assert.strictEqual(insights.totalBudgetCents, 35000000);
  assert.strictEqual(insights.byCategory[0].name, "Fuel");
  assert.strictEqual(insights.duplicates.length, 1);
  assert.strictEqual(insights.duplicates[0].occurrences, 2);
  assert.strictEqual(insights.scheduleCoverage.withDelivery, 3);
  assert.ok(insights.narrative.length >= 4, "narrative present: " + JSON.stringify(insights.narrative));
  assert.ok(insights.narrative[0].includes("4 procurement line(s)"));
  assert.ok(insights.monthlyDeliveries.some((m) => m.month === "2026-02" && m.lines === 2));
  const fuel = insights.byCategory.find((c) => c.name === "Fuel");
  assert.ok(fuel, "fuel slice present");
  assert.strictEqual(fuel.top[0].description, "Diesel");
  assert.strictEqual(fuel.top[0].budget_cents, 20000000);
});

test("GUADA-scale sheets yield sane file insights", { timeout: 180000 }, async () => {
  const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "examples_ppmp");
  const name = "GUADA 2026.xlsx";
  const bytes = new Uint8Array(await readFile(join(dir, name)));
  const profile = await inspectWorkbook(bytes, { filename: name });
  const all: CanonicalPpmpRow[] = [];
  // Subset only (3 sheets): full-workbook parsing is covered by the
  // inspector/parser tests; this checks insight aggregation at scale.
  const subset = profile.sheets.filter((s) => s.kind === "LINE_LIST" && s.headerRow !== null).slice(0, 3);
  for (const s of subset) {
    const parsed = await parseLineSheet(bytes, s.name, s.headerRow as number, {
      fileId: "f",
      filename: name,
      fileHash8: "deadbeef",
      fiscalYear: 2026,
      officeDefault: null,
    });
    all.push(...parsed.rows);
  }
  const insights = buildFileInsights(all);
  assert.ok(insights.totalLines > 50, `lines: ${insights.totalLines}`);
  assert.ok((insights.totalBudgetCents ?? 0) > 0);
  assert.ok(insights.byCategory.length >= 2, `categories: ${insights.byCategory.length}`);
  assert.ok(insights.narrative.length >= 3);
  assert.ok(insights.narrative[0].includes("procurement line(s)"));
});
