import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'crypto'

const prisma = new PrismaClient()

async function main() {
  const email = 'pgso.personnel@gmail.com'
  const password = 'personnel123'

  const [user] = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM auth.users WHERE email = ${email}
  `
  const userId = user.id
  console.log('User ID:', userId)

  await prisma.$executeRaw`
    DELETE FROM auth.identities WHERE user_id = ${userId}::uuid
  `.catch(() => undefined)

  const identityId = randomUUID()
  await prisma.$executeRaw`
    INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
    VALUES (
      ${identityId}::uuid,
      ${userId}::uuid,
      ${email},
      'email',
      jsonb_build_object('provider', 'email'::text, 'email', ${email}),
      now(),
      now()
    )
  `
  console.log('Created identity:', identityId)

  await prisma.profile.upsert({
    where: { id: userId },
    update: { full_name: 'Personnel User', role: 'pgso_personnel', status: 'active' },
    create: { id: userId, full_name: 'Personnel User', role: 'pgso_personnel', status: 'active' },
  })
  console.log('Profile ensured')

  const [match] = await prisma.$queryRaw<{ match: boolean }[]>`
    SELECT encrypted_password = crypt(${password}, encrypted_password) as match
    FROM auth.users WHERE id = ${userId}::uuid
  `
  console.log('Password matches:', match?.match)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) }).finally(async () => { await prisma.$disconnect() })