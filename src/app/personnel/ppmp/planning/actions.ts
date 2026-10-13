'use server';

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import type { EvidenceRef } from "@/lib/ppmp/analytics/types";

const BUCKET = "ppmp-files";
const MAX_FILES = 3;
const MAX_BYTES = 10 * 1024 * 1024;
const PARSER_VERSION = "v1";

export interface PlanningItem {
  item_key: string;
  description: string;
  unit: string | null;
  category: string | null;
  office: string | null;
  mode: string | null;
  proj_type: string | null;
  source_funds: string | null;
  occurrences: number;
  total_qty: number | null;
  qty_readings: number;
  total_budget_cents: number | null;
  budget_readings: number;
  avg_unit_cost_cents: number | null;
  evidence: EvidenceRef[];
  source: string;
}

function evidenceOfRow(r: {
  description: string;
  qty: number | null;
  unit: string | null;
  budget_cents: number | null;
  fiscal_year: number | null;
  source: { filename: string; sheet: string; row: number; hash8: string };
}): EvidenceRef {
  return {
    file: r.source.filename,
    sheet: r.source.sheet,
    row: r.source.row,
    item: r.description,
    qty: r.qty,
    unit: r.unit,
    budget_cents: r.budget_cents,
    fiscal_year: r.fiscal_year,
    hash8: r.source.hash8,
  };
}

/**
 * Aggregate every parsed PPMP line across 1..3 files, including budget-only
 * and quantity-missing rows. Unlike the analytics top-10, this returns the
 * full item list so future planning covers all lines, never just the largest.
 */
export async function getPlanningItems(
  fileIds: string[]
): Promise<{ success?: boolean; error?: string; items?: PlanningItem[]; totalLines?: number }> {
  if (!Array.isArray(fileIds) || fileIds.length === 0)
    return { error: "Select at least one PPMP file." };
  if (fileIds.length > MAX_FILES)
    return { error: `Select at most ${MAX_FILES} files.` };
  const unique = [...new Set(fileIds)];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized." };
  const { getPersonnelScope } = await import("@/lib/personnel-scope");
  const scope = await getPersonnelScope();
  if (scope.isEmpty || !scope.userId) return { error: "Unauthorized." };

  const rows = await prisma.ppmpFile
    .findMany({ where: { id: { in: unique } } })
    .catch(() => null);
  if (!rows || rows.length !== unique.length)
    return { error: "One or more selected files no longer exist." };
  for (const row of rows) {
    if (!scope.isSuperAdmin && row.created_by !== user.id)
      return { error: "You do not have access to one or more selected files." };
  }

  type Raw = {
    item_key: string;
    description: string;
    qty: number | null;
    unit: string | null;
    budget_cents: number | null;
    category: string | null;
    office: string | null;
    mode: string | null;
    /** Parser field name is `type` (GPPB project type). */
    type: string | null;
    source_funds: string | null;
    fiscal_year: number | null;
    source: { filename: string; sheet: string; row: number; hash8: string };
  };
  const all: Raw[] = [];
  for (const row of rows) {
    const useParseCache = !!row.file_hash && (row.file_size ?? 0) <= 150000;
    const { cacheGet, cacheKey } = await import("@/lib/personnel-cache");
    const parseKey = cacheKey("ppmp:parse", { h: row.file_hash ?? row.id, v: PARSER_VERSION });
    const cached = useParseCache
      ? await cacheGet<{ rows: Raw[]; fiscalYear: number | null }>(parseKey)
      : null;
    if (cached && cached.rows.length > 0) {
      all.push(...cached.rows);
      continue;
    }
    const { data: blob, error } = await supabase.storage.from(BUCKET).download(row.storage_path);
    if (error || !blob) return { error: `"${row.filename}" has no stored workbook. Re-upload it.` };
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.length > MAX_BYTES) return { error: `"${row.filename}" exceeds the 10 MB limit.` };
    const { inspectWorkbook } = await import("@/lib/ppmp/inspector");
    const profile = await inspectWorkbook(bytes, { filename: row.filename });
    const fiscalYear = row.fiscal_year ?? profile.fiscalYear;
    const hash8 = (row.file_hash ?? "").slice(0, 8) || "unknown";
    const { parseLineSheet } = await import("@/lib/ppmp/parser");
    for (const sheet of profile.sheets) {
      if (sheet.kind !== "LINE_LIST" || sheet.headerRow === null) continue;
      try {
        const parsed = await parseLineSheet(bytes, sheet.name, sheet.headerRow, {
          fileId: row.id,
          filename: row.filename,
          fileHash8: hash8,
          fiscalYear,
          officeDefault: profile.office,
        });
        all.push(...parsed.rows);
      } catch (e) {
        console.error("[getPlanningItems] parse", sheet.name, e);
      }
    }
  }

  const byKey = new Map<string, Raw[]>();
  for (const r of all) {
    const list = byKey.get(r.item_key) ?? [];
    list.push(r);
    byKey.set(r.item_key, list);
  }

  const items: PlanningItem[] = [...byKey.entries()].map(([item_key, list]) => {
    const first = list[0];
    const qtys = list.map((r) => r.qty).filter((q): q is number => q !== null);
    const budgets = list.map((r) => r.budget_cents).filter((b): b is number => b !== null);
    const total_qty = qtys.length === list.length ? qtys.reduce((a, b) => a + b, 0) : null;
    const total_budget = budgets.length > 0 ? budgets.reduce((a, b) => a + b, 0) : null;
    const avg_unit =
      total_qty !== null && total_qty !== 0 && total_budget !== null
        ? Math.round(total_budget / total_qty)
        : null;
    // Most common non-empty unit/category/office/mode across occurrences.
    const pick = (fn: (r: Raw) => string | null): string | null => {
      const counts = new Map<string, number>();
      for (const r of list) {
        const v = (fn(r) ?? "").trim();
        if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      let best: string | null = null;
      let bestN = 0;
      for (const [k, n] of counts) {
        if (n > bestN) {
          bestN = n;
          best = k;
        }
      }
      return best;
    };
    const ev = list.slice(0, 4).map(evidenceOfRow);
    return {
      item_key,
      description: first.description,
      unit: pick((r) => r.unit),
      category: pick((r) => r.category),
      office: pick((r) => r.office),
      mode: pick((r) => r.mode),
      proj_type: pick((r) => r.type),
      source_funds: pick((r) => r.source_funds),
      occurrences: list.length,
      total_qty,
      qty_readings: qtys.length,
      total_budget_cents: total_budget,
      budget_readings: budgets.length,
      avg_unit_cost_cents: avg_unit,
      evidence: ev,
      source: ev[0] ? `${ev[0].file} · ${ev[0].sheet} · row ${ev[0].row}` : "uploaded workbook",
    };
  });

  items.sort((a, b) => a.description.localeCompare(b.description));
  return { success: true, items: items.slice(0, 200), totalLines: all.length };
}
