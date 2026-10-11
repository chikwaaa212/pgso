/**
 * Staging volume seeder for the audit load rig (supports Pass B).
 *
 * Creates production-like row volume so pagination, the registry UNION,
 * counts, and alerts behave like production:
 *   assets 2500 (> the old 2000-row cap — proves the truncation fix),
 *   inventory 500, deliveries 300 (+items), inspections ~220,
 *   iar_records ~180, issuance_records 240 (PAR/ICS), repairs 150,
 *   requests 200 (incl. transfers addressed to real employees).
 *
 * SAFETY (staging only, never production):
 * - Dry-run by default: prints the target host + planned counts, writes nothing.
 * - Writes ONLY with `--yes`. IDs are client-generated UUIDs recorded to
 *   `scripts/.volume-seed-manifest.json`; `--clean` deletes exactly those
 *   rows in FK-safe order.
 * - Reads existing profiles/catalog/units for realistic FK values; aborts
 *   with a pointer when no personnel/employee users exist (seed users first).
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/seed-audit-volume.ts [--yes] [--clean] [VOLUME_SCALE=2]
 */
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import path from 'path';

const prisma = new PrismaClient();
const MANIFEST = path.resolve(process.cwd(), 'scripts', '.volume-seed-manifest.json');
const SCALE = Math.min(Math.max(Math.floor(Number(process.env.VOLUME_SCALE) || 1), 1), 5);
const DO_WRITE = process.argv.includes('--yes');
const DO_CLEAN = process.argv.includes('--clean');

function maskedHost(): string {
  try {
    const u = new URL(process.env.DATABASE_URL ?? '');
    return `${u.hostname}:${u.port || '5432'}${u.pathname}`;
  } catch {
    return '(unparseable DATABASE_URL)';
  }
}

/** Deterministic PRNG (mulberry32) — runs are reproducible per scale. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20261011);
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const daysAgo = (max: number): Date => {
  const d = new Date();
  d.setDate(d.getDate() - Math.floor(rand() * max));
  return d;
};

const ARTICLES = ['Laptop', 'Monitor', 'Office chair', 'Printer', 'Projector', 'Aircon unit', 'Filing cabinet', 'Generator set', 'Vehicle', 'UPS unit', 'Scanner', 'Drill press'];
const ITEMS = ['Bond paper A4', 'Ballpen black', 'Toner cartridge', 'Cleaning solution', 'AA battery', 'Folder long', 'Stapler', 'USB drive 64GB', 'Extension cord', 'LED bulb'];
const LOCATIONS = ['PGSO stock room', 'Registrar Office', 'Accounting', 'Motorpool', 'Supply room B', 'Annex building'];
const UNITS_FALLBACK = ['pc', 'ream', 'box', 'unit', 'set'];

interface Manifest {
  createdAt: string;
  scale: number;
  ids: Record<string, string[]>;
  defKeys: string[];
}

function loadManifest(): Manifest | null {
  try {
    if (!existsSync(MANIFEST)) return null;
    return JSON.parse(readFileSync(MANIFEST, 'utf8')) as Manifest;
  } catch {
    return null;
  }
}

async function clean(manifest: Manifest) {
  // FK-safe order: children before parents.
  const order: Array<[string, string]> = [
    ['issuance_records', 'issuance'],
    ['iar_records', 'iar'],
    ['inspections', 'inspection'],
    ['delivery_items', 'deliveryItem'],
    ['deliveries', 'delivery'],
    ['repairs', 'repair'],
    ['requests', 'request'],
    ['assets', 'asset'],
    ['inventory', 'stock'],
  ];
  for (const [table, key] of order) {
    const ids = manifest.ids[key] ?? [];
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      if (chunk.length === 0) continue;
      await prisma.$executeRawUnsafe(
        `DELETE FROM "${table}" WHERE id = ANY($1::uuid[])`,
        chunk
      );
      console.log(`cleaned ${chunk.length} from ${table}`);
    }
  }
  for (const k of manifest.defKeys ?? []) {
    await prisma.$executeRaw`DELETE FROM asset_custom_fields WHERE field_key = ${k}`;
  }
  try {
    unlinkSync(MANIFEST);
  } catch {
    /* already gone */
  }
  console.log('manifest removed; volume seed fully cleaned.');
}

