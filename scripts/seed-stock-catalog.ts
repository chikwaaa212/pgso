import { PrismaClient } from '@prisma/client'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

const prisma = new PrismaClient()

/**
 * Matching catalog rows so the Log-a-delivery Account Title dropdown has
 * stock titles to pick from. Codes follow the existing X-XX-XX-XXX style —
 * adjust them if the client chart of accounts differs.
 */
const STOCK_CATALOG = [
  { account_code: '5-02-01-010', account_title: 'OFFICE SUPPLIES', asset_type: 'Office Supplies' },
  { account_code: '5-02-02-010', account_title: 'JANITORIAL SUPPLIES', asset_type: 'Janitorial Supplies' },
  { account_code: '5-02-03-010', account_title: 'MEDICAL SUPPLIES', asset_type: 'Medical Supplies' },
  { account_code: '5-02-04-010', account_title: 'ICT SUPPLIES', asset_type: 'ICT Supplies' },
  { account_code: '5-02-05-010', account_title: 'FUEL AND LUBRICANTS', asset_type: 'Fuel & Lubricants' },
]

async function main() {
  for (const row of STOCK_CATALOG) {
    await prisma.accountCatalog.upsert({
      where: { account_code: row.account_code },
      update: {},
      create: { ...row, status: 'active' },
    })
  }
  const total = await prisma.accountCatalog.count()
  console.log(`account_catalog: ${STOCK_CATALOG.length} stock rows upserted (${total} total)`)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Stock catalog seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
