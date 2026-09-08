import { createClient } from '@supabase/supabase-js'
import { PrismaClient } from '@prisma/client'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const prisma = new PrismaClient()

const email = 'pgso.personnel@gmail.com'
const password = 'personnel123'
const fullName = 'Personnel User'
const role = 'pgso_personnel'

async function main() {
  const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
  const existingUser = existingUsers?.users?.find(u => u.email === email)

  if (existingUser) {
    console.log('User already exists in Supabase Auth:', existingUser.email)
    const userId = existingUser.id
    await prisma.profile.upsert({
      where: { id: userId },
      update: { full_name: fullName, role, status: 'active' },
      create: { id: userId, full_name: fullName, role, status: 'active' },
    })
    console.log('Profile ensured for user:', userId)
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
  console.log('Created user:', userId)

  await prisma.profile.create({
    data: {
      id: userId,
      full_name: fullName,
      role,
      status: 'active',
    },
  })
  console.log('Created profile for user:', userId)
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
