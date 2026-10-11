import "server-only";

import ExcelJS from "exceljs";
import { HEADER_MIN_SCORE, canonicalField, normalizeHeader, scoreHeaderRow } from "./aliases";
import { clean, rawText } from "./cells";
import { parseMoneyToCentavos } from "./money";
import { parseQuantityText } from "./qtyText";
import type {
  CanonicalPpmpRow,
  LineVariant,
  ValidationIssue,
} from "./types";

export interface ParseContext {
  fileId: string;
  filename: string;
  /** First 8 hex chars of the file sha256 (evidence pointers). */
  fileHash8: string;
  fiscalYear: number | null;
  officeDefault: string | null;
}

export interface LineParseStats {
  lines: number;
  sections: number;
  parents: number;
  skippedBlank: number;
  skippedHelper: number;
  skippedSignature: number;
  skippedTotals: number;
  unparseableQty: number;
  mismatches: number;
}

export interface LineParseResult {
  rows: CanonicalPpmpRow[];
  issues: ValidationIssue[];
  variant: LineVariant;
  stats: LineParseStats;
}

const MAX_COLS = 40;
const MAX_ROW_ISSUES = 200;

/** Values in the "Type" column that are genuinely project types. Anything
 *  else found there (e.g. GUADA article names like "long bond paper") is
 *  treated as the article description. */
const TYPE_TOKENS = /^(goods|services|goods\/services|civil works|consulting.*|travel|lease.*|infrastructure.*)$/i;
const SIGNATURE_RE =
  /prepared by|submitted by|reviewed by|approved by|certified correct|recommending approval|noted by/i;
const TOTAL_RE = /^\s*(total(\s+budget)?|grand\s+total)\b/i;
/** Real PPMP schedule text: "February 2026", "01/2026", "2026-06-01", "June 2026". */
const DATE_LIKE_RE =
  /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4}|\b\d{1,2}\/\d{4}\b|\b\d{4}-\d{2}-\d{2}\b/i;

function isDateLike(raw: string, original: unknown): boolean {
  if (original instanceof Date) return true;
  if (raw === "") return false;
  return DATE_LIKE_RE.test(raw);
}

function isBlankRow(cells: string[]): boolean {
  return cells.every((c) => c === "");
}

function isHelperRowRaw(cells: string[]): boolean {
  return cells.filter((c) => /^column\d{1,2}$/i.test(c.replace(/\s+/g, ""))).length >= 3;
}

interface ColMap {
  desc: number | null;
  type: number | null;
  qty: number | null;
  unit: number | null;
  price: number | null;
  total: number | null;
  mode: number | null;
  preproc: number | null;
  start: number | null;
  end: number | null;
  delivery: number | null;
  funds: number | null;
  budget: number | null;
  docs: number | null;
  remarks: number | null;
  code: number | null;
  office: number | null;
}

interface Candidate {
  excelRow: number;
  descCol: string;
  article: string | null;
  type: string | null;
  qty: number | null;
  unit: string | null;
  qtyStated: boolean;
  qtyNote: string | null;
  /** Description remnant from the quantity cell ("Diesel Fuel", "Rice"). */
  qtyHead: string | null;
  priceCents: number | null;
  totalCents: number | null;
  budgetCents: number | null;
  mode: string | null;
  start: string | null;
  end: string | null;
  delivery: string | null;
  funds: string | null;
  office: string | null;
}

/** Canonical alias-dictionary field -> ColMap key (names differ: e.g. description -> desc). */
const FIELD_TO_COL: Record<string, keyof ColMap> = {
  description: "desc",
  type: "type",
  quantity_text: "qty",
  qty: "qty",
  unit: "unit",
  price: "price",
  total: "total",
  mode: "mode",
  preproc: "preproc",
  start: "start",
  end: "end",
  delivery: "delivery",
  source_funds: "funds",
  budget: "budget",
  docs: "docs",
  remarks: "remarks",
  code: "code",
  office: "office",
};

function mapHeaderCells(headerRaw: string[]): { map: ColMap; rawByField: Map<string, number> } {
  const map: ColMap = {
    desc: null, type: null, qty: null, unit: null, price: null, total: null,
    mode: null, preproc: null, start: null, end: null, delivery: null,
    funds: null, budget: null, docs: null, remarks: null, code: null, office: null,
  };
  const seen = new Set<string>();
  headerRaw.forEach((raw, i) => {
    const field = canonicalField(normalizeHeader(raw));
    if (!field || seen.has(field)) return;
    seen.add(field);
    const key = FIELD_TO_COL[field];
    if (!key || map[key] !== null) return;
    map[key] = i;
  });
  return { map, rawByField: new Map() };
}

