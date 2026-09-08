import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const [user] = await prisma.$queryRaw<{ id: string; email: string; email_hex: string }[]>`
    SELECT id, email, encode(email::bytea, 'hex') as email_hex FROM auth.users WHERE email ILIKE 'pgso.personnel%'
  `
  console.log('User:', JSON.stringify(user, null, 2))

  const allUsers = await prisma.$queryRaw<{ id: string; email: string }[]>`
    SELECT id, email FROM auth.users WHERE email ILIKE '%pgso%'
  `
  console.log('All pgso users:', JSON.stringify(allUsers, null, 2))
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) }).finally(async () => { await prisma.$disconnect() })