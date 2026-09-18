import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'fs'
import { join } from 'path'

const prisma = new PrismaClient()

// Applies migration 19 statements idempotently (IF NOT EXISTS /
// IF EXISTS / policy-drop guards). Safe to re-run. Runs through the
// pooler (see .env.local): statements must not contain blank lines,
// which are the chunk delimiters.
async function main() {
  const sql = readFileSync(
    join(process.cwd(), 'prisma', 'migrations', '19_ppmp_files', 'migration.sql'),
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
  const files = await prisma.$queryRawUnsafe(
    'SELECT count(*)::int AS n FROM ppmp_files'
  )
  console.log('VERIFY ppmp_files:', JSON.stringify(files))
  const bucket = await prisma.$queryRawUnsafe(
    "SELECT id, public FROM storage.buckets WHERE id = 'ppmp-files'"
  )
  console.log('VERIFY bucket:', JSON.stringify(bucket))
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