async function main() {
  console.log(`target: ${maskedHost()}`);
  if (DO_CLEAN) {
    const manifest = loadManifest();
    if (!manifest) fail('no manifest found — nothing to clean.');
    if (!DO_WRITE) {
      console.log(`dry-run: would delete ${Object.values(manifest.ids).flat().length} seeded rows. Re-run with --yes.`);
      return;
    }
    await clean(manifest);
    return;
  }

  const [personnel, admins, employees, catalog, units] = await Promise.all([
    prisma.profile.findMany({ where: { role: 'pgso_personnel', status: 'active' }, select: { id: true } }),
    prisma.profile.findMany({ where: { role: 'super_admin', status: 'active' }, select: { id: true } }),
    prisma.profile.findMany({ where: { role: 'employee', status: 'active' }, select: { id: true, full_name: true } }),
    prisma.accountCatalog.findMany({ where: { status: 'active' }, select: { account_code: true, account_title: true, asset_type: true } }).catch(() => []),
    prisma.unit.findMany({ where: { status: 'active' }, select: { name: true } }).catch(() => []),
  ]);
  if (personnel.length === 0) fail('no active pgso_personnel users — seed users first (see scripts/seed-personnel*.ts).');
  if (employees.length === 0) fail('no active employee users — seed users first.');
  const creators = [...personnel.map((p) => p.id), ...admins.map((p) => p.id)];
  const codes = catalog.length > 0
    ? catalog
    : [{ account_code: '1-07-05-010', account_title: 'MACHINERIES', asset_type: 'Machinery and Equipment' }];
  const unitNames = units.length > 0 ? units.map((u) => u.name) : UNITS_FALLBACK;
  const empNames = employees.map((e) => e.full_name?.trim() || '').filter(Boolean);

  const N = {
    asset: 2500 * SCALE,
    stock: 500 * SCALE,
    delivery: 300 * SCALE,
    issuance: 240 * SCALE,
    repair: 150 * SCALE,
    request: 200 * SCALE,
  };
  console.log(`plan (scale ${SCALE}): ${JSON.stringify(N)} + delivery items + inspections/IAR for most deliveries`);
  if (!DO_WRITE) {
    console.log('dry-run: nothing written. Re-run with --yes to insert.');
    return;
  }

  const manifest: Manifest = { createdAt: new Date().toISOString(), scale: SCALE, ids: {}, defKeys: [] };
  const track = (key: string, ids: string[]) => {
    manifest.ids[key] = [...(manifest.ids[key] ?? []), ...ids];
  };
  const chunked = async <T>(rows: T[], insert: (chunk: T[]) => Promise<unknown>, size = 500) => {
    for (let i = 0; i < rows.length; i += size) await insert(rows.slice(i, i + size));
  };

  // ── assets (2500+ to exceed the old 2000-row cap) ──
  const assetRows = Array.from({ length: N.asset }, (_, i) => {
    const code = pick(codes);
    const r = rand();
    return {
      id: randomUUID(),
      property_number: `VOL-PN-${i}`,
      qr_code: `VOL-${i}`,
      account_code: code.account_code,
      account_title: code.account_title,
      category: code.asset_type,
      article: pick(ARTICLES),
      quantity: r < 0.85 ? 1 : 2 + Math.floor(rand() * 9),
      unit: pick(unitNames),
      description: `${pick(ARTICLES)} for ${pick(LOCATIONS)}`,
      location: pick(LOCATIONS),
      condition: rand() < 0.9 ? 'serviceable' : 'unserviceable',
      status: r < 0.7 ? 'available' : r < 0.85 ? 'in use' : r < 0.95 ? 'maintenance' : 'retired',
      assigned_to: rand() < 0.3 ? pick(employees).id : null,
      custom_fields: rand() < 0.2 ? { warranty: `202${5 + Math.floor(rand() * 4)}-01-01` } : {},
      created_at: daysAgo(180),
    };
  });
  await chunked(assetRows, (c) => prisma.asset.createMany({ data: c }));
  track('asset', assetRows.map((r) => r.id));

  // ── inventory (spread builds low/critical/out alerts) ──
  const stockRows = Array.from({ length: N.stock }, () => {
    const r = rand();
    return {
      id: randomUUID(),
      item_name: pick(ITEMS),
      category: pick(codes).asset_type,
      account_code: pick(codes).account_code,
      quantity: r < 0.3 ? 0 : r < 0.5 ? 1 + Math.floor(rand() * 4) : 10 + Math.floor(rand() * 200),
      unit: pick(unitNames),
      unit_cost: 50 + Math.floor(rand() * 5000),
      reorder_threshold: rand() < 0.7 ? 5 + Math.floor(rand() * 20) : null,
      location: pick(LOCATIONS),
      custom_fields: {},
      updated_at: daysAgo(90),
    };
  });
  await chunked(stockRows, (c) => prisma.inventoryItem.createMany({ data: c }));
  track('stock', stockRows.map((r) => r.id));

  // ── deliveries + items ──
  const deliveryRows = Array.from({ length: N.delivery }, () => ({
    id: randomUUID(),
    po_reference: `PO-2026-${1000 + Math.floor(rand() * 9000)}`,
    supplier: pick(['Acme Trading', 'Beta Supplies', 'Gamma Office Depot', 'Delta Merchandise']),
    date_delivered: daysAgo(170),
    delivery_status: rand() < 0.9 ? 'complete' : 'partial',
    inspection_status: 'pending',
    received_by: pick(personnel).id,
    created_at: daysAgo(170),
  }));
  await chunked(deliveryRows, (c) => prisma.delivery.createMany({ data: c }));
  track('delivery', deliveryRows.map((r) => r.id));
  const itemRows = deliveryRows.flatMap((d) =>
    Array.from({ length: 1 + Math.floor(rand() * 4) }, () => ({
      id: randomUUID(),
      delivery_id: d.id,
      item_name: pick([...ARTICLES, ...ITEMS]),
      unit: pick(unitNames),
      quantity: 1 + Math.floor(rand() * 20),
      unit_cost: 100 + Math.floor(rand() * 9000),
      stocked_qty: 0,
    }))
  );
  await chunked(itemRows, (c) => prisma.deliveryItem.createMany({ data: c }));
  track('deliveryItem', itemRows.map((r) => r.id));

  // ── inspections + IAR (≈70% of deliveries, mixed results) ──
  const inspectionRows: { id: string; delivery_id: string }[] = [];
  const iarRows: { id: string; inspection_id: string; delivery_id: string }[] = [];
  for (const d of deliveryRows) {
    if (rand() > 0.72) continue;
    const r = rand();
    const result = r < 0.7 ? 'passed' : r < 0.85 ? 'partial' : 'failed';
    const inspId = randomUUID();
    inspectionRows.push({ id: inspId, delivery_id: d.id });
    await prisma.inspection.create({
      data: {
        id: inspId,
        delivery_id: d.id,
        inspector_id: pick(personnel).id,
        inspector_name: 'Volume Seeder',
        inspection_date: daysAgo(160),
        result,
        iar_no: result === 'failed' ? null : `IAR-2026-${1000 + Math.floor(rand() * 9000)}`,
      },
    });
    if (result !== 'failed' && rand() < 0.85) {
      iarRows.push({ id: randomUUID(), inspection_id: inspId, delivery_id: d.id });
    }
  }
  await chunked(iarRows, (c) =>
    prisma.iarRecord.createMany({
      data: c.map((r) => ({ ...r, kind: rand() < 0.8 ? 'generated' : 'attached' })),
    })
  );
  track('inspection', inspectionRows.map((r) => r.id));
  track('iar', iarRows.map((r) => r.id));
  if (inspectionRows.length > 0) {
    await prisma.$executeRawUnsafe(
      `UPDATE deliveries SET inspection_status = 'inspected' WHERE id = ANY($1::uuid[])`,
      inspectionRows.map((r) => r.delivery_id)
    );
  }

  // ── issuances (PAR/ICS split, spread creators + receivers) ──
  const issuanceRows = Array.from({ length: N.issuance }, () => {
    const total = Math.floor(rand() * 120000);
    return {
      id: randomUUID(),
      doc_type: total > 50000 ? 'PAR' : 'ICS',
      doc_no: `VOL-${total > 50000 ? 'PAR' : 'ICS'}-${1000 + Math.floor(rand() * 9000)}`,
      doc_date: daysAgo(150),
      asset_id: rand() < 0.6 ? pick(assetRows).id : null,
      employee_id: pick(employees).id,
      request_id: null,
      quantity: 1 + Math.floor(rand() * 5),
      unit_cost: 1000 + Math.floor(rand() * 20000),
      total_amount: total,
      issuance_data: {},
      created_by: pick(creators),
      created_at: daysAgo(150),
    };
  });
  await chunked(issuanceRows, (c) => prisma.issuanceRecord.createMany({ data: c }));
  track('issuance', issuanceRows.map((r) => r.id));

  // ── repairs (status spread incl. completed for the docs tab) ──
  const repairRows = Array.from({ length: N.repair }, () => {
    const r = rand();
    return {
      id: randomUUID(),
      asset_id: pick(assetRows).id,
      reported_by: pick(employees).id,
      repair_date: daysAgo(120),
      description: `Volume repair: ${pick(['screen flicker', "won't power on", 'battery drain', 'paper jam'])}`,
      status: r < 0.3 ? 'pending' : r < 0.6 ? 'in_progress' : 'completed',
      cost: r >= 0.6 ? 500 + Math.floor(rand() * 9500) : null,
      technician: r < 0.3 ? null : pick(['J. Cruz', 'M. Santos', 'R. Dela Pena']),
      created_by: pick(creators),
      created_at: daysAgo(120),
    };
  });
  await chunked(repairRows, (c) => prisma.repair.createMany({ data: c }));
  track('repair', repairRows.map((r) => r.id));

  // ── requests (incl. transfers addressed to real employees for Step 1) ──
  const types = ['transfer', 'new_assignment', 'repair', 'stock_replenishment'] as const;
  const requestRows = Array.from({ length: N.request }, (_, i) => {
    const type = types[i % types.length];
    const r = rand();
    let description = `Volume request ${i} — ${type}`;
    if (type === 'transfer' && i % 13 === 0 && empNames.length > 0) {
      description = `Transfer to ${pick(empNames)}\nVolume transfer for load testing`;
    }
    return {
      id: randomUUID(),
      employee_id: pick(employees).id,
      recipient_id: pick(personnel).id,
      request_type: type,
      asset_id: type === 'new_assignment' ? null : pick(assetRows).id,
      description,
      status: r < 0.5 ? 'pending' : r < 0.7 ? 'approved' : r < 0.9 ? 'completed' : 'rejected',
      date_requested: daysAgo(100),
    };
  });
  await chunked(requestRows, (c) => prisma.request.createMany({ data: c }));
  track('request', requestRows.map((r) => r.id));

  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
  console.log(`seeded volume set → manifest ${MANIFEST}`);
  console.log(JSON.stringify({ counts: Object.fromEntries(Object.entries(manifest.ids).map(([k, v]) => [k, v.length])) }));
}

function fail(msg: string): never {
  console.error(`ERROR: ${msg}`);
  process.exit(2);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
