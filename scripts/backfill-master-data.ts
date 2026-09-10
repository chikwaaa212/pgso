import { PrismaClient } from '@prisma/client'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

const prisma = new PrismaClient()

const norm = (s: string | null | undefined) => (s ?? '').trim()

async function main() {
  // ── Collect legacy free-text values ──────────────────────────────
  const [assets, deliveries, invUnits, itemUnits] = await Promise.all([
    prisma.asset.findMany({
      select: { account_code: true, account_title: true, category: true, unit: true },
    }),
    prisma.delivery.findMany({
      select: { account_code: true, account_title: true, asset_type: true },
    }),
    prisma.inventoryItem.findMany({ select: { unit: true } }),
    prisma.deliveryItem.findMany({ select: { unit: true } }),
  ])

  // ── Units (normalize to lowercase, keep first-seen display form) ──
  const unitSeen = new Map<string, string>()
  const pushUnit = (raw: string | null | undefined) => {
    const t = norm(raw)
    if (!t) return
    const key = t.toLowerCase()
    if (!unitSeen.has(key)) unitSeen.set(key, t)
  }
  for (const a of assets) pushUnit(a.unit)
  for (const i of invUnits) pushUnit(i.unit)
  for (const d of itemUnits) pushUnit(d.unit)

  let unitsCreated = 0
  for (const [, display] of unitSeen) {
    const key = display.toLowerCase()
    const existing = await prisma.unit.findUnique({ where: { name: key } })
    if (!existing) {
      await prisma.unit.create({ data: { name: key, status: 'active' } })
      unitsCreated += 1
    }
  }

  // ── Account catalog (linked triple: code + title + type) ──────────
  type Triple = { code: string; title: string; type: string }
  const triples = new Map<string, Triple>()
  const pushTriple = (code: string | null | undefined, title: string | null | undefined, type: string | null | undefined) => {
    const c = norm(code)
    if (!c) return
    const t = norm(title) || 'GENERAL'
    const y = norm(type) || 'General'
    if (!triples.has(c)) triples.set(c, { code: c, title: t.toUpperCase(), type: y })
  }
  for (const a of assets) pushTriple(a.account_code, a.account_title, a.category)
  for (const d of deliveries) pushTriple(d.account_code, d.account_title, d.asset_type)

  let catalogCreated = 0
  for (const [, triple] of triples) {
    const existing = await prisma.accountCatalog.findUnique({
      where: { account_code: triple.code },
    })
    if (!existing) {
      await prisma.accountCatalog.create({
        data: {
          account_code: triple.code,
          account_title: triple.title,
          asset_type: triple.type,
          status: 'active',
        },
      })
      catalogCreated += 1
    }
  }

  const [unitCount, catalogCount] = await Promise.all([
    prisma.unit.count(),
    prisma.accountCatalog.count(),
  ])
  console.log(`units: +${unitsCreated} new (${unitCount} total), catalog: +${catalogCreated} new (${catalogCount} total)`)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Backfill failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
