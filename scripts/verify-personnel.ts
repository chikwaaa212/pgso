import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const email = 'pgso.personnel@gmail.com'
  
  const users = await prisma.$queryRaw<{ id: string; email: string; aud: string; role: string; email_confirmed_at: string | null; last_sign_in_at: string | null }[]>`
    SELECT id, email, aud, role, email_confirmed_at, last_sign_in_at 
    FROM auth.users 
    WHERE email = ${email}
  `
  
  const profiles = await prisma.$queryRaw<{ id: string; full_name: string | null; role: string; status: string }[]>`
    SELECT id, full_name, role, status 
    FROM profiles 
    WHERE id = (SELECT id FROM auth.users WHERE email = ${email} LIMIT 1)
  `
  
  console.log('Auth user:', users)
  console.log('Profile:', profiles)
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