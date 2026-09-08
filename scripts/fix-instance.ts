import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'crypto'

const prisma = new PrismaClient()

async function main() {
  const email = 'pgso.personnel@gmail.com'
  const instanceId = randomUUID()

  // Create auth instance
  const result = await prisma.$executeRaw`
    INSERT INTO auth.instances (id, uuid, raw_base_config, created_at, updated_at)
    VALUES (
      ${instanceId}::uuid,
      ${instanceId}::uuid,
      '{}'::text,
      now(),
      now()
    )
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `
  console.log('Instance insert result:', result)

  // Update user instance_id
  await prisma.$executeRaw`
    UPDATE auth.users 
    SET instance_id = ${instanceId}::uuid,
        updated_at = now()
    WHERE email = ${email}
  `
  console.log('Updated user')

  // Verify
  const instances = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM auth.instances
  `
  console.log('Instances count:', instances.length)

  const [user] = await prisma.$queryRaw<{ id: string; email: string; instance_id: string | null }[]>`
    SELECT id, email, instance_id FROM auth.users WHERE email = ${email}
  `
  console.log('User:', user)
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