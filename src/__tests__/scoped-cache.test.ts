import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// src/lib/personnel-cache.ts pulls Redis/DB scope helpers, so it cannot be
// imported under `node --test`. Extract the pure key builders from source
// and evaluate them, so these tests still track the real implementation
// (loud failure if the source evolves). scopedKey itself needs a DB-backed
// scope and is covered via source-shape assertions below.
const cacheSrc = readFileSync(
  fileURLToPath(new URL("../lib/personnel-cache.ts", import.meta.url)),
  "utf8"
);

function extractFunction(source: string, name: string): string {
  const anchor = `function ${name}`;
  const start = source.indexOf(anchor);
  assert.ok(start !== -1, `${name} not found in personnel-cache.ts source`);
  // Skip the parameter list first: signatures may contain braces
  // (e.g. a `= {}` default), which must not be mistaken for the body.
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

function stripTypes(fnText: string, name: string): string {
  const stripped = fnText
    .replace(/(\w)\s+as\s+Record<string,\s*unknown>/g, "$1")
    .replace(/:\s*Record<string,\s*unknown>/g, "")
    .replace(/:\s*unknown/g, "")
    .replace(/:\s*string\b/g, "");
  assert.ok(
    !/:\s*(string|unknown)\b/.test(stripped) && !/\sas\s+Record</.test(stripped),
    `type stripping incomplete for ${name}`
  );
  return stripped;
}

function loadKeyBuilders(): {
  cacheKey: (namespace: string, parts?: Record<string, unknown>) => string;
} {
  const prefixMatch = /const PREFIX = '([^']+)'/.exec(cacheSrc);
  assert.ok(prefixMatch, "PREFIX not found in personnel-cache.ts source");
  const stableText = stripTypes(
    extractFunction(cacheSrc, "stableStringify"),
    "stableStringify"
  );
  const cacheKeyText = stripTypes(
    extractFunction(cacheSrc, "cacheKey"),
    "cacheKey"
  );
  const stableStringify = new Function(
    `${stableText}; return stableStringify;`
  )() as (v: unknown) => string;
  const cacheKey = new Function(
    "stableStringify",
    "PREFIX",
    `${cacheKeyText}; return cacheKey;`
  )(stableStringify, prefixMatch[1]) as (
    namespace: string,
    parts?: Record<string, unknown>
  ) => string;
  return { cacheKey };
}

const { cacheKey } = loadKeyBuilders();

test("cacheKey is deterministic under key reordering", () => {
  assert.strictEqual(
    cacheKey("ns", { a: 1, b: 2 }),
    cacheKey("ns", { b: 2, a: 1 })
  );
  assert.strictEqual(
    cacheKey("ns", { x: { a: 1, b: 2 }, y: [1, 2] }),
    cacheKey("ns", { y: [1, 2], x: { b: 2, a: 1 } })
  );
});

test("cacheKey differs for different values", () => {
  assert.notStrictEqual(cacheKey("ns", { a: 1 }), cacheKey("ns", { a: 2 }));
  assert.notStrictEqual(
    cacheKey("ns", { a: 1 }),
    cacheKey("ns", { a: 1, b: 2 })
  );
  assert.notStrictEqual(cacheKey("ns-a", { v: 1 }), cacheKey("ns-b", { v: 1 }));
  assert.notStrictEqual(
    cacheKey("ns", { ids: [1, 2] }),
    cacheKey("ns", { ids: [2, 1] })
  );
});

test("cacheKey isolates users and roles via {u,a} extras", () => {
  // Mirrors scopedKey's extra shape ({u: userId, a: isSuperAdmin ? 1 : 0}).
  const alice = cacheKey("personnel:dashboard", { u: "alice", a: 0 });
  const bob = cacheKey("personnel:dashboard", { u: "bob", a: 0 });
  const aliceAdmin = cacheKey("personnel:dashboard", { u: "alice", a: 1 });
  assert.notStrictEqual(alice, bob);
  assert.notStrictEqual(alice, aliceAdmin);
  assert.strictEqual(alice, cacheKey("personnel:dashboard", { a: 0, u: "alice" }));
});

test("cacheKey shape is prefixed and length-bounded", () => {
  const key = cacheKey("personnel:dashboard", { u: "alice", a: 0 });
  assert.ok(key.startsWith("pgso:personnel:dashboard:"));
  const hashPart = key.split(":").slice(2).join(":");
  assert.ok(hashPart.length > 0 && hashPart.length <= 180);
  const huge = cacheKey(
    "ns",
    Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`k${i}`, "x".repeat(50)]))
  );
  assert.ok(huge.split(":").slice(1).join(":").length <= 200);
});

test("cacheKey is stable for empty parts and nullish values", () => {
  assert.strictEqual(cacheKey("ns"), cacheKey("ns", {}));
  assert.strictEqual(cacheKey("ns", { v: null }), cacheKey("ns", { v: undefined }));
});

test("scopedKey isolates per user and role (source shape)", () => {
  // scopedKey needs a DB-backed personnel scope, so assert its key recipe
  // instead: user id as `u`, super-admin flag as `a`, merged with extras.
  assert.ok(
    cacheSrc.includes("u: userId"),
    "scopedKey must embed the user id as `u`"
  );
  assert.ok(
    cacheSrc.includes("a: scope.isSuperAdmin ? 1 : 0"),
    "scopedKey must embed the super-admin flag as `a`"
  );
  assert.ok(
    cacheSrc.includes("...extra"),
    "scopedKey must merge caller extras into the key"
  );
});
