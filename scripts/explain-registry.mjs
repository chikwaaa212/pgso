/**
 * Registry/list query plans + timings (Step 4 follow-up, READ-ONLY).
 *
 * Usage (staging, NOT production):
 *   npx tsx --env-file=.env.local scripts/explain-registry.mjs
 *
 * Runs EXPLAIN (ANALYZE, BUFFERS) over the same FROM/WHERE/JOIN skeleton the
 * list readers use (column lists trimmed to `id` — projection never changes
 * the plan) and verifies the Step 4 / migration 31+32 indexes exist.
 * Prints per-query execution ms, buffer hits/reads, and the scan nodes used,
 * so index-assisted filters can be told apart from seq scans.
 */
import pkg from '@prisma/client';

const { PrismaClient } = pkg;
const prisma = new PrismaClient();

async function explain(label, build) {
  const rows = await build();
  const plan = rows[0]?.['QUERY PLAN'];
  const text = JSON.stringify(plan);
  const execTimes = [...text.matchAll(/"Execution Time":\s*([\d.]+)/g)].map((m) => Number(m[1]));
  const buffers = [...text.matchAll(/"Shared Hit Blocks":\s*(\d+)[^}]*"Shared Read Blocks":\s*(\d+)/g)].map(
    (m) => ({ hit: Number(m[1]), read: Number(m[2]) })
  );
  const scans = [...new Set([...text.matchAll(/"Node Type":\s*"([^"]*Scan[^"]*)"/g)].map((m) => m[1]))];
  console.log(`--- ${label} ---`);
  console.log(`execution_ms=${execTimes[0] ?? '?'} scans=[${scans.join(', ')}] buffers=${JSON.stringify(buffers[0] ?? {})}`);
  return { label, executionMs: execTimes[0] ?? null, scans, buffers: buffers[0] ?? null };
}

async function main() {
  const out = [];
  const q = 'laptop';
  const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;

  // 1. Registry union skeleton, unfiltered (worst case: full count + window).
  out.push(
    await explain('union window, no filters', () =>
      prisma.$queryRaw`
        EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
        SELECT w.id, COUNT(*) OVER() AS full_count
        FROM (
          SELECT a.id, COALESCE(a.article, a.account_code, a.category, a.id::text) AS sort_key FROM assets a
          UNION ALL
          SELECT s.id, COALESCE(s.item_name, s.account_code, s.category, s.id::text) AS sort_key FROM inventory s
        ) w
        ORDER BY w.sort_key ASC LIMIT 15 OFFSET 0`
    )
  );

  // 2. Registry union with exact filters (should ride the Step 4 indexes).
  out.push(
    await explain('union window, exact filters', () =>
      prisma.$queryRaw`
        EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
        SELECT w.id, COUNT(*) OVER() AS full_count
        FROM (
          SELECT a.id, COALESCE(a.article, a.account_code, a.category, a.id::text) AS sort_key FROM assets a
          WHERE lower(a.status) = 'available' AND lower(a.category) = 'equipment'
          UNION ALL
          SELECT s.id, COALESCE(s.item_name, s.account_code, s.category, s.id::text) AS sort_key FROM inventory s
          WHERE lower(s.category) = 'equipment'
        ) w
        ORDER BY w.sort_key ASC LIMIT 15 OFFSET 0`
    )
  );

  // 3. Registry union with ILIKE search (expected: scan over filtered set).
  out.push(
    await explain('union window, ILIKE search', () =>
      prisma.$queryRaw`
        EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
        SELECT w.id, COUNT(*) OVER() AS full_count
        FROM (
          SELECT a.id, a.article, a.account_code, COALESCE(a.article, a.account_code, a.category, a.id::text) AS sort_key FROM assets a
          UNION ALL
          SELECT s.id, s.item_name AS article, s.account_code, COALESCE(s.item_name, s.account_code, s.category, s.id::text) AS sort_key FROM inventory s
        ) w
        WHERE (w.article ILIKE ${like} OR w.account_code ILIKE ${like})
        ORDER BY w.sort_key ASC LIMIT 15 OFFSET 0`
    )
  );

  // 4. Delivery window + repairs window (Record Keeper tabs).
  out.push(
    await explain('delivery window', () =>
      prisma.$queryRaw`
        EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
        SELECT d.id FROM deliveries d ORDER BY d.created_at DESC LIMIT 15 OFFSET 0`
    )
  );
  out.push(
    await explain('repairs window (owned)', () =>
      prisma.$queryRaw`
        EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
        SELECT r.id FROM repairs r ORDER BY r.created_at DESC LIMIT 15 OFFSET 0`
    )
  );

  // 5. Index proof: the Step 4 + migration 31/32 indexes exist.
  const idx = await prisma.$queryRaw`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname LIKE ANY (ARRAY['assets_%', 'inventory_%', 'deliveries_%', 'inspections_%', 'iar_records_%', 'issuance_records_%', 'repairs_%', 'requests_%', 'audit_logs_%'])
    ORDER BY 1`;
  console.log(`--- indexes present (${idx.length}) ---`);
  console.log(idx.map((r) => r.indexname).join(', '));

  console.log(JSON.stringify({ plans: out, indexCount: idx.length }));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
