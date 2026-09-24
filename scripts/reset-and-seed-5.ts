/**
 * Reset DB: keep admin + main personnel, wipe all users/transactions,
 * then seed exactly 5 rows per transaction/stock table.
 * Run: npx tsx --env-file=.env.local scripts/reset-and-seed-5.ts
 */
import { createClient } from '@supabase/supabase-js'
import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'crypto'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const prisma = new PrismaClient()
const daysAgo = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d
}

async function main() {
  // ── 1. Resolve keep IDs (canonical admin + personnel) ──
  const allProfiles = await prisma.profile.findMany()
  console.log(`profiles before: ${allProfiles.length}`)
  let admin = allProfiles.find((p) => p.role === 'super_admin')
  let personnel = allProfiles.find((p) => p.role === 'pgso_personnel' && p.full_name === 'Personnel User')
    ?? allProfiles.find((p) => p.role === 'pgso_personnel')
  if (!admin) throw new Error('No super_admin profile found — aborting to avoid deleting everything')
  if (!personnel) throw new Error('No pgso_personnel profile found — aborting')
  console.log(`KEEP admin: ${admin.id} (${admin.full_name} / ${admin.role})`)
  console.log(`KEEP personnel: ${personnel.id} (${personnel.full_name} / ${personnel.role})`)
  const keepIds = new Set([admin.id, personnel.id])

  // ── 2. Wipe transaction/stock/log tables (FK-safe order) ──
  // documents reference almost everything -> first; views reference docs by (type,id) not FK but clear anyway
  await prisma.documentView.deleteMany()
  await prisma.document.deleteMany()
  await prisma.iarRecord.deleteMany()
  await prisma.inspection.deleteMany()
  await prisma.deliveryItem.deleteMany()
  await prisma.delivery.deleteMany()
  await prisma.requestItem.deleteMany()
  await prisma.request.deleteMany()
  await prisma.repair.deleteMany()
  await prisma.issuanceRecord.deleteMany()
  await prisma.auditLog.deleteMany()
  await prisma.idempotencyKey.deleteMany()
  await prisma.ppmpFile.deleteMany()
  await prisma.inventoryItem.deleteMany()
  await prisma.asset.deleteMany()
  console.log('wiped transaction tables')

  // ── 3. Delete non-keep profiles ──
  const delProfiles = await prisma.profile.deleteMany({ where: { id: { notIn: [...keepIds] } } })
  console.log(`deleted profiles: ${delProfiles.count}`)

  // ── 4. Delete matching auth.users (keep admin/personnel logins) ──
  const { data: listData, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
  if (listErr) console.error('listUsers error:', listErr.message)
  else {
    let deleted = 0, kept = 0
    for (const u of listData.users) {
      if (keepIds.has(u.id)) { kept++; continue }
      const { error } = await supabaseAdmin.auth.admin.deleteUser(u.id)
      if (error) console.error(`delete auth user ${u.email} failed:`, error.message)
      else deleted++
    }
    console.log(`auth.users: deleted=${deleted} kept=${kept}`)
  }

  // ── 5. Seed exactly 5 rows per table ──
  const adminId = admin.id
  const personnelId = personnel.id

  // Assets (5)
  const assetDefs = [
    { property_number: 'RESET-A-0001', qr_code: 'RESET-QR-0001', article: 'Office Table', category: 'Furniture', description: 'Wooden office table', quantity: 1, unit: 'pc', unit_cost: 5500, total_cost: 5500, location: 'PGSO Stock Room', condition: 'good', status: 'available' },
    { property_number: 'RESET-A-0002', qr_code: 'RESET-QR-0002', article: 'Office Chair', category: 'Furniture', description: 'Ergonomic office chair', quantity: 1, unit: 'pc', unit_cost: 3200, total_cost: 3200, location: 'PGSO Stock Room', condition: 'good', status: 'available' },
    { property_number: 'RESET-A-0003', qr_code: 'RESET-QR-0003', article: 'Laptop', category: 'IT Equipment', description: '14-inch laptop i5/8GB', quantity: 1, unit: 'unit', unit_cost: 45000, total_cost: 45000, location: 'PGSO Office', condition: 'good', status: 'available' },
    { property_number: 'RESET-A-0004', qr_code: 'RESET-QR-0004', article: 'Printer', category: 'IT Equipment', description: 'Mono laser printer', quantity: 1, unit: 'unit', unit_cost: 12500, total_cost: 12500, location: 'PGSO Office', condition: 'good', status: 'available' },
    { property_number: 'RESET-A-0005', qr_code: 'RESET-QR-0005', article: 'Filing Cabinet', category: 'Furniture', description: '4-layer steel cabinet', quantity: 1, unit: 'pc', unit_cost: 7800, total_cost: 7800, location: 'PGSO Records', condition: 'good', status: 'available' },
  ]
  const assets = []
  for (const a of assetDefs) assets.push(await prisma.asset.create({ data: a }))

  // Inventory / stocks (5)
  const stockDefs = [
    { item_name: 'Bond Paper A4', category: 'Office Supplies', quantity: 100, unit: 'ream', unit_cost: 240, total_cost: 24000, location: 'Stock Room' },
    { item_name: 'Ballpoint Pen', category: 'Office Supplies', quantity: 200, unit: 'pc', unit_cost: 12, total_cost: 2400, location: 'Stock Room' },
    { item_name: 'Printer Ink', category: 'Office Supplies', quantity: 30, unit: 'bottle', unit_cost: 350, total_cost: 10500, location: 'Stock Room' },
    { item_name: 'Cleaning Detergent', category: 'Janitorial', quantity: 50, unit: 'pack', unit_cost: 85, total_cost: 4250, location: 'Janitorial Closet' },
    { item_name: 'Toner Cartridge', category: 'Office Supplies', quantity: 20, unit: 'pc', unit_cost: 2800, total_cost: 56000, location: 'Stock Room' },
  ]
  const stocks = []
  for (const s of stockDefs) stocks.push(await prisma.inventoryItem.create({ data: s }))

  // Deliveries (5)
  const deliveries = []
  const suppliers = ['Acme Trading', 'Global Supply Co.', 'Metro Office Depot', 'Prime Builders Inc.', 'Luzon Auto Parts']
  for (let i = 0; i < 5; i++) {
    deliveries.push(await prisma.delivery.create({
      data: {
        po_reference: `RESET-PO-000${i + 1}`,
        supplier: suppliers[i],
        date_delivered: daysAgo(5 - i),
        delivery_status: 'complete',
        inspection_status: 'inspected',
        received_by: personnelId,
        recipient_name: 'Personnel User',
        asset_type: 'General',
      },
    }))
  }

  // Delivery items (5 — one per delivery)
  const itemNames = ['Bond Paper A4', 'Ballpoint Pen', 'Printer Ink', 'Office Table', 'Office Chair']
  for (let i = 0; i < 5; i++) {
    await prisma.deliveryItem.create({
      data: { delivery_id: deliveries[i].id, item_name: itemNames[i], unit: i < 3 ? (i === 0 ? 'ream' : i === 1 ? 'pc' : 'bottle') : 'pc', quantity: 10 * (i + 1), unit_cost: 100 * (i + 1) },
    })
  }

  // Inspections (5 — one per delivery)
  const inspections = []
  for (let i = 0; i < 5; i++) {
    inspections.push(await prisma.inspection.create({
      data: {
        delivery_id: deliveries[i].id,
        inspector_id: personnelId,
        inspector_name: 'Personnel User',
        inspection_date: daysAgo(5 - i),
        result: i < 4 ? 'passed' : 'partial',
        remarks: `Reset inspection ${i + 1}`,
      },
    }))
  }

  // IAR records (5 — one per inspection)
  for (let i = 0; i < 5; i++) {
    await prisma.iarRecord.create({
      data: { inspection_id: inspections[i].id, delivery_id: deliveries[i].id, kind: 'generated', iar_no: `RESET-IAR-000${i + 1}`, iar_date: daysAgo(5 - i) },
    })
  }

  // Documents (5)
  const documents = []
  const docTypes = ['RIS', 'PAR', 'ICS', 'AIR', 'RIS']
  for (let i = 0; i < 5; i++) {
    documents.push(await prisma.document.create({
      data: {
        document_type: docTypes[i],
        reference_number: `RESET-REF-000${i + 1}`,
        related_asset_id: i < 2 ? assets[i].id : null,
        related_delivery_id: i >= 2 && i < 4 ? deliveries[i].id : null,
        status: 'approved',
        prepared_by: personnelId,
        approved_by: adminId,
      },
    }))
  }

  // Requests (5 — personnel acts as requestor since employees were wiped)
  const requests = []
  const reqTypes = ['new_supply', 'new_asset', 'transfer', 'new_supply', 'new_asset']
  for (let i = 0; i < 5; i++) {
    requests.push(await prisma.request.create({
      data: {
        employee_id: personnelId,
        recipient_id: personnelId,
        request_type: reqTypes[i],
        asset_id: assets[i].id,
        description: `Reset request ${i + 1}`,
        status: i === 0 ? 'pending' : i === 1 ? 'approved' : 'completed',
        date_requested: daysAgo(5 - i),
      },
    }))
  }

  // Request items (5 — one per request)
  for (let i = 0; i < 5; i++) {
    await prisma.requestItem.create({
      data: { request_id: requests[i].id, asset_id: assets[(i + 1) % 5].id, description: `Reset request line ${i + 1}`, quantity: i + 1, unit_cost: 500 * (i + 1) },
    })
  }

  // Repairs (5)
  for (let i = 0; i < 5; i++) {
    await prisma.repair.create({
      data: {
        asset_id: assets[i].id,
        reported_by: personnelId,
        repair_date: daysAgo(5 - i),
        description: `Reset repair ${i + 1}`,
        status: ['pending', 'in_progress', 'completed', 'completed', 'pending'][i],
        technician: `Tech ${i + 1}`,
        created_by: personnelId,
      },
    })
  }

  // Issuance records (5)
  for (let i = 0; i < 5; i++) {
    await prisma.issuanceRecord.create({
      data: {
        doc_type: i % 2 === 0 ? 'PAR' : 'ICS',
        doc_no: `RESET-${i % 2 === 0 ? 'PAR' : 'ICS'}-000${i + 1}`,
        doc_date: daysAgo(5 - i),
        asset_id: assets[i].id,
        employee_id: personnelId,
        request_id: requests[i].id,
        quantity: 1,
        unit_cost: 1000 * (i + 1),
        total_amount: 1000 * (i + 1),
        created_by: personnelId,
      },
    })
  }

  // Document views (5 — one per document)
  for (let i = 0; i < 5; i++) {
    await prisma.documentView.upsert({
      where: { doc_type_doc_id: { doc_type: documents[i].document_type, doc_id: documents[i].id } },
      update: {},
      create: { doc_type: documents[i].document_type, doc_id: documents[i].id, viewer_id: personnelId },
    })
  }

  // Audit logs (5)
  const actions = ['create', 'update', 'approve', 'release', 'view']
  const modules = ['assets', 'deliveries', 'inventory', 'requests', 'documents']
  for (let i = 0; i < 5; i++) {
    await prisma.auditLog.create({
      data: { id: randomUUID(), user_id: i % 2 === 0 ? adminId : personnelId, action: actions[i], module: modules[i], details: { reset: true, seq: i + 1 } },
    })
  }

  // Idempotency keys (5)
  for (let i = 0; i < 5; i++) {
    await prisma.idempotencyKey.create({ data: { key: `reset-key-00${i + 1}`, operation: 'reset:seed-5', status: 'completed', response: { ok: true } } })
  }

  // PPMP files (5)
  for (let i = 0; i < 5; i++) {
    await prisma.ppmpFile.create({
      data: { filename: `reset-ppmp-0${i + 1}.xlsx`, storage_path: `ppmp-files/reset/reset-ppmp-0${i + 1}.xlsx`, file_size: 1024 * (i + 1), mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', created_by: personnelId },
    })
  }

  console.log('seeded 5 rows per table — DONE')
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error('RESET FAILED:', e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
