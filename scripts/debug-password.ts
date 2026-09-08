import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Check for any argon2 or other hash functions
  const extensions = await prisma.$queryRaw<{ extname: string }[]>`
    SELECT extname FROM pg_extension WHERE extname IN ('pgcrypto', 'pg_arg') OR extname LIKE '%crypt%'
  `
  console.log('Extensions:', extensions)

  // Check all bcrypt-related functions
  const funcs = await prisma.$queryRaw<{ proname: string }[]>`
    SELECT proname FROM pg_proc WHERE proname LIKE '%crypt%' OR proname LIKE '%bcrypt%' OR proname LIKE '%argon%'
  `
  console.log('Crypto functions:', funcs)

  // Check what password format Supabase uses for new users
  const allUsers = await prisma.$queryRaw`
    SELECT id, email, encrypted_password, email_confirmed_at 
    FROM auth.users 
    LIMIT 3
  `
  console.log('All users:', allUsers)

  // Try verifying current password against bcrypt
  const [user] = await prisma.$queryRaw<{ id: string; encrypted_password: string }[]>`
    SELECT id, encrypted_password FROM auth.users WHERE email = 'pgso.personnel@gmail.com'
  `
  
  if (user) {
    // Test if crypt works
    const verify = await prisma.$queryRaw<{ match: boolean }[]>`
      SELECT encrypted_password = crypt('personnel123', encrypted_password) as match 
      FROM auth.users 
      WHERE email = 'pgso.personnel@gmail.com'
    `
    console.log('Password verification result:', verify)
  }
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