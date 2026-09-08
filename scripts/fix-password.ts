import { createClient } from '@supabase/supabase-js'
import prisma from '../src/lib/prisma'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const email = 'pgso.personnel@gmail.com'
const newPassword = 'personnel123'

async function main() {
  const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
  const existingUser = existingUsers?.users?.find(u => u.email === email)

  if (!existingUser) {
    console.log('User not found in Supabase Auth with email:', email)
    process.exit(1)
  }

  console.log('Current user:', {
    id: existingUser.id,
    email: existingUser.email,
    email_confirmed: existingUser.email_confirmed_at,
  })

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
    existingUser.id,
    { password: newPassword }
  )

  if (updateError) {
    console.error('Failed to update password:', updateError.message)
    process.exit(1)
  }

  console.log('Password updated successfully')

  const { data: updatedUser } = await supabaseAdmin.auth.admin.getUserById(existingUser.id)
  console.log('Updated user:', {
    id: updatedUser.user.id,
    email: updatedUser.user.email,
  })
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
