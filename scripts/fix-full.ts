import { createClient } from '@supabase/supabase-js'
import prisma from '../src/lib/prisma'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const email = 'pgso.personnel@gmail.com'

async function main() {
  const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
  const existingUser = existingUsers?.users?.find(u => u.email === email)

  if (!existingUser) {
    console.log('User not found in Supabase Auth with email:', email)
    console.log('Please run create-personnel.ts first to create the user.')
    process.exit(1)
  }

  const userId = existingUser.id
  const instanceId = crypto.randomUUID()

  await prisma.$executeRaw`
    INSERT INTO auth.instances (id, uuid, raw_base_config, created_at, updated_at)
    VALUES (
      ${instanceId}::uuid,
      ${instanceId}::uuid,
      '{}'::text,
      now(),
      now()
    )
    ON CONFLICT (id) DO NOTHING
  `
  console.log('Created instance:', instanceId)

  await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: { instance_id: instanceId },
  })

  await prisma.$executeRaw`
    UPDATE auth.users 
    SET instance_id = ${instanceId}::uuid,
        updated_at = now()
    WHERE id = ${userId}::uuid
  `
  console.log('Updated user instance_id')

  const [user] = await prisma.$queryRaw<{ instance_id: string | null }[]>`
    SELECT instance_id FROM auth.users WHERE id = ${userId}::uuid
  `
  console.log('Verified user instance_id:', user.instance_id)
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
