import { test } from "node:test";
import assert from "node:assert";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectWorkbook } from "../lib/ppmp/inspector";
import { normalizeHeader, scoreHeaderRow } from "../lib/ppmp/aliases";

const SAMPLES = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "examples_ppmp"
);

async function load(name: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(join(SAMPLES, name)));
}

test("header normalization and scoring", () => {
  assert.strictEqual(normalizeHeader("Quantity and Size"), "quantityandsize");
  assert.strictEqual(normalizeHeader("QUANTITY/SIZE"), "quantitysize");
  assert.strictEqual(
    normalizeHeader("General Description and Objective of the"),
    "generaldescriptionandobjectiveofthe"
  );
  const gppb = [
    "generaldescriptionandobjectiveofthe",
    "typeoftheprojecttobeprocured",
    "quantityandsizeoftheprojecttobeprocured",
    "recommendedmodeofprocurement",
    "sourceoffunds",
    "estimatedbudgetauthorizedbudgetaryallotment",
  ];
  assert.ok(scoreHeaderRow(gppb) >= 3, "GPPB row scores as header");
  assert.strictEqual(scoreHeaderRow(["republicofthephilippines"]), 0);
});

test("BM JOSSONE single-sheet GPPB file profiles as LINE_LIST", async () => {
  const profile = await inspectWorkbook(
    await load("BM JOSSONE DAYANGHIRANG LnB PPMP 2026 = = =.xlsx"),
    { filename: "BM JOSSONE DAYANGHIRANG LnB PPMP 2026 = = =.xlsx" }
  );
  assert.strictEqual(profile.sheets.length, 1);
  assert.strictEqual(profile.sheets[0].kind, "LINE_LIST");
  assert.ok(profile.sheets[0].headerRow !== null, "header anchor found");
  assert.strictEqual(profile.fiscalYear, 2026);
  assert.strictEqual(profile.fiscalYearSource, "banner");
  assert.ok(
    !profile.issues.some((i) => i.severity === "error"),
    "no errors: " + JSON.stringify(profile.issues)
  );
});

test("BM MONTOJO small GPPB file profiles as LINE_LIST", async () => {
  const profile = await inspectWorkbook(
    await load("BM MONTOJO PPMP FINAL JAN-JUNE 2026 = = =.xlsx"),
    { filename: "BM MONTOJO PPMP FINAL JAN-JUNE 2026 = = =.xlsx" }
  );
  assert.strictEqual(profile.sheets.length, 1);
  assert.strictEqual(profile.sheets[0].kind, "LINE_LIST");
  assert.strictEqual(profile.fiscalYear, 2026);
});

test("DOPH multi-sheet category workbook profiles as LINE_LIST", async () => {
  const profile = await inspectWorkbook(await load("DOPH-CATEEL = = =.xlsx"), {
    filename: "DOPH-CATEEL = = =.xlsx",
  });
  const line = profile.sheets.filter((s) => s.kind === "LINE_LIST");
  assert.ok(
    line.length >= 20,
    `expected >=20 line sheets, got ${line.length}/${profile.sheets.length}`
  );
  assert.strictEqual(profile.fiscalYear, 2026);
});

test("GUADA mixed workbook separates LINE_LIST and PIVOT_SUMMARY", { timeout: 120000 }, async () => {
  const profile = await inspectWorkbook(await load("GUADA 2026.xlsx"), {
    filename: "GUADA 2026.xlsx",
  });
  const line = profile.sheets.filter((s) => s.kind === "LINE_LIST");
  const pivot = profile.sheets.filter((s) => s.kind === "PIVOT_SUMMARY");
  assert.ok(line.length >= 50, `expected >=50 line sheets, got ${line.length}`);
  assert.ok(pivot.length >= 3, `expected >=3 pivot sheets, got ${pivot.length}`);
  assert.ok(
    !profile.issues.some((i) => i.severity === "error"),
    "no errors: " +
      JSON.stringify(
        profile.issues.filter((i) => i.severity === "error").slice(0, 3)
      )
  );
});
