import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PAGE_SIZE } from "../lib/constants";
import {
  parsePage,
  clampPage,
  totalPagesFor,
  pageResponse,
} from "../lib/paged";

// pageWindow lives in a "use client" .tsx that imports CSS + lucide-react,
// so it cannot be imported under `node --test`. Extract the real function
// from source and evaluate it, so these tests still track
// src/components/ui/pagination.tsx (loud failure if the source evolves).
const paginationSrc = readFileSync(
  fileURLToPath(new URL("../components/ui/pagination.tsx", import.meta.url)),
  "utf8"
);

function extractFunction(source: string, name: string): string {
  const anchor = `function ${name}`;
  const start = source.indexOf(anchor);
  assert.ok(start !== -1, `${name} not found in pagination.tsx source`);
  // Skip the parameter list first so a future default value containing
  // braces is not mistaken for the function body.
  const pOpen = source.indexOf("(", start);
  let pDepth = 0;
  let j = pOpen;
  let inStr: string | null = null;
  let esc = false;
  for (; j < source.length; j++) {
    const c = source[j];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") inStr = c;
    else if (c === "(") pDepth++;
    else if (c === ")") {
      pDepth--;
      if (pDepth === 0) break;
    }
  }
  assert.ok(pDepth === 0, `unbalanced parens extracting ${name}`);
  const open = source.indexOf("{", j);
  let depth = 0;
  let i = open;
  let quote: string | null = null;
  let escaped = false;
  for (; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  assert.ok(depth === 0, `unbalanced braces extracting ${name}`);
  return source.slice(start, i + 1).replace(/^\s*export\s+/, "");
}

function loadPageWindow(): (current: number, total: number) => number[] {
  const fnText = extractFunction(paginationSrc, "pageWindow")
    .replace(/:\s*number\[\]/g, "")
    .replace(/:\s*number/g, "");
  assert.ok(!/:\s*number/.test(fnText), "type stripping incomplete for pageWindow");
  return new Function(`${fnText}; return pageWindow;`)() as (
    current: number,
    total: number
  ) => number[];
}

const pageWindow = loadPageWindow();

test("PAGE_SIZE is the single source of truth (15)", () => {
  assert.strictEqual(PAGE_SIZE, 15);
});

test("parsePage clamps into 1..1000", () => {
  assert.strictEqual(parsePage(0), 1);
  assert.strictEqual(parsePage(-3), 1);
  assert.strictEqual(parsePage(9999), 1000);
  assert.strictEqual(parsePage(1001), 1000);
  assert.strictEqual(parsePage(1000), 1000);
  assert.strictEqual(parsePage(1), 1);
  assert.strictEqual(parsePage(7), 7);
  assert.strictEqual(parsePage(NaN), 1);
  assert.strictEqual(parsePage(undefined), 1);
  assert.strictEqual(parsePage(null), 1);
  assert.strictEqual(parsePage(""), 1);
  assert.strictEqual(parsePage("abc"), 1);
  assert.strictEqual(parsePage(Infinity), 1);
  assert.strictEqual(parsePage(2.7), 2);
  assert.strictEqual(parsePage("5"), 5);
});

test("totalPagesFor honors PAGE_SIZE math", () => {
  assert.strictEqual(totalPagesFor(0), 1);
  assert.strictEqual(totalPagesFor(1), 1);
  assert.strictEqual(totalPagesFor(15), 1);
  assert.strictEqual(totalPagesFor(16), 2);
  assert.strictEqual(totalPagesFor(30), 2);
  assert.strictEqual(totalPagesFor(31), 3);
  assert.strictEqual(totalPagesFor(100, 10), 10);
});

test("clampPage pins into 1..totalPages", () => {
  assert.strictEqual(clampPage(0, 100), 1);
  assert.strictEqual(clampPage(-4, 100), 1);
  assert.strictEqual(clampPage(5, 100), 5);
  assert.strictEqual(clampPage(9999, 100), 7);
  assert.strictEqual(clampPage(3, 0), 1);
});

test("pageResponse returns the canonical envelope", () => {
  const res = pageResponse([1, 2], 30, 2);
  assert.deepStrictEqual(Object.keys(res).sort(), [
    "data",
    "page",
    "pageSize",
    "rows",
    "total",
    "totalPages",
  ]);
  assert.deepStrictEqual(res.data, [1, 2]);
  assert.deepStrictEqual(res.rows, [1, 2]);
  assert.strictEqual(res.total, 30);
  assert.strictEqual(res.page, 2);
  assert.strictEqual(res.pageSize, 15);
  assert.strictEqual(res.totalPages, 2);
});

test("pageResponse clamps out-of-range pages", () => {
  assert.strictEqual(pageResponse([], 30, 999).page, 2);
  assert.strictEqual(pageResponse([], 30, 0).page, 1);
  assert.strictEqual(pageResponse([], 0, 5).page, 1);
});

test("pagination hides on a single page (total <= 15)", () => {
  // Pagination renders NOTHING when total <= PAGE_SIZE: exactly when there
  // is a single page.
  assert.strictEqual(totalPagesFor(0), 1);
  assert.strictEqual(totalPagesFor(15), 1);
  assert.strictEqual(totalPagesFor(16), 2);
  assert.ok(
    paginationSrc.includes("if (total <= pageSize) return null"),
    "Pagination must return null when total <= pageSize"
  );
});

test("pageWindow returns at most 5 pages", () => {
  for (let total = 1; total <= 20; total++) {
    for (let current = 1; current <= total; current++) {
      const win = pageWindow(current, total);
      assert.ok(
        win.length >= 1 && win.length <= 5,
        `window size ${win.length} for current=${current} total=${total}`
      );
    }
  }
});

test("pageWindow always contains current, sorted and in range", () => {
  for (let total = 1; total <= 20; total++) {
    for (let current = 1; current <= total; current++) {
      const win = pageWindow(current, total);
      assert.ok(win.includes(current), `window misses current=${current}`);
      assert.deepStrictEqual(win, [...win].sort((a, b) => a - b));
      assert.ok(win.every((p) => p >= 1 && p <= total));
    }
  }
});

test("pageWindow edge shapes", () => {
  assert.deepStrictEqual(pageWindow(1, 1), [1]);
  assert.deepStrictEqual(pageWindow(2, 3), [1, 2, 3]);
  assert.deepStrictEqual(pageWindow(1, 10), [1, 2, 3, 4, 5]);
  assert.deepStrictEqual(pageWindow(10, 10), [6, 7, 8, 9, 10]);
  assert.deepStrictEqual(pageWindow(5, 10), [3, 4, 5, 6, 7]);
  assert.deepStrictEqual(pageWindow(5, 5), [1, 2, 3, 4, 5]);
});
