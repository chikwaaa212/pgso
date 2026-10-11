import { test } from "node:test";
import assert from "node:assert";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectWorkbook } from "../lib/ppmp/inspector";
import { parseLineSheet, type ParseContext } from "../lib/ppmp/parser";
import { parsePivotSheet } from "../lib/ppmp/pivot";

const SAMPLES = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "examples_ppmp"
);

async function load(name: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(join(SAMPLES, name)));
}

function ctxFor(filename: string, fiscalYear: number | null, office: string | null): ParseContext {
  return {
    fileId: "test-file",
    filename,
    fileHash8: "deadbeef",
    fiscalYear,
    officeDefault: office,
  };
}

test("MONTOJO small GPPB sheet parses 3 lines with budgets", async () => {
  const name = "BM MONTOJO PPMP FINAL JAN-JUNE 2026 = = =.xlsx";
  const bytes = await load(name);
  const profile = await inspectWorkbook(bytes, { filename: name });
  const sheet = profile.sheets[0];
  assert.ok(sheet.headerRow !== null);
  const parsed = await parseLineSheet(
    bytes,
    sheet.name,
    sheet.headerRow as number,
    ctxFor(name, profile.fiscalYear, profile.office)
  );
  assert.strictEqual(parsed.variant, "GPPB_12COL");
  assert.strictEqual(parsed.rows.length, 3);
  const fuel = parsed.rows.find((r) => r.description.includes("Diesel"));
  assert.ok(fuel, "diesel line present: " + JSON.stringify(parsed.rows.map((r) => r.description)));
  assert.strictEqual(fuel.qty, null);
  assert.strictEqual(fuel.unit, "liter");
  assert.strictEqual(fuel.budget_cents, 10000000);
  assert.strictEqual(fuel.mode, "SVP");
  assert.strictEqual(fuel.fiscal_year, 2026);
  assert.ok(fuel.office?.includes("MONTOJO"), "office inherited: " + fuel.office);
  const rice = parsed.rows.find((r) => r.description.includes("Rice"));
  assert.ok(rice);
  assert.strictEqual(rice.price_cents, 250600);
  assert.strictEqual(rice.budget_cents, 35560000);
  assert.ok(
    !parsed.issues.some((i) => i.severity === "error"),
    JSON.stringify(parsed.issues)
  );
});

test("DOPH split-qty sheet parses qty/unit/price/total with cross-check", async () => {
  const name = "DOPH-CATEEL = = =.xlsx";
  const bytes = await load(name);
  const profile = await inspectWorkbook(bytes, { filename: name });
  const sheet = profile.sheets.find((s) => s.name === "Other Supplies");
  assert.ok(sheet && sheet.headerRow !== null);
  const parsed = await parseLineSheet(
    bytes,
    sheet.name,
    sheet.headerRow as number,
    ctxFor(name, profile.fiscalYear, profile.office)
  );
  assert.strictEqual(parsed.variant, "DOPH_SPLIT_QTY");
  const soap = parsed.rows.find((r) => r.description.includes("Bath Soap"));
  assert.ok(soap, "soap line present");
  assert.strictEqual(soap.qty, 60);
  assert.strictEqual(soap.unit, "Pcs");
  assert.strictEqual(soap.total_cents, 210000);
  assert.ok(
    !parsed.issues.some((i) => i.code === "TOTAL_MISMATCH"),
    "60 × 35 = 2100 cross-checks: " + JSON.stringify(parsed.issues)
  );
});

test("GUADA nested sheet inherits parent project budget", async () => {
  const name = "GUADA 2026.xlsx";
  const bytes = await load(name);
  const profile = await inspectWorkbook(bytes, { filename: name });
  const sheet = profile.sheets.find((s) => s.name === "Office SUP -OLF");
  assert.ok(sheet && sheet.headerRow !== null);
  const parsed = await parseLineSheet(
    bytes,
    sheet.name,
    sheet.headerRow as number,
    ctxFor(name, profile.fiscalYear, profile.office)
  );
  assert.strictEqual(parsed.variant, "GUADA_NESTED");
  const parent = parsed.rows.find((r) => r.description.includes("Supply and Delivery of Office"));
  assert.ok(parent, "parent project row present");
  assert.strictEqual(parent.budget_cents, 3602270);
  assert.strictEqual(parent.budget_scope, "project-shared");
  const bond = parsed.rows.find((r) => r.description.includes("long bond paper"));
  assert.ok(bond, "child sub-item present");
  assert.strictEqual(bond.qty, 10);
  assert.strictEqual(bond.unit, "reams");
  assert.strictEqual(bond.budget_cents, null);
  assert.strictEqual(bond.budget_scope, null);
  assert.strictEqual(bond.office, "PGO");
});

test("GEN FUND pivot summary parses CODE × OFFICE matrix", async () => {
  const name = "GUADA 2026.xlsx";
  const bytes = await load(name);
  const matrix = await parsePivotSheet(bytes, "GEN FUND - summary");
  assert.ok(matrix.offices.length > 5, `offices: ${matrix.offices.length}`);
  assert.ok(matrix.categories.length > 5, `categories: ${matrix.categories.length}`);
  assert.ok(
    (matrix.grandTotal ?? 0) > 0,
    "grand total positive: " + String(matrix.grandTotal)
  );
});
