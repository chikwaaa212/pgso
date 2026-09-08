import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  const { data: users } = await supabaseAdmin.auth.admin.listUsers()
  const user = users?.users?.find(u => u.email === 'pgso.personnel@gmail.com')
  if (!user) {
    console.log('User not found')
    return
  }
  console.log('Auth user:', user.email, user.id)

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  console.log('Profile:', profile)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })