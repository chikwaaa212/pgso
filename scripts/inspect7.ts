import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const settings = await prisma.$queryRaw<{ key: string; value: any }[]>`
    SELECT key, value FROM auth.settings LIMIT 50
  `.catch(() => [])
  console.log('Auth settings:', JSON.stringify(settings, null, 2))

  const triggers = await prisma.$queryRaw<{ trigger_name: string; action_timing: string; event_manipulation: string }[]>`
    SELECT trigger_name, action_timing, event_manipulation FROM information_schema.triggers WHERE trigger_schema = 'auth'
  `.catch(() => [])
  console.log('Auth triggers:', JSON.stringify(triggers, null, 2))

  const [user] = await prisma.$queryRaw<{ id: string; raw_app_meta_data: any; raw_user_meta_data: any; confirmation_token: string; recovery_token: string }[]>`
    SELECT id, raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token FROM auth.users WHERE email = 'pgso.personnel@gmail.com'
  `
  console.log('User meta:', JSON.stringify(user, null, 2))
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) }).finally(async () => { await prisma.$disconnect() })