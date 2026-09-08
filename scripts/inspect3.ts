import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  // All users with this email (including deleted)
  const users = await prisma.$queryRaw<{ id: string; email: string; deleted_at: string | null; email_confirmed_at: string | null; is_sso_user: boolean | null; is_anonymous: boolean | null }[]>`
    SELECT id, email, deleted_at, email_confirmed_at, is_sso_user, is_anonymous FROM auth.users WHERE email = 'pgso.personnel@gmail.com'
  `
  console.log('All users:', JSON.stringify(users, null, 2))

  // Identities for each user
  for (const u of users) {
    const idents = await prisma.$queryRaw<{ id: string; user_id: string; provider_id: string; provider: string; identity_data: any }[]>`
      SELECT id, user_id, provider_id, provider, identity_data FROM auth.identities WHERE user_id = ${u.id}::uuid
    `
    console.log(`Identities for user ${u.id}:`, JSON.stringify(idents, null, 2))
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) }).finally(async () => { await prisma.$disconnect() })