import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'fs'
import { join } from 'path'

const prisma = new PrismaClient()

// Applies migration 27 idempotently. Safe to re-run. Runs through the
// pooler (see .env.local): statements must not contain blank lines,
// which are the chunk delimiters.
async function main() {
  const sql = readFileSync(
    join(process.cwd(), 'prisma', 'migrations', '27_ppmp_analytics_config', 'migration.sql'),
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
  const rows = await prisma.$queryRawUnsafe(
    'SELECT version, qty_increase_pct, cost_increase_pct FROM ppmp_analytics_config ORDER BY version'
  )
  console.log('VERIFY ppmp_analytics_config:', JSON.stringify(rows))
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
