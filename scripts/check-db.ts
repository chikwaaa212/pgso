import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const [user] = await prisma.$queryRaw<{
    id: string
    email: string
    instance_id: string | null
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
    raw_app_meta_data: object | null
    raw_user_meta_data: object | null
    encrypted_password: string | null
  }[]>`
    SELECT id, email, instance_id, email_confirmed_at, confirmed_at, last_sign_in_at, aud, role, is_super_admin, is_sso_user, is_anonymous, banned_until, deleted_at, raw_app_meta_data, raw_user_meta_data, encrypted_password
    FROM auth.users 
    WHERE email = 'pgso.personnel@gmail.com'
  `
  console.log('User:', JSON.stringify(user, null, 2))

  const identities = await prisma.$queryRaw<{
    id: string
    user_id: string
    provider_id: string
    provider: string
    identity_data: object | null
  }[]>`
    SELECT id, user_id, provider_id, provider, identity_data 
    FROM auth.identities 
    WHERE user_id = ${user.id}::uuid
  `
  console.log('Identities:', JSON.stringify(identities, null, 2))
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
