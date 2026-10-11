// Phase 1 measurement harness: latency (p50/p95), DB queries/request
// (pg_stat_statements delta), and effective cache-hit proxy (cold vs warm)
// for the busiest pages + login + master-data API.
//
// Usage:
//   1. npx next build && PERF_TRACE=1 npx next start -p 3100
//   2. node --env-file=.env.local scripts/measure-cache.mjs http://127.0.0.1:3100 [N]
// Measures sequentially (attribution-clean). Flushes ONLY `pgso:*` Redis
// cache keys between cold runs (never touches app data).
// Env needed: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
// SUPER_ADMIN_EMAIL/PASSWORD, PERSONNEL_EMAIL/PASSWORD, DATABASE_URL
// (direct), UPSTASH_REDIS_REST_URL/TOKEN. Never logs secrets.

import { PrismaClient } from "@prisma/client";
import { Redis } from "@upstash/redis";

const base = process.argv[2] ?? "http://127.0.0.1:3100";
const N = Math.max(3, Number(process.argv[3]) || 10);
const prisma = new PrismaClient();
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const pct = (arr, p) => {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

async function withStepTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function statTotal() {
  const rows = await withStepTimeout(
    prisma.$queryRaw`SELECT COALESCE(SUM(calls), 0)::int AS c FROM pg_stat_statements`,
    30000,
    "pg_stat snapshot"
  );
  return rows[0]?.c ?? 0;
}

async function flushCache() {
  return withStepTimeout(
    (async () => {
      let cursor = 0;
      let n = 0;
      do {
        const [next, keys] = await redis.scan(cursor, { match: "pgso:*", count: 200 });
        cursor = Number(next);
        if (keys.length > 0) {
          await redis.del(...keys);
          n += keys.length;
        }
      } while (cursor !== 0);
      return n;
    })(),
    60000,
    "redis flush"
  );
}

const b64url = (s) =>
  Buffer.from(s).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function loginCookie(prefix) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const t0 = Date.now();
  const r = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env[`${prefix}_EMAIL`],
      password: process.env[`${prefix}_PASSWORD`],
    }),
  });
  const ms = Date.now() - t0;
  if (!r.ok) throw new Error(`${prefix} grant HTTP ${r.status}`);
  const s = await r.json();
  const ref = new URL(url).hostname.split(".")[0];
  return { cookie: `sb-${ref}-auth-token=base64-${b64url(JSON.stringify(s))}`, ms };
}

async function timedFetch(path, cookie, etag, timeoutMs = 90000) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (etag) headers["If-None-Match"] = etag;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const t0 = Date.now();
    const r = await fetch(base + path, { headers, signal: ctrl.signal });
    const ms = Date.now() - t0;
    const body = await r.text();
    return {
      status: r.status,
      ms,
      bytes: body.length,
      etag: r.headers.get("etag"),
      cc: r.headers.get("cache-control"),
      timing: r.headers.get("server-timing"),
    };
  } finally {
    clearTimeout(timer);
  }
}

const PLAN = [
  ["login(SUPER_ADMIN grant)", null, null, "grant:SUPER_ADMIN"],
  ["login(PERSONNEL grant)", null, null, "grant:PERSONNEL"],
  ["GET /api/master-data", "SUPER_ADMIN", null, "api"],
  ["GET /personnel/dashboard", "PERSONNEL", null, "page"],
  ["GET /personnel/assets", "PERSONNEL", null, "page"],
  ["GET /personnel/inventory", "PERSONNEL", null, "page"],
  ["GET /personnel/requests", "PERSONNEL", null, "page"],
  ["GET /personnel/repairs", "PERSONNEL", null, "page"],
  ["GET /personnel/issuances", "PERSONNEL", null, "page"],
  ["GET /personnel/documents", "PERSONNEL", null, "page"],
  ["GET /super-admin/users", "SUPER_ADMIN", null, "page"],
  ["GET /super-admin/dashboard", "SUPER_ADMIN", null, "page"],
];

const cookies = {};
for (const p of ["SUPER_ADMIN", "PERSONNEL"]) {
  const { cookie, ms } = await loginCookie(p);
  cookies[p] = cookie;
  console.log(`grant ${p}: ${ms}ms (MEASURED, Supabase Auth round-trip)`);
}

let resetOk = true;
try {
  await prisma.$queryRaw`SELECT pg_stat_statements_reset()`;
} catch {
  resetOk = false;
}
console.log(`pg_stat_statements_reset: ${resetOk ? "ok" : "denied (snapshot-diff mode)"}`);
console.log(`samples per endpoint: 1 cold + ${N} warm, sequential`);

const report = [];
for (const [label, role, , kind] of PLAN) {
  if (kind.startsWith("grant")) continue;
  const path = label.slice(4);
  await flushCache();
  await new Promise((r) => setTimeout(r, 300));
  const q0 = await statTotal();
  const cold = await timedFetch(path, cookies[role]);
  const qCold = (await statTotal()) - q0;
  console.log(`  cold ${label}: ${cold.ms}ms/${qCold}q [${cold.status}]${cold.timing ? ` timing=${cold.timing}` : ""}`);
  const warms = [];
  let etag304 = null;
  for (let i = 0; i < N; i++) {
    const w = await timedFetch(path, cookies[role]);
    warms.push(w.ms);
    await new Promise((r) => setTimeout(r, 150));
  }
  const q1 = await statTotal();
  const qWarmTotal = q1 - q0 - qCold;
  // Conditional revalidation check (API единицу only).
  if (cold.etag && kind === "api") {
    const c = await timedFetch(path, cookies[role], cold.etag);
    etag304 = c.status;
  }
  const row = {
    endpoint: label,
    cold_ms: cold.ms,
    cold_status: cold.status,
    cold_dbq: qCold,
    warm_p50_ms: pct(warms, 50),
    warm_p95_ms: pct(warms, 95),
    warm_dbq_total: qWarmTotal,
    warm_dbq_per_req: +(qWarmTotal / N).toFixed(2),
    bytes: cold.bytes,
    cache_control: cold.cc,
    server_timing: cold.timing,
    etag_304: etag304,
  };
  report.push(row);
  console.log(
    `${label}: cold ${cold.ms}ms/${qCold}q [${cold.status}] -> warm p50 ${row.warm_p50_ms}ms p95 ${row.warm_p95_ms}ms, ~${row.warm_dbq_per_req}q/req` +
      (etag304 ? `, 304=${etag304}` : "")
  );
}

try {
  const keys = [];
  let cursor = 0;
  do {
    const [next, ks] = await redis.scan(cursor, { match: "pgso:*", count: 500 });
    cursor = Number(next);
    keys.push(...ks);
  } while (cursor !== 0);
  console.log(`redis pgso:* keys after warm runs: ${keys.length} (MEASURED coverage)`);
} catch (e) {
  console.log(`redis scan failed: ${e instanceof Error ? e.message.slice(0, 100) : e}`);
}

await prisma.$disconnect();
console.log("JSON:" + JSON.stringify(report));
