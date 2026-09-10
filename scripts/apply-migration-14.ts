import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'fs'
import { join } from 'path'

const prisma = new PrismaClient()

// Applies migration 14 statements idempotently (IF NOT EXISTS guards).
// Safe to re-run. Used because `prisma migrate dev` needs a shadow DB.
async function main() {
  const sql = readFileSync(
    join(process.cwd(), 'prisma', 'migrations', '14_request_items_profile_posting', 'migration.sql'),
    'utf8'
  )
  // Split on blank lines: keeps the DO $$ ... END $$ block intact
  // (it contains inner semicolons but no blank lines).
  const parts = sql.split(/\n\s*\n/)
  for (const raw of parts) {
    // Strip full-line comments; a chunk may start with header comments.
    const stmt = raw
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n')
      .trim()
    if (!stmt) continue
    await prisma.$executeRawUnsafe(stmt)
    console.log('OK:', (stmt.split('\n')[0] ?? stmt.slice(0, 60)).slice(0, 90))
  }
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
