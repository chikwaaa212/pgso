import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'fs'
import { join } from 'path'

const prisma = new PrismaClient()

// Applies migration 22 statements idempotently (IF NOT EXISTS guards).
// Safe to re-run. Runs through the pooler (see .env.local): statements
// must not contain blank lines, which are the chunk delimiters.
async function main() {
  const sql = readFileSync(
    join(process.cwd(), 'prisma', 'migrations', '22_asset_custom_fields', 'migration.sql'),
    'utf8'
  )
  // Split on blank lines: keeps each DDL statement intact.
  const parts = sql.split(/\n\s*\n/)
  for (const raw of parts) {
    // Strip full-line comments; a chunk may start with header comments.
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
  const fields = await prisma.$queryRawUnsafe(
    'SELECT count(*)::int AS n FROM asset_custom_fields'
  )
  console.log('VERIFY asset_custom_fields:', JSON.stringify(fields))
  const cols = await prisma.$queryRawUnsafe(
    `SELECT table_name, column_name FROM information_schema.columns WHERE table_name IN ('assets', 'inventory') AND column_name = 'custom_fields' ORDER BY table_name`
  )
  console.log('VERIFY custom_fields columns:', JSON.stringify(cols))
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