/** GUADA-style positional CODE/OFFICE: two blank header cells left of desc. */
function positionalCodeOffice(
  headerRaw: string[],
  descIdx: number,
  probe: (col: number) => boolean
): { code: number; office: number } | null {
  if (descIdx < 2) return null;
  if (headerRaw[descIdx - 1].trim() !== "" || headerRaw[descIdx - 2].trim() !== "") return null;
  if (!probe(descIdx - 2) && !probe(descIdx - 1)) return null;
  return { code: descIdx - 2, office: descIdx - 1 };
}

function detectVariant(map: ColMap, positionalGuada: boolean): LineVariant {
  if (positionalGuada) return "GUADA_NESTED";
  if (map.price !== null && map.total !== null) return "DOPH_SPLIT_QTY";
  if (
    map.mode === null &&
    map.funds === null &&
    map.budget === null &&
    map.total !== null &&
    map.desc !== null
  )
    return "LEGACY_7COL";
  return "GPPB_12COL";
}

/**
 * Parse one LINE_LIST sheet into canonical rows. Pure + deterministic.
 * Throws on unreadable bytes; returns row-level issues (capped) otherwise.
 */
export async function parseLineSheet(
  bytes: Uint8Array,
  sheetName: string,
  headerRow: number,
  ctx: ParseContext
): Promise<LineParseResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  const ws = wb.getWorksheet(sheetName);
  if (!ws) throw new Error(`Sheet "${sheetName}" not found.`);

  const issues: ValidationIssue[] = [];
  const stats: LineParseStats = {
    lines: 0, sections: 0, parents: 0, skippedBlank: 0, skippedHelper: 0,
    skippedSignature: 0, skippedTotals: 0, unparseableQty: 0, mismatches: 0,
  };
  const warn = (issue: ValidationIssue) => {
    if (issues.length < MAX_ROW_ISSUES) issues.push(issue);
  };

  const headerRaw: string[] = [];
  const headerRowObj = ws.getRow(headerRow);
  for (let c = 1; c <= MAX_COLS; c++) headerRaw.push(clean(rawText(headerRowObj.getCell(c).value)));
  const { map } = mapHeaderCells(headerRaw);

  // Positional rescue for split quantity layouts whose price/total/unit
  // header cells are blank (observed in DOPH sheets).
  const rescueUnmappedBetween = (from: number, to: number): number[] => {
    const out: number[] = [];
    for (let c = from + 1; c < to && out.length < 2; c++) {
      const h = headerRaw[c] ?? "";
      const alreadyUsed = Object.values(map).includes(c);
      if (h === "" && !alreadyUsed) out.push(c);
    }
    return out;
  };
  if (map.qty !== null) {
    if (map.unit === null) {
      const next = map.qty + 1;
      const nextNorm = normalizeHeader(headerRaw[next] ?? "");
      // Blank header (DOPH price-adjacent layouts) OR a duplicated
      // quantity header cell (DOPH "Quantity | Quantity" actually means
      // Qty | Unit, confirmed against data rows in DOPH-CATEEL).
      if (
        !Object.values(map).includes(next) &&
        (nextNorm === "" ||
          nextNorm.startsWith("quantity") ||
          nextNorm.startsWith("qty") ||
          nextNorm === "size")
      )
        map.unit = next;
    }
    const modeIdx = map.mode ?? map.funds ?? map.budget ?? MAX_COLS - 1;
    if (map.price === null || map.total === null) {
      const [first, second] = rescueUnmappedBetween(map.qty, modeIdx);
      if (map.price === null && first !== undefined) map.price = first;
      if (map.total === null && second !== undefined) map.total = second;
    }
  }

  // Positional CODE/OFFICE probe against the first data rows.
  let positionalGuada = false;
  if (map.desc !== null && map.code === null && map.desc >= 2) {
    const probe = (col: number): boolean => {
      for (let r = headerRow + 1; r <= Math.min(headerRow + 8, ws.lastRow?.number ?? 0); r++) {
        if (clean(rawText(ws.getRow(r).getCell(col + 1).value)) !== "") return true;
      }
      return false;
    };
    const pos = positionalCodeOffice(headerRaw, map.desc, probe);
    if (pos) {
      map.code = pos.code;
      map.office = pos.office;
      positionalGuada = true;
    }
  }

  const variant = detectVariant(map, positionalGuada);
  if (map.desc === null) {
    issues.push({
      severity: "error",
      sheet: sheetName,
      code: "HEADER_NO_DESCRIPTION",
      message: `Sheet "${sheetName}" header has no description column; rows cannot be attributed.`,
    });
    return { rows: [], issues, variant, stats };
  }

  const cell = (row: ExcelJS.Row, idx: number | null): string =>
    idx === null ? "" : clean(rawText(row.getCell(idx + 1).value));
  const cellRaw = (row: ExcelJS.Row, idx: number | null): unknown =>
    idx === null ? null : row.getCell(idx + 1).value;
  /** Schedule cells keep real Excel dates as ISO text (rawText drops Dates). */
  const dateCell = (row: ExcelJS.Row, idx: number | null): string => {
    if (idx === null) return "";
    const v = row.getCell(idx + 1).value;
    if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
    return clean(rawText(v));
  };

  // Pass 1: coarse classification into candidates.
  const candidates: Candidate[] = [];
  const lastRow = ws.lastRow?.number ?? ws.rowCount;
  for (let r = headerRow + 1; r <= lastRow; r++) {
    const row = ws.getRow(r);
    const all: string[] = [];
    for (let c = 1; c <= MAX_COLS; c++) all.push(clean(rawText(row.getCell(c).value)));
    if (isBlankRow(all)) {
      stats.skippedBlank++;
      continue;
    }
    const normAll = all.map(normalizeHeader);
    if (isHelperRowRaw(all) || scoreHeaderRow(normAll) >= HEADER_MIN_SCORE) {
      // "Column N" helper rows and repeated header blocks (observed in
      // BM MONTOJO R10 and multi-program GUADA sheets).
      stats.skippedHelper++;
      continue;
    }
    if (SIGNATURE_RE.test(all.join(" "))) {
      stats.skippedSignature++;
      continue;
    }
    const descRaw = cell(row, map.desc);
    const funds = cell(row, map.funds);
    if (TOTAL_RE.test(descRaw) || TOTAL_RE.test(funds)) {
      stats.skippedTotals++;
      continue;
    }
    // DOPH-style row shift: the article sits in the Type column position
    // while the description cell is blank (category lives in section rows).
    const typeRaw = cell(row, map.type);
    const desc = descRaw !== "" ? descRaw : !TYPE_TOKENS.test(typeRaw) && typeRaw !== "" ? typeRaw : "";
    const typeShifted = descRaw === "" && desc !== "";

    const qtyRaw = cell(row, map.qty);
    const qtyOrig = cellRaw(row, map.qty);
    const budgetCents = parseMoneyToCentavos(cell(row, map.budget));
    const priceRawCents = parseMoneyToCentavos(cell(row, map.price));
    const totalRawCents = parseMoneyToCentavos(cell(row, map.total));
    const startRaw = dateCell(row, map.start);
    const endRaw = dateCell(row, map.end);
    const deliveryRaw = dateCell(row, map.delivery);
    const qtyStated = qtyRaw !== "";
    // "Stated" means machine-plausible: signatory names sitting in amount
    // or schedule columns must not qualify a row as procurement.
    const amountsStated = budgetCents !== null || priceRawCents !== null || totalRawCents !== null;
    const datesStated =
      isDateLike(startRaw, cellRaw(row, map.start)) ||
      isDateLike(endRaw, cellRaw(row, map.end)) ||
      isDateLike(deliveryRaw, cellRaw(row, map.delivery));

    if (desc === "") continue; // orphan amounts without a description: skip silently
    if (!qtyStated && !amountsStated && !datesStated) {
      // Category / section header (e.g. "FUEL, OIL AND LUBRICANTS EXPENSES",
      // DOPH "Drugs and Medicine Supplies" label rows).
      stats.sections++;
      candidates.push({
        excelRow: r, descCol: desc, article: null, type: null, qty: null, unit: null,
        qtyStated: false, qtyNote: null, qtyHead: null, priceCents: null, totalCents: null,
        budgetCents: null, mode: null, start: null, end: null, delivery: null,
        funds: null, office: null,
      });
      // Mark sections via a sentinel: budget/mode/dates all null + flag in funds.
      candidates[candidates.length - 1].funds = "__SECTION__";
      continue;
    }

    let parsed = { qty: null as number | null, unit: null as string | null, priceCents: null as number | null, head: null as string | null, unparseable: false };
    if (typeof qtyOrig === "number") {
      parsed = { qty: qtyOrig, unit: null, priceCents: null, head: null, unparseable: false };
    } else if (qtyStated) {
      parsed = parseQuantityText(qtyRaw);
    }
    // Signature-block name rows: a description plus junk text only (no
    // amounts, no dates, no readable quantity) — e.g. signatory names
    // under a "Prepared / Submitted / Reviewed by" row. Not procurement.
    if (!amountsStated && !datesStated && parsed.qty === null) {
      stats.skippedSignature++;
      continue;
    }
    if (parsed.unparseable) {
      stats.unparseableQty++;
      warn({
        severity: "warning",
        sheet: sheetName,
        row: r,
        code: "UNPARSEABLE_QTY",
        message: `Row ${r} ("${desc.slice(0, 50)}"): quantity "${qtyRaw.slice(0, 60)}" is not machine-readable; quantity comparison skipped for this line.`,
      });
    }
    const qtyNote: string | null = parsed.unparseable
      ? `quantity "${qtyRaw.slice(0, 60)}" is not machine-readable; quantity comparison skipped for this line`
      : null;
    const unitRaw = cell(row, map.unit);
    const unit = unitRaw !== "" ? unitRaw : parsed.unit;

    // Article vs type disambiguation (GUADA article names sit in the Type column).
    let typeVal: string | null = typeShifted ? null : typeRaw || null;
    let article: string | null = null;
    if (typeVal && !TYPE_TOKENS.test(typeVal)) {
      article = typeVal;
      typeVal = null;
    }

    candidates.push({
      excelRow: r,
      descCol: desc,
      article,
      type: typeVal,
      qty: parsed.qty,
      unit,
      qtyStated,
      qtyNote,
      qtyHead: parsed.head,
      priceCents: parsed.priceCents ?? priceRawCents,
      totalCents: totalRawCents,
      budgetCents: budgetCents,
      mode: cell(row, map.mode) || null,
      start: startRaw || null,
      end: endRaw || null,
      delivery: deliveryRaw || null,
      funds: funds || null,
      office: cell(row, map.office) || null,
    });
  }

  // Pass 2: parent (project-shared budget) detection + emission.
  const rows: CanonicalPpmpRow[] = [];
  let currentSection: string | null = null;
  const isSection = (c: Candidate) => c.funds === "__SECTION__";
  const nextBudgetIdx = (from: number): number => {
    for (let j = from + 1; j < candidates.length; j++) {
      if (isSection(candidates[j])) continue;
      if (candidates[j].budgetCents !== null) return j;
    }
    return -1;
  };
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (isSection(c)) {
      currentSection = c.descCol;
      continue;
    }
    const description = c.article ?? c.qtyHead ?? c.descCol;
    const project =
      description !== c.descCol ? c.descCol : currentSection !== description ? currentSection : null;

    let budgetScope: "line" | "project-shared" | null = "line";
    if (c.budgetCents !== null && c.mode) {
      const nb = nextBudgetIdx(i);
      const end = nb === -1 ? candidates.length : nb;
      const hasChildren = candidates
        .slice(i + 1, end)
        .some((k) => !isSection(k) && k.budgetCents === null && !k.mode);
      if (hasChildren) {
        budgetScope = "project-shared";
        stats.parents++;
        currentSection = description;
      }
    }
    if (c.budgetCents === null && !c.mode) {
      budgetScope = null; // child sharing the parent project budget
    }

    const notes: string[] = [];
    if (c.qtyNote) notes.push(c.qtyNote);
    if (c.qty === null && c.qtyStated) notes.push("lump-sum style line without a readable quantity");
    else if (c.qty === null) notes.push("quantity not stated; budget-only line");
    if (budgetScope === null) notes.push("shares the parent project budget shown on the project row");
    if (budgetScope === "project-shared") notes.push("project budget shared by following sub-items");

    // Total cross-check where qty + price + total are all present.
    if (c.qty !== null && c.priceCents !== null && c.totalCents !== null) {
      const expected = Math.round(c.qty * c.priceCents);
      const tolerance = Math.max(Math.round(Math.abs(expected) * 0.01), 100);
      if (Math.abs(c.totalCents - expected) > tolerance) {
        stats.mismatches++;
        notes.push(
          `stated total differs from qty × price (expected ~${expected / 100}, stated ${c.totalCents / 100})`
        );
        warn({
          severity: "warning",
          sheet: sheetName,
          row: c.excelRow,
          code: "TOTAL_MISMATCH",
          message: `Row ${c.excelRow} ("${description.slice(0, 50)}"): stated total does not match quantity × unit price.`,
        });
      }
    }

    const unitKey = (c.unit ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    rows.push({
      item_key: `${normalizeHeader(description)}|${unitKey}`,
      description,
      project,
      type: c.type,
      qty: c.qty,
      unit: c.unit,
      budget_cents: c.budgetCents,
      budget_scope: budgetScope,
      price_cents: c.priceCents,
      total_cents: c.totalCents,
      mode: c.mode,
      start: c.start,
      end: c.end,
      delivery: c.delivery,
      source_funds: c.funds,
      office: c.office || ctx.officeDefault,
      fiscal_year: ctx.fiscalYear,
      category: sheetName,
      source: {
        file_id: ctx.fileId,
        filename: ctx.filename,
        sheet: sheetName,
        row: c.excelRow,
        hash8: ctx.fileHash8,
      },
      variant,
      confidence: c.qty === null ? "low" : "high",
      calc_notes: notes,
    });
    stats.lines++;
  }

  return { rows, issues, variant, stats };
}
