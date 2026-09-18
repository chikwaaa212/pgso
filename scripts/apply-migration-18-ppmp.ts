import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'fs'
import { join } from 'path'

const prisma = new PrismaClient()

// Applies migration 18 statements idempotently (IF NOT EXISTS guards).
// Safe to re-run. Used because `prisma migrate dev` needs a shadow DB
// and the direct DB host is unreachable from this network (IPv6-only).
async function main() {
  const sql = readFileSync(
    join(process.cwd(), 'prisma', 'migrations', '18_ppmp_items', 'migration.sql'),
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
    console.log('RUN len=' + stmt.length + ' head=' + JSON.stringify(stmt.slice(0, 80)))
    await prisma.$executeRawUnsafe(stmt)
    console.log('OK:', (stmt.split('\n')[0] ?? stmt.slice(0, 60)).slice(0, 90))
  }
  const check = await prisma.$queryRawUnsafe(
    "SELECT to_regclass('public.ppmp_items') AS tbl"
  )
  console.log('VERIFY:', JSON.stringify(check))
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
