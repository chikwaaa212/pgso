import { createClient } from '@supabase/supabase-js'
import { PrismaClient } from '@prisma/client'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const prisma = new PrismaClient()

const email = process.env.SUPER_ADMIN_EMAIL || 'pgsopsms@gmail.com'
const password = process.env.SUPER_ADMIN_PASSWORD || ''
const fullName = process.env.SUPER_ADMIN_NAME || 'System Administrator'
const role = 'super_admin'

async function main() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
    process.exit(1)
  }
  if (!password || password.length < 12) {
    console.error('Set SUPER_ADMIN_PASSWORD env to a strong password (12+ chars). Refusing to seed.')
    process.exit(1)
  }

  const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers()
  if (listError) {
    console.error('Failed to list users:', listError.message)
    process.exit(1)
  }
  const existingUser = existingUsers?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase())

  if (existingUser) {
    console.log('User already exists in Supabase Auth:', existingUser.email)
    const userId = existingUser.id
    await prisma.profile.upsert({
      where: { id: userId },
      update: { full_name: fullName, role, status: 'active' },
      create: { id: userId, full_name: fullName, role, status: 'active' },
    })
    console.log('Profile ensured as super_admin/active for user:', userId)
    return
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })

  if (error || !data.user) {
    console.error('Failed to create user:', error?.message)
    process.exit(1)
  }

  const userId = data.user.id
  console.log('Created super admin auth user:', userId)

  await prisma.profile.upsert({
    where: { id: userId },
    update: { full_name: fullName, role, status: 'active' },
    create: { id: userId, full_name: fullName, role, status: 'active' },
  })
  console.log('Created super_admin profile for:', email)
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
