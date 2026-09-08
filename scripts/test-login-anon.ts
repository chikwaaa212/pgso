import { createClient } from '@supabase/supabase-js'

async function main() {
  const anonKey = process.env.SUPABASE_ANON_KEY!

  const supabase = createClient('https://ikbhfnaqqdcuagzfhwfu.supabase.co', anonKey)

  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'pgso.personnel@gmail.com',
    password: 'personnel123',
  })

  if (error) {
    console.log('Login error:', error.message)
    console.log('Error status:', error.status)
    console.log('Error name:', error.name)
  } else {
    console.log('Login SUCCESS!')
    console.log('User:', data.user?.email)
    console.log('User ID:', data.user?.id)
    await supabase.auth.signOut()
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })