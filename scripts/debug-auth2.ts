import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const funcs = await prisma.$queryRaw<{ proname: string }[]>`
    SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'auth'
  `.catch(() => [])
  console.log('Auth functions:', funcs.map(f => f.proname).join(', '))

  const constraints = await prisma.$queryRaw<{ conname: string; contype: string; conrelid: string }[]>`
    SELECT conname, contype, conrelid::regclass as conrelid FROM pg_constraint WHERE connamespace = 'auth'::regnamespace
  `.catch(() => [])
  console.log('Auth constraints:', constraints.map(c => `${c.conrelid}.${c.conname} (${c.contype})`).join(', '))

  const allUsers = await prisma.$queryRaw<{ id: string; email: string; deleted_at: string | null }[]>`
    SELECT id, email, deleted_at FROM auth.users
  `
  console.log('All users:', JSON.stringify(allUsers, null, 2))

  const identCount = await prisma.$queryRaw<{ count: string }[]>`
    SELECT count(*) FROM auth.identities
  `
  console.log('Identities count:', identCount[0].count)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) }).finally(async () => { await prisma.$disconnect() })