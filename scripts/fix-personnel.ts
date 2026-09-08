import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const email = 'pgso.personnel@gmail.com'
const userId = 'b03768b8-cd7c-4d16-8380-c0052c8d43d8'

async function main() {
  const identities = await prisma.$queryRaw<{ id: string; provider_id: string; provider: string }[]>`
    SELECT id, provider_id, provider FROM auth.identities WHERE user_id = ${userId}::uuid
  `
  console.log('Current identities:', JSON.stringify(identities, null, 2))

  for (const ident of identities) {
    if (ident.provider_id !== email) {
      await prisma.$executeRaw`
        UPDATE auth.identities
        SET provider_id = ${email},
            identity_data = jsonb_build_object('provider', 'email', 'email', ${email}),
            updated_at = now()
        WHERE id = ${ident.id}::uuid
      `
      console.log(`Fixed identity ${ident.id}: provider_id updated to ${email}`)
    }
  }

  const [user] = await prisma.$queryRaw<{ encrypted_password: string }[]>`
    SELECT encrypted_password FROM auth.users WHERE id = ${userId}::uuid
  `
  if (user) {
    const [match] = await prisma.$queryRaw<{ match: boolean }[]>`
      SELECT encrypted_password = crypt('personnel123', encrypted_password) as match
      FROM auth.users WHERE id = ${userId}::uuid
    `
    console.log('Password matches:', match.match)
  }

  const updatedIdentities = await prisma.$queryRaw<{ id: string; provider_id: string }[]>`
    SELECT id, provider_id FROM auth.identities WHERE user_id = ${userId}::uuid
  `
  console.log('Updated identities:', JSON.stringify(updatedIdentities, null, 2))
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
