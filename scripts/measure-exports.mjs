/**
 * Export-route guard matrix + load rig (Step 4 follow-up, node built-ins only).
 *
 * Usage (staging, NOT production):
 *   APP_URL=http://localhost:3000 SUPABASE_URL=... SUPABASE_ANON_KEY=... \
 *     TEST_PERSONNEL_EMAIL=... TEST_PERSONNEL_PASSWORD=... \
 *     TEST_EMPLOYEE_EMAIL=... TEST_EMPLOYEE_PASSWORD=... \
 *     TEST_ADMIN_EMAIL=... TEST_ADMIN_PASSWORD=... \
 *     [TEST_PAR_ID=... TEST_ICS_ID=... TEST_AIR_ID=...] \
 *     node scripts/measure-exports.mjs [--load]
 *
 * - Without --load: guard matrix only (401 anon / 403 wrong role / 404 bad id).
 * - With --load: + 60 requests @ concurrency 10 per configured 200-route,
 *   reporting p50/p95/max ms, mean KB, and PASS/FAIL vs the p95 < 400 ms
 *   export budget. Needs TEST_*_ID values (copy one of each from the UI).
 * - Auth: Supabase password grant per role; session cookie built for
 *   @supabase/ssr. If login fails in your setup, paste browser cookies via
 *   COOKIE_PERSONNEL / COOKIE_EMPLOYEE / COOKIE_ADMIN instead.
 */

const APP_URL = process.env.APP_URL ?? 'http://localhost:3000';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const LOAD = process.argv.includes('--load');

const BUDGET_EXPORT_P95_MS = 400;
const LOAD_REQUESTS = 60;
const LOAD_CONCURRENCY = 10;

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(2);
}
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  fail('SUPABASE_URL and SUPABASE_ANON_KEY are required.');
}

