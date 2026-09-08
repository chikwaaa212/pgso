import fs from 'fs'
import path from 'path'

async function main() {
  const gotruePath = path.join(__dirname, 'node_modules/@supabase/auth-js/dist/main/lib')
  const files = fs.readdirSync(gotruePath)
  console.log('Auth-js lib files:', files)

  for (const file of files) {
    if (file.endsWith('.js') && !file.endsWith('.map')) {
      const content = fs.readFileSync(path.join(gotruePath, file), 'utf8')
      if (content.includes('email_check') || content.includes('user_exists') || content.includes('instance_id') || content.includes('rpc')) {
        console.log(`\n=== ${file} ===`)
        const lines = content.split('\n')
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes('email_check') || lines[i].includes('user_exists') || lines[i].includes('instance_id') || lines[i].includes('rpc')) {
            console.log(`  ${i+1}: ${lines[i].trim().substring(0, 200)}`)
          }
        }
      }
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })