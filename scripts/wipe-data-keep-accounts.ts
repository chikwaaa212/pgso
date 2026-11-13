/**
 * Wipe every data table while keeping only super_admin and pgso_personnel
 * accounts (profiles + Supabase auth users). Master data is deleted too.
 *
 * Run: npx tsx scripts/wipe-data-keep-accounts.ts
 */
import { createClient } from '@supabase/supabase-js'
import { PrismaClient } from '@prisma/client'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const prisma = new PrismaClient()

async function main() {
  const keepProfiles = await prisma.profile.findMany({
    where: { role: { in: ['super_admin', 'pgso_personnel'] } },
    select: { id: true, full_name: true, role: true },
  })
  const adminCount = keepProfiles.filter((p) => p.role === 'super_admin').length
  if (adminCount === 0) {
    throw new Error('No super_admin profile found — aborting to avoid deleting every account.')
  }
  const keepIds = keepProfiles.map((p) => p.id)
  console.log(`keeping ${keepIds.length} account(s):`)
  for (const p of keepProfiles) console.log(`  - ${p.role}: ${p.full_name} (${p.id})`)

  // ── 1. Transaction / master-data tables (FK-safe order) ─────────────
  const results: Array<[string, number]> = []
  const clear = async (label: string, fn: () => Promise<{ count: number }>) => {
    const r = await fn()
    results.push([label, r.count])
  }

  await clear('document_views', () => prisma.documentView.deleteMany())
  await clear('documents', () => prisma.document.deleteMany())
  await clear('iar_records', () => prisma.iarRecord.deleteMany())
  await clear('inspections', () => prisma.inspection.deleteMany())
  await clear('delivery_items', () => prisma.deliveryItem.deleteMany())
  await clear('deliveries', () => prisma.delivery.deleteMany())
  await clear('request_items', () => prisma.requestItem.deleteMany())
  await clear('requests', () => prisma.request.deleteMany())
  await clear('repairs', () => prisma.repair.deleteMany())
  await clear('issuance_records', () => prisma.issuanceRecord.deleteMany())
  await clear('audit_logs', () => prisma.auditLog.deleteMany())
  await clear('idempotency_keys', () => prisma.idempotencyKey.deleteMany())
  await clear('ppmp_analysis_results', () => prisma.ppmpAnalysisResult.deleteMany())
  await clear('ppmp_analysis_sessions', () => prisma.ppmpAnalysisSession.deleteMany())
  await clear('ppmp_analytics_config', () => prisma.ppmpAnalyticsConfig.deleteMany())
  await clear('ppmp_files', () => prisma.ppmpFile.deleteMany())
  await clear('inventory', () => prisma.inventoryItem.deleteMany())
  await clear('assets', () => prisma.asset.deleteMany())
  await clear('asset_custom_fields', () => prisma.assetCustomField.deleteMany())
  await clear('units', () => prisma.unit.deleteMany())
  await clear('departments', () => prisma.department.deleteMany())
  await clear('account_catalog', () => prisma.accountCatalog.deleteMany())
  await clear('stock_types', () => prisma.stockType.deleteMany())

  // ── 2. Delete non-kept profiles ─────────────────────────────────────
  const delProfiles = await prisma.profile.deleteMany({ where: { id: { notIn: keepIds } } })
  results.push(['profiles', delProfiles.count])

  // ── 3. Delete matching Supabase auth users ──────────────────────────
  const keep = new Set(keepIds)
  const { data: listData, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
  if (listErr) throw new Error(`listUsers failed: ${listErr.message}`)
  let authDeleted = 0
  for (const u of listData.users) {
    if (keep.has(u.id)) continue
    const { error } = await supabaseAdmin.auth.admin.deleteUser(u.id)
    if (error) console.error(`  delete auth user ${u.email} failed: ${error.message}`)
    else authDeleted += 1
  }
  results.push(['auth_users', authDeleted])

  console.log('\nwiped:')
  for (const [label, count] of results) console.log(`  ${label}: ${count}`)
  console.log('\nDONE — only super_admin + pgso_personnel accounts remain.')
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('WIPE FAILED:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
