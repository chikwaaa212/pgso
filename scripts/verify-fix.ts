import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables 
    WHERE schemaname = 'public' AND tablename IN ('idempotency_keys', 'profiles')
  `
  console.log('Tables:', tables)

  const keys = await prisma.$queryRaw`SELECT * FROM idempotency_keys LIMIT 3`
  console.log('Idempotency keys:', JSON.stringify(keys, null, 2))
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
