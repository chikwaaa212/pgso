import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function main() {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'pgso.personnel@gmail.com',
    password: 'personnel123',
  })

  if (error) {
    console.error('Login error:', error.message)
    process.exit(1)
  }

  console.log('Login successful!')
  console.log('User:', data.user?.email)
  console.log('Session:', data.session ? 'exists' : 'none')

  await supabase.auth.signOut()
  console.log('Signed out')
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Error:', e)
    process.exit(1)
  })
