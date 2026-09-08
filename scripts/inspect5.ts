import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const [ident] = await prisma.$queryRaw<{ id: string; provider_id: string; email: string; identity_data: any }[]>`
    SELECT id, provider_id, email, identity_data FROM auth.identities WHERE user_id = 'b03768b8-cd7c-4d16-8380-c0052c8d43d8'::uuid
  `
  console.log('Identity:', JSON.stringify(ident, null, 2))

  const [user] = await prisma.$queryRaw<{ id: string; email: string; raw_user_meta_data: any }[]>`
    SELECT id, email, raw_user_meta_data FROM auth.users WHERE email = 'pgso.personnel@gmail.com'
  `
  console.log('User:', JSON.stringify(user, null, 2))

  const [status] = await prisma.$queryRaw<{ email_change: string; email_change_token_current: string; email_change_confirm_status: number }[]>`
    SELECT email_change, email_change_token_current, email_change_confirm_status FROM auth.users WHERE email = 'pgso.personnel@gmail.com'
  `
  console.log('Email change status:', JSON.stringify(status, null, 2))
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) }).finally(async () => { await prisma.$disconnect() })