import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'fs'
import { join } from 'path'

const prisma = new PrismaClient()

// Applies migration 29 idempotently. Safe to re-run. Runs through the
// pooler (see .env.local): statements must not contain blank lines,
// which are the chunk delimiters.
async function main() {
  const sql = readFileSync(
    join(process.cwd(), 'prisma', 'migrations', '29_ppmp_quarterly', 'migration.sql'),
    'utf8'
  )
  const parts = sql.split(/\n\s*\n/)
  for (const raw of parts) {
    const stmt = raw
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n')
      .trim()
      .replace(/;$/, '')
    if (!stmt) continue
    console.log('RUN ' + stmt.slice(0, 80).replace(/\s+/g, ' '))
    await prisma.$executeRawUnsafe(stmt)
    console.log('OK')
  }
  const cols = await prisma.$queryRawUnsafe(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'ppmp_analysis_results' AND column_name = 'quarterly'"
  )
  console.log('VERIFY quarterly col:', JSON.stringify(cols))
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
