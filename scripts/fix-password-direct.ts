import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const email = 'pgso.personnel@gmail.com'
  const password = 'personnel123'

  // Update password hash directly using pgcrypto crypt()
  const result = await prisma.$executeRaw`
    UPDATE auth.users 
    SET encrypted_password = crypt(${password}, gen_salt('bf', 6)),
        updated_at = now()
    WHERE email = ${email}
  `
  console.log('Password updated, rows affected:', result)

  // Verify
  const [match] = await prisma.$queryRaw<{ match: boolean }[]>`
    SELECT encrypted_password = crypt(${password}, encrypted_password) as match
    FROM auth.users WHERE email = ${email}
  `
  console.log('Password matches:', match.match)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) }).finally(async () => { await prisma.$disconnect() })