function cookieName() {
  return `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
}

async function login(email, password) {
  if (!email || !password) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    console.error(`login failed for ${email}: HTTP ${res.status}`);
    return null;
  }
  const session = await res.json();
  const value = Buffer.from(JSON.stringify(session)).toString('base64url');
  return `${cookieName()}=${value}`;
}

async function get(url, cookie) {
  const t0 = performance.now();
  const res = await fetch(`${APP_URL}${url}`, {
    headers: cookie ? { Cookie: cookie } : {},
  });
  const ms = performance.now() - t0;
  let bytes = 0;
  try {
    bytes = (await res.arrayBuffer()).byteLength;
  } catch {
    bytes = 0;
  }
  return { status: res.status, ms, bytes };
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

async function load(url, cookie, label) {
  // Warmup (JIT, pooler, cold cache) — not counted.
  for (let i = 0; i < 3; i++) await get(url, cookie);
  const samples = [];
  let bytes = 0;
  for (let i = 0; i < LOAD_REQUESTS; i += LOAD_CONCURRENCY) {
    const batch = await Promise.all(
      Array.from({ length: Math.min(LOAD_CONCURRENCY, LOAD_REQUESTS - i) }, () =>
        get(url, cookie)
      )
    );
    for (const r of batch) {
      if (r.status !== 200) fail(`${label}: expected 200 under load, got ${r.status}`);
      samples.push(r.ms);
      bytes += r.bytes;
    }
  }
  samples.sort((a, b) => a - b);
  return {
    label,
    n: samples.length,
    p50: Math.round(percentile(samples, 50)),
    p95: Math.round(percentile(samples, 95)),
    max: Math.round(samples[samples.length - 1]),
    meanKB: Math.round(bytes / samples.length / 1024),
    budget: `p95 < ${BUDGET_EXPORT_P95_MS}ms`,
    pass: percentile(samples, 95) < BUDGET_EXPORT_P95_MS,
  };
}

async function main() {
  const cookies = {
    personnel:
      process.env.COOKIE_PERSONNEL ??
      (await login(process.env.TEST_PERSONNEL_EMAIL, process.env.TEST_PERSONNEL_PASSWORD)),
    employee:
      process.env.COOKIE_EMPLOYEE ??
      (await login(process.env.TEST_EMPLOYEE_EMAIL, process.env.TEST_EMPLOYEE_PASSWORD)),
    admin:
      process.env.COOKIE_ADMIN ??
      (await login(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD)),
  };

  // ─── Guard matrix: 401 anon / 403 wrong role / 404 bad id ───
  const matrix = [
    { name: 'health anon → 200 (public)', url: '/api/health', cookie: null, expect: 200 },
    { name: 'master-data anon → 401', url: '/api/master-data', cookie: null, expect: 401 },
    { name: 'asset-template anon → 401', url: '/api/personnel/assets/template-xlsx', cookie: null, expect: 401 },
    { name: 'asset-template employee → 403', url: '/api/personnel/assets/template-xlsx', cookie: cookies.employee, expect: 403, skipWithout: 'employee' },
    { name: 'asset-template personnel → 200', url: '/api/personnel/assets/template-xlsx', cookie: cookies.personnel, expect: 200, skipWithout: 'personnel' },
    { name: 'ppmp-template employee → 403', url: '/api/personnel/ppmp/template-xlsx', cookie: cookies.employee, expect: 403, skipWithout: 'employee' },
    { name: 'catalog-template personnel → 403', url: '/api/super-admin/master-data/catalog-template-xlsx', cookie: cookies.personnel, expect: 403, skipWithout: 'personnel' },
    { name: 'catalog-template admin → 200', url: '/api/super-admin/master-data/catalog-template-xlsx', cookie: cookies.admin, expect: 200, skipWithout: 'admin' },
    { name: 'personnel par-xlsx anon → 401', url: '/api/personnel/issuances/00000000-0000-0000-0000-000000000000/par-xlsx', cookie: null, expect: 401 },
    { name: 'personnel par-xlsx employee → 403', url: '/api/personnel/issuances/00000000-0000-0000-0000-000000000000/par-xlsx', cookie: cookies.employee, expect: 403, skipWithout: 'employee' },
    { name: 'personnel par-xlsx bad id → 404 (authorized)', url: '/api/personnel/issuances/not-an-id/par-xlsx', cookie: cookies.personnel, expect: 404, skipWithout: 'personnel' },
    { name: 'personnel ics-xlsx bad id → 404 (authorized)', url: '/api/personnel/issuances/not-an-id/ics-xlsx', cookie: cookies.personnel, expect: 404, skipWithout: 'personnel' },
    { name: 'air-xlsx anon → 401', url: '/api/personnel/inspections/00000000-0000-0000-0000-000000000000/air-xlsx', cookie: null, expect: 401 },
    { name: 'air-xlsx employee → 403', url: '/api/personnel/inspections/00000000-0000-0000-0000-000000000000/air-xlsx', cookie: cookies.employee, expect: 403, skipWithout: 'employee' },
    { name: 'air-xlsx bad id → 404 (authorized)', url: '/api/personnel/inspections/not-an-id/air-xlsx', cookie: cookies.personnel, expect: 404, skipWithout: 'personnel' },
    { name: 'employee par-xlsx anon → 401', url: '/api/employee/issuances/00000000-0000-0000-0000-000000000000/par-xlsx', cookie: null, expect: 401 },
    { name: 'employee par-xlsx personnel → 403', url: '/api/employee/issuances/00000000-0000-0000-0000-000000000000/par-xlsx', cookie: cookies.personnel, expect: 403, skipWithout: 'personnel' },
    { name: 'employee par-xlsx bad id → 404 (authorized)', url: '/api/employee/issuances/not-an-id/par-xlsx', cookie: cookies.employee, expect: 404, skipWithout: 'employee' },
    { name: 'employee ics-xlsx bad id → 404 (authorized)', url: '/api/employee/issuances/not-an-id/ics-xlsx', cookie: cookies.employee, expect: 404, skipWithout: 'employee' },
  ];

  let failures = 0;
  for (const m of matrix) {
    if (m.skipWithout && !cookies[m.skipWithout]) {
      console.log(`SKIP  ${m.name} (no ${m.skipWithout} session)`);
      continue;
    }
    const r = await get(m.url, m.cookie);
    const ok = r.status === m.expect;
    if (!ok) failures++;
    console.log(`${ok ? 'PASS ' : 'FAIL '} ${m.name} → ${r.status} (want ${m.expect}) [${Math.round(r.ms)}ms]`);
  }

  // ─── Load phase: configured 200-routes only ───
  const loadTargets = [
    process.env.TEST_PAR_ID
      ? { label: 'personnel par-xlsx', url: `/api/personnel/issuances/${process.env.TEST_PAR_ID}/par-xlsx`, cookie: cookies.personnel }
      : null,
    process.env.TEST_ICS_ID
      ? { label: 'personnel ics-xlsx', url: `/api/personnel/issuances/${process.env.TEST_ICS_ID}/ics-xlsx`, cookie: cookies.personnel }
      : null,
    process.env.TEST_AIR_ID
      ? { label: 'air-xlsx', url: `/api/personnel/inspections/${process.env.TEST_AIR_ID}/air-xlsx`, cookie: cookies.personnel }
      : null,
    process.env.TEST_PAR_ID
      ? { label: 'employee par-xlsx', url: `/api/employee/issuances/${process.env.TEST_PAR_ID}/par-xlsx`, cookie: cookies.employee }
      : null,
  ].filter(Boolean);

  const summary = { matrix: { failures }, load: [] };
  if (LOAD) {
    if (loadTargets.length === 0) {
      console.log('LOAD skipped: set TEST_PAR_ID / TEST_ICS_ID / TEST_AIR_ID for 200-path timing.');
    }
    for (const t of loadTargets) {
      if (!t.cookie) {
        console.log(`SKIP  load ${t.label} (no session)`);
        continue;
      }
      const r = await load(t.url, t.cookie, t.label);
      summary.load.push(r);
      console.log(
        `${r.pass ? 'PASS ' : 'FAIL '} load ${r.label}: n=${r.n} p50=${r.p50}ms p95=${r.p95}ms max=${r.max}ms mean=${r.meanKB}KB (${r.budget})`
      );
      if (!r.pass) failures++;
    }
  }

  console.log(JSON.stringify(summary));
  if (failures > 0) {
    console.error(`${failures} failure(s).`);
    process.exit(1);
  }
  console.log('OK: guard matrix green' + (LOAD ? ' + load budgets met.' : ' (load skipped, pass --load with TEST_*_ID).'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
