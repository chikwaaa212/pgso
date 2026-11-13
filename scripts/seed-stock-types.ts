import { PrismaClient } from '@prisma/client'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

const prisma = new PrismaClient()

const STOCK_TYPES = [
  'Office Supplies',
  'Janitorial Supplies',
  'Medical Supplies',
  'ICT Supplies',
  'Fuel & Lubricants',
]

async function main() {
  for (const name of STOCK_TYPES) {
    await prisma.stockType.upsert({
      where: { name },
      update: {},
      create: { name, status: 'active' },
    })
  }
  const total = await prisma.stockType.count()
  console.log(`stock_types: ${STOCK_TYPES.length} upserted (${total} total)`)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Stock type seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
