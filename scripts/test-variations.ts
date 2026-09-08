import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function main() {
  const email = 'pgso.personnel@gmail.com'
  const password = 'personnel123'

  const variations = [
    email,
    email.toUpperCase(),
    email.trim(),
    ' ' + email,
    email + ' ',
  ]

  for (const e of variations) {
    const { data, error } = await supabase.auth.signInWithPassword({ email: e, password })
    console.log(`Email "${JSON.stringify(e)}": ${error ? error.message : 'SUCCESS ' + data.user?.id}`)
  }

  const { data: data2, error: error2 } = await supabase.auth.signInWithPassword({ email, password: 'wrongpass123' })
  console.log(`Wrong password: ${error2 ? error2.message : 'SUCCESS'}`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })