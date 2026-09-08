import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL } },
})

async function main() {
  const userRes = await prisma.$queryRaw<{ current_user: string; usesuper: boolean }[]>`
    SELECT current_user, usesuper FROM pg_user WHERE usename = current_user
  `
  console.log('Direct user:', userRes[0])

  const prisma2 = new PrismaClient()
  const userRes2 = await prisma2.$queryRaw<{ current_user: string; usesuper: boolean }[]>`
    SELECT current_user, usesuper FROM pg_user WHERE usename = current_user
  `
  console.log('Pooler user:', userRes2[0])

  await prisma2.$disconnect()
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) }).finally(async () => { await prisma.$disconnect() })