import { createHmac } from 'crypto'
import { createClient } from '@supabase/supabase-js'

function base64UrlDecode(data: string): string {
  return Buffer.from(data, 'base64url').toString('utf8')
}

function createJWT(payload: object, secret: string): string {
  const header = { alg: 'HS256', typ: 'JWT' }
  const headerEncoded = Buffer.from(JSON.stringify(header)).toString('base64url')
  const payloadEncoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', secret)
    .update(`${headerEncoded}.${payloadEncoded}`)
    .digest('base64url')
  return `${headerEncoded}.${payloadEncoded}.${signature}`
}

async function main() {
  const legacySecret = process.env.SUPABASE_SERVICE_ROLE_SECRET!
  const now = Math.floor(Date.now() / 1000)
  const ref = 'ikbhfnaqqdcuagzfhwfu'

  // Try different secret formats
  const secrets = [
    legacySecret,
    'sb_secret_' + legacySecret,
    legacySecret.replace(/=/g, ''),
    legacySecret.replace(/==$/, ''),
  ]

  for (const secret of secrets) {
    const jwt = createJWT(
      { iss: 'supabase', ref, role: 'service_role', iat: now, exp: now + 3600 },
      secret
    )
    const supabase = createClient(`https://${ref}.supabase.co`, jwt)
    const { data, error } = await supabase.auth.admin.listUsers()
    console.log(`Secret "${secret.substring(0, 30)}...": ${error ? 'FAIL ' + error.message : 'SUCCESS ' + data.users.length + ' users'}`)
  }

  // Also try the anon key directly
  const anonKey = process.env.SUPABASE_ANON_KEY!
  const supabaseAnon = createClient(`https://${ref}.supabase.co`, anonKey)
  const { data: dataA, error: errorA } = await supabaseAnon.auth.admin.listUsers()
  console.log(`Anon key: ${errorA ? 'FAIL ' + errorA.message : 'SUCCESS ' + dataA.users.length + ' users'}`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })