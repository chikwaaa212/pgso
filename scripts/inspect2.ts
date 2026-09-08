import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const identities = await prisma.$queryRaw<{ id: string; user_id: string; provider_id: string; provider: string; identity_data: object }[]>`
    SELECT id, user_id, provider_id, provider, identity_data FROM auth.identities WHERE user_id = 'b03768b8-cd7c-4d16-8380-c0052c8d43d8'::uuid
  `
  console.log('Identities:', JSON.stringify(identities, null, 2))

  const instances = await prisma.$queryRaw<{ id: string; uuid: string | null }[]>`
    SELECT id, uuid FROM auth.instances
  `
  console.log('Instances:', JSON.stringify(instances, null, 2))
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) }).finally(async () => { await prisma.$disconnect() })