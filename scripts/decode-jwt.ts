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
  const anonKey = process.env.SUPABASE_ANON_KEY!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

  const anonPayload = JSON.parse(base64UrlDecode(anonKey.split('.')[1]))
  const servicePayload = JSON.parse(base64UrlDecode(serviceKey.split('.')[1]))

  console.log('Anon key ref:', anonPayload.ref)
  console.log('Service key ref:', servicePayload.ref)
  console.log('URL ref: ikbhfnaqqdcuagzfhwfu')
  console.log('Match?', anonPayload.ref === 'ikbhfnaqqdcuagzfhwfu')

  const secret = process.env.SUPABASE_SERVICE_ROLE_SECRET
  const now = Math.floor(Date.now() / 1000)

  const secretFormats = [secret, secret.replace('sb_secret_', '')]
  const projectRefs = ['ikbhfnaqqdcuagzfhwfu', anonPayload.ref]

  for (const ref of projectRefs) {
    for (const sec of secretFormats) {
      const jwt = createJWT(
        { iss: 'supabase', ref, role: 'service_role', iat: now, exp: now + 3600 },
        sec
      )
      const supabase = createClient('https://ikbhfnaqqdcuagzfhwfu.supabase.co', jwt)
      const { data, error } = await supabase.auth.admin.listUsers()
      console.log(`ref=${ref} secret=${sec.substring(0, 20)}...: ${error ? 'FAIL ' + error.message : 'SUCCESS ' + data.users.length + ' users'}`)
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })