/**
 * Demo seed: top every table up to 20 rows.
 * Rerunnable — only creates (20 - currentCount) rows per table.
 * Run: npx tsx --env-file=.env.local scripts/seed-demo-20.ts
 */
import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'crypto'

const prisma = new PrismaClient()
const TARGET = 20
const TAG = '(demo20)'
const need = (count: number) => Math.max(0, TARGET - count)
const daysAgo = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d
}

const SUPPLIERS = ['Acme Trading', 'Global Supply Co.', 'Metro Office Depot', 'Prime Builders Inc.', 'Luzon Auto Parts']
const DOC_TYPES = ['RIS', 'PAR', 'ICS', 'AIR']
const REQ_TYPES = ['transfer', 'new_supply', 'new_asset']
const STATUSES = ['pending', 'approved', 'completed']
const UNITS = ['pc', 'ream', 'box', 'set', 'unit', 'bottle', 'pack', 'roll']
const ACTIONS = ['create', 'update', 'approve', 'release', 'delete']
const MODULES = ['assets', 'deliveries', 'inspections', 'inventory', 'requests', 'repairs', 'documents']

async function main() {
  // ── Profiles (top up with demo employees) ──
  let profiles = await prisma.profile.findMany({ select: { id: true, full_name: true, role: true } })
  let n = need(profiles.length)
  for (let i = 0; i < n; i++) {
    const idx = profiles.length + i + 1
    await prisma.profile.create({
      data: { id: randomUUID(), full_name: `Demo Employee ${String(idx).padStart(2, '0')}`, role: 'employee', status: 'active' },
    })
  }
  profiles = await prisma.profile.findMany({ select: { id: true, full_name: true, role: true } })
  const pick = (role: string) => profiles.find((p) => p.role === role) ?? profiles[0]
  const admin = pick('super_admin')
  const personnel = pick('pgso_personnel')
  const employees = profiles.filter((p) => p.role === 'employee')
  console.log(`profiles: ${profiles.length}`)

  // ── Units ──
  n = need(await prisma.unit.count())
  const unitBase = await prisma.unit.count()
  for (let i = 0; i < n; i++) {
    await prisma.unit.create({ data: { name: `demo-unit-${unitBase + i + 1}`, abbreviation: `DU${unitBase + i + 1}`, status: 'active', created_by: admin.id } })
  }
  console.log(`units: ${await prisma.unit.count()}`)

  // ── Account catalog (already 20+, skip if full) ──
  n = need(await prisma.accountCatalog.count())
  for (let i = 0; i < n; i++) {
    const code = `DEMO${String(1000 + (await prisma.accountCatalog.count()) + 1)}`
    await prisma.accountCatalog.create({
      data: { account_code: code, account_title: `DEMO EQUIPMENT ${i + 1}`, asset_type: 'General', status: 'active', created_by: admin.id },
    })
  }
  const catalog = await prisma.accountCatalog.findFirst()
  console.log(`account_catalog: ${await prisma.accountCatalog.count()}`)

  // ── Assets (already 20+, skip if full) ──
  n = need(await prisma.asset.count())
  for (let i = 0; i < n; i++) {
    const idx = (await prisma.asset.count()) + 1
    await prisma.asset.create({
      data: {
        property_number: `DEMO-PN-${String(idx).padStart(4, '0')}`,
        qr_code: `DEMO-QR-${String(idx).padStart(4, '0')}`,
        article: `Demo Article ${idx}`,
        category: 'General',
        description: `Demo asset ${idx} ${TAG}`,
        quantity: 1,
        unit: 'pc',
        unit_cost: 1000 + idx * 10,
        total_cost: 1000 + idx * 10,
        location: 'Demo Warehouse',
        condition: 'good',
        status: 'available',
      },
    })
  }
  const assets = await prisma.asset.findMany({ select: { id: true }, take: 40 })
  console.log(`assets: ${await prisma.asset.count()}`)

  // ── Inventory ──
  n = need(await prisma.inventoryItem.count())
  const invBase = await prisma.inventoryItem.count()
  for (let i = 0; i < n; i++) {
    const idx = invBase + i + 1
    await prisma.inventoryItem.create({
      data: {
        item_name: `Demo Stock Item ${idx}`,
        category: 'Office Supplies',
        account_code: catalog?.account_code ?? '5020301000',
        quantity: 50 + idx,
        unit: UNITS[idx % UNITS.length],
        unit_cost: 20 + idx,
        total_cost: (20 + idx) * (50 + idx),
        location: 'Stock Room',
      },
    })
  }
  const stocks = await prisma.inventoryItem.findMany({ select: { id: true, item_name: true, quantity: true }, take: 40 })
  console.log(`inventory: ${await prisma.inventoryItem.count()}`)

  // ── Deliveries ──
  n = need(await prisma.delivery.count())
  for (let i = 0; i < n; i++) {
    const idx = (await prisma.delivery.count()) + 1
    await prisma.delivery.create({
      data: {
        po_reference: `DEMO-PO-${String(idx).padStart(4, '0')}`,
        supplier: SUPPLIERS[idx % SUPPLIERS.length],
        date_delivered: daysAgo(idx),
        delivery_status: 'complete',
        inspection_status: 'pending',
        received_by: personnel.id,
        recipient_name: employees[idx % employees.length].full_name,
        asset_type: 'General',
        account_code: catalog?.account_code,
        account_title: catalog?.account_title,
      },
    })
  }
  const deliveries = await prisma.delivery.findMany({ select: { id: true }, take: 40 })
  console.log(`deliveries: ${deliveries.length}`)

  // ── Delivery items ──
  n = need(await prisma.deliveryItem.count())
  for (let i = 0; i < n; i++) {
    const d = deliveries[i % deliveries.length]
    await prisma.deliveryItem.create({
      data: { delivery_id: d.id, item_name: `Demo Delivery Item ${i + 1}`, unit: UNITS[i % UNITS.length], quantity: 10 + i, unit_cost: 100 + i * 5 },
    })
  }
  console.log(`delivery_items: ${await prisma.deliveryItem.count()}`)

  // ── Inspections (one per delivery) ──
  n = need(await prisma.inspection.count())
  const existingInsp = await prisma.inspection.findMany({ select: { delivery_id: true } })
  const used = new Set(existingInsp.map((x) => x.delivery_id))
  let added = 0
  for (const d of deliveries) {
    if (added >= n) break
    if (used.has(d.id)) continue
    await prisma.inspection.create({
      data: {
        delivery_id: d.id,
        inspector_id: personnel.id,
        inspector_name: 'Demo Inspector',
        inspection_date: daysAgo(added + 1),
        result: ['passed', 'passed', 'partial', 'failed'][added % 4],
        remarks: `Demo inspection ${added + 1} ${TAG}`,
      },
    })
    added++
  }
  const inspections = await prisma.inspection.findMany({ select: { id: true, delivery_id: true }, take: 40 })
  console.log(`inspections: ${inspections.length}`)

  // ── IAR records ──
  n = need(await prisma.iarRecord.count())
  for (let i = 0; i < Math.min(n, inspections.length); i++) {
    const insp = inspections[i % inspections.length]
    await prisma.iarRecord.create({
      data: { inspection_id: insp.id, delivery_id: insp.delivery_id, kind: i % 2 === 0 ? 'generated' : 'attached', iar_no: `DEMO-IAR-${String(i + 1).padStart(4, '0')}`, iar_date: daysAgo(i + 1) },
    })
  }
  console.log(`iar_records: ${await prisma.iarRecord.count()}`)

  // ── Documents ──
  n = need(await prisma.document.count())
  const docBase = await prisma.document.count()
  for (let i = 0; i < n; i++) {
    const idx = docBase + i + 1
    await prisma.document.create({
      data: {
        document_type: DOC_TYPES[idx % DOC_TYPES.length],
        reference_number: `DEMO-REF-${String(idx).padStart(4, '0')}`,
        related_asset_id: idx % 3 === 0 ? assets[idx % assets.length].id : null,
        related_delivery_id: idx % 3 === 1 ? deliveries[idx % deliveries.length].id : null,
        status: 'pending',
        prepared_by: personnel.id,
        approved_by: admin.id,
      },
    })
  }
  const documents = await prisma.document.findMany({ select: { id: true, document_type: true }, take: 40 })
  console.log(`documents: ${documents.length}`)

  // ── Requests ──
  n = need(await prisma.request.count())
  for (let i = 0; i < n; i++) {
    const e = employees[i % employees.length]
    await prisma.request.create({
      data: {
        employee_id: e.id,
        recipient_id: personnel.id,
        request_type: REQ_TYPES[i % REQ_TYPES.length],
        asset_id: assets[i % assets.length].id,
        description: `Demo request ${i + 1} ${TAG}`,
        status: STATUSES[i % STATUSES.length],
        date_requested: daysAgo(i + 1),
      },
    })
  }
  const requests = await prisma.request.findMany({ select: { id: true }, take: 40 })
  console.log(`requests: ${requests.length}`)

  // ── Request items ──
  n = need(await prisma.requestItem.count())
  for (let i = 0; i < n; i++) {
    const r = requests[i % requests.length]
    await prisma.requestItem.create({
      data: { request_id: r.id, asset_id: assets[(i + 1) % assets.length].id, description: `Demo request line ${i + 1} ${TAG}`, quantity: 1 + (i % 5), unit_cost: 500 + i * 10 },
    })
  }
  console.log(`request_items: ${await prisma.requestItem.count()}`)

  // ── Repairs ──
  n = need(await prisma.repair.count())
  for (let i = 0; i < n; i++) {
    await prisma.repair.create({
      data: {
        asset_id: assets[i % assets.length].id,
        reported_by: employees[i % employees.length].id,
        repair_date: daysAgo(i + 1),
        description: `Demo repair ${i + 1} ${TAG}`,
        status: ['pending', 'in_progress', 'completed'][i % 3],
        technician: `Tech ${i + 1}`,
        created_by: personnel.id,
      },
    })
  }
  console.log(`repairs: ${await prisma.repair.count()}`)

  // ── Issuance records ──
  n = need(await prisma.issuanceRecord.count())
  for (let i = 0; i < n; i++) {
    const e = employees[i % employees.length]
    await prisma.issuanceRecord.create({
      data: {
        doc_type: i % 2 === 0 ? 'PAR' : 'ICS',
        doc_no: `DEMO-${i % 2 === 0 ? 'PAR' : 'ICS'}-${String(i + 1).padStart(4, '0')}`,
        doc_date: daysAgo(i + 1),
        asset_id: assets[i % assets.length].id,
        employee_id: e.id,
        request_id: requests[i % requests.length].id,
        quantity: 1,
        unit_cost: 1000 + i * 25,
        total_amount: 1000 + i * 25,
        created_by: personnel.id,
      },
    })
  }
  console.log(`issuance_records: ${await prisma.issuanceRecord.count()}`)

  // ── Document views ──
  n = need(await prisma.documentView.count())
  for (let i = 0; i < Math.min(n, documents.length); i++) {
    const d = documents[i]
    await prisma.documentView.upsert({
      where: { doc_type_doc_id: { doc_type: d.document_type, doc_id: d.id } },
      update: {},
      create: { doc_type: d.document_type, doc_id: d.id },
    })
  }
  console.log(`document_views: ${await prisma.documentView.count()}`)

  // ── Audit logs ──
  n = need(await prisma.auditLog.count())
  for (let i = 0; i < n; i++) {
    await prisma.auditLog.create({
      data: { id: randomUUID(), user_id: (i % 2 === 0 ? admin : personnel).id, action: ACTIONS[i % ACTIONS.length], module: MODULES[i % MODULES.length], details: { demo: true, seq: i + 1 } },
    })
  }
  console.log(`audit_logs: ${await prisma.auditLog.count()}`)

  // ── Idempotency keys ──
  n = need(await prisma.idempotencyKey.count())
  const keyBase = await prisma.idempotencyKey.count()
  for (let i = 0; i < n; i++) {
    await prisma.idempotencyKey.create({ data: { key: `demo-key-${String(keyBase + i + 1).padStart(3, '0')}`, operation: 'demo:seed', status: 'completed', response: { ok: true } } })
  }
  console.log(`idempotency_keys: ${await prisma.idempotencyKey.count()}`)

  // ── PPMP files ──
  n = need(await prisma.ppmpFile.count())
  const fileBase = await prisma.ppmpFile.count()
  for (let i = 0; i < n; i++) {
    const idx = fileBase + i + 1
    await prisma.ppmpFile.create({
      data: { filename: `demo-ppmp-${String(idx).padStart(2, '0')}.xlsx`, storage_path: `ppmp-files/demo/demo-ppmp-${String(idx).padStart(2, '0')}.xlsx`, file_size: 1024 * idx, mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', created_by: personnel.id },
    })
  }
  console.log(`ppmp_files: ${await prisma.ppmpFile.count()}`)
  console.log('DONE — every table topped up to 20 rows (where below).')
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('SEED FAILED:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
