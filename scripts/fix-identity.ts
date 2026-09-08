import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'crypto'

const prisma = new PrismaClient()

async function main() {
  const userId = 'b03768b8-cd7c-4d16-8380-c0052c8d43d8'
  const identityId = randomUUID()

  // Check identity columns more carefully
  const cols = await prisma.$queryRaw<{ column_name: string; is_generated: string }[]>`
    SELECT column_name, is_generated FROM information_schema.columns 
    WHERE table_schema = 'auth' AND table_name = 'identities'
    ORDER BY ordinal_position
  `
  console.log('Identity columns:', cols)

  // Create identity without email (generated column)
  await prisma.$executeRaw`
    INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data)
    VALUES (
      ${identityId}::uuid,
      ${userId}::uuid,
      '${userId}'::text,
      'email',
      '{"provider": "email"}'::jsonb
    )
    ON CONFLICT DO NOTHING
  `
  console.log('Created identity')

  // Verify
  const [ident] = await prisma.$queryRaw<{ id: string; user_id: string; provider: string }[]>`
    SELECT id, user_id, provider FROM auth.identities WHERE user_id = ${userId}::uuid
  `
  console.log('Verified identity:', ident)
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