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
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const servicePayload = JSON.parse(base64UrlDecode(serviceKey.split('.')[1]))
  console.log('Service key ref:', servicePayload.ref)

  const legacySecret = process.env.SUPABASE_SERVICE_ROLE_SECRET
  const now = Math.floor(Date.now() / 1000)

  // Test with correct ref using legacy secret
  const jwt = createJWT(
    { iss: 'supabase', ref: 'ikbhfnaqqdcuagzfhwfu', role: 'service_role', iat: now, exp: now + 3600 },
    legacySecret
  )

  const supabase = createClient('https://ikbhfnaqqdcuagzfhwfu.supabase.co', jwt)
  const { data, error } = await supabase.auth.admin.listUsers()
  console.log(`Correct ref with legacy secret: ${error ? 'FAIL ' + error.message : 'SUCCESS ' + data.users.length + ' users'}`)

  if (error?.message === 'Invalid API key') {
    // Try with the service key's own ref
    const jwt2 = createJWT(
      { iss: 'supabase', ref: servicePayload.ref, role: 'service_role', iat: now, exp: now + 3600 },
      legacySecret
    )
    const supabase2 = createClient(`https://${servicePayload.ref}.supabase.co`, jwt2)
    const { data: data2, error: error2 } = await supabase2.auth.admin.listUsers()
    console.log(`Service ref with legacy secret: ${error2 ? 'FAIL ' + error2.message : 'SUCCESS ' + data2.users.length + ' users'}`)
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })