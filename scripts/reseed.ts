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
  const { data: listData } = await supabaseAdmin.auth.admin.listUsers()
  console.log('Total users:', listData?.users?.length)
  const existingUser = listData?.users?.find(u => u.email === email)
  console.log('Existing user found:', !!existingUser)

  if (existingUser) {
    const { error: delError } = await supabaseAdmin.auth.admin.deleteUser(existingUser.id)
    if (delError) {
      console.error('Delete error:', delError.message)
    } else {
      console.log('Deleted existing user:', existingUser.id)
    }
  }

  await prisma.profile.deleteMany({ where: { id: 'b03768b8-cd7c-4d16-8380-c0052c8d43d8' } }).catch(() => undefined)

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
    data: { id: userId, full_name: fullName, role, status: 'active' },
  })
  console.log('Created profile for user:', userId)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({ email, password })
  if (loginError) {
    console.error('Login verification failed:', loginError.message)
  } else {
    console.log('Login verified! User:', loginData.user?.email)
    await supabase.auth.signOut()
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error('Error:', e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })