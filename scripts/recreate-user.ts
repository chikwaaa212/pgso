import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'crypto'

const prisma = new PrismaClient()

async function main() {
  const email = 'pgso.personnel@gmail.com'
  const password = 'personnel123'

  // Delete existing
  await prisma.$executeRaw`
    DELETE FROM auth.identities WHERE user_id = (SELECT id FROM auth.users WHERE email = ${email})
  `.catch(() => undefined)
  await prisma.$executeRaw`
    DELETE FROM auth.users WHERE email = ${email}
  `.catch(() => undefined)
  await prisma.profile.deleteMany({ where: { id: 'b03768b8-cd7c-4d16-8380-c0052c8d43d8' } }).catch(() => undefined)

  const userId = randomUUID()
  // confirmed_at is a generated column - do not insert it
  await prisma.$executeRaw`
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, aud, role, is_sso_user, is_anonymous,
      created_at, updated_at
    ) VALUES (
      ${userId}::uuid,
      '83e404ef-9414-4d53-8d4d-9615a3ddc7ad'::uuid,
      ${email},
      crypt(${password}, gen_salt('bf', 6)),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      'authenticated',
      'authenticated',
      false,
      false,
      now(),
      now()
    )
  `
  console.log('Created user:', userId)

  const identityId = randomUUID()
  // email column in identities is generated - do not insert it
  await prisma.$executeRaw`
    INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
    VALUES (
      ${identityId}::uuid,
      ${userId}::uuid,
      ${email},
      'email',
      '{"provider":"email","email":"' + ${email} + '"}'::jsonb,
      now(),
      now()
    )
  `
  console.log('Created identity:', identityId)

  await prisma.profile.create({
    data: { id: userId, full_name: 'Personnel User', role: 'pgso_personnel', status: 'active' },
  })
  console.log('Created profile')

  const [match] = await prisma.$queryRaw<{ match: boolean }[]>`
    SELECT encrypted_password = crypt(${password}, encrypted_password) as match
    FROM auth.users WHERE id = ${userId}::uuid
  `
  console.log('Password matches:', match?.match)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) }).finally(async () => { await prisma.$disconnect() })