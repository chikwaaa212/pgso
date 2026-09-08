import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Full user record
  const [user] = await prisma.$queryRaw<{
    id: string
    instance_id: string | null
    email: string
    encrypted_password: string
    email_confirmed_at: string | null
    confirmed_at: string | null
    last_sign_in_at: string | null
    aud: string | null
    role: string | null
    is_super_admin: boolean | null
    is_sso_user: boolean | null
    is_anonymous: boolean | null
    banned_until: string | null
    deleted_at: string | null
  }[]>`
    SELECT id, instance_id, email, encrypted_password, email_confirmed_at, confirmed_at, last_sign_in_at, aud, role, is_super_admin, is_sso_user, is_anonymous, banned_until, deleted_at
    FROM auth.users 
    WHERE email = 'pgso.personnel@gmail.com'
  `
  
  console.log('Full user record:', user)

  // Check identities
  const identities = await prisma.$queryRaw<{ id: string; user_id: string; provider: string; identity_data: object }[]>`
    SELECT id, user_id, provider, identity_data FROM auth.identities WHERE user_id = '${user.id}'
  `
  console.log('Identities:', identities)

  // Check if there's a pending instance
  const instances = await prisma.$queryRaw<{ id: string; uuid: string | null }[]>`
    SELECT id, uuid FROM auth.instances
  `
  console.log('Instances:', instances)
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