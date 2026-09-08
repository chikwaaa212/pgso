import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const [user] = await prisma.$queryRaw<{ id: string; email: string; encrypted_password: string }[]>`
    SELECT id, email, encrypted_password FROM auth.users WHERE email = 'pgso.personnel@gmail.com'
  `
  console.log('User email:', JSON.stringify(user?.email))
  console.log('Password hash:', user?.encrypted_password)

  const [match] = await prisma.$queryRaw<{ match: boolean }[]>`
    SELECT encrypted_password = crypt('personnel123', encrypted_password) as match
    FROM auth.users WHERE email = 'pgso.personnel@gmail.com'
  `
  console.log('Password matches:', match?.match)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) }).finally(async () => { await prisma.$disconnect() })