import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const cols = await prisma.$queryRaw<{ column_name: string; data_type: string; is_generated: string; column_default: string | null }[]>`
    SELECT column_name, data_type, is_generated, column_default FROM information_schema.columns 
    WHERE table_schema = 'auth' AND table_name = 'users'
    ORDER BY ordinal_position
  `
  console.log('User columns:')
  for (const c of cols) console.log(`  ${c.column_name} (${c.data_type}) generated=${c.is_generated} default=${c.column_default}`)

  const identCols = await prisma.$queryRaw<{ column_name: string; data_type: string; is_generated: string; column_default: string | null }[]>`
    SELECT column_name, data_type, is_generated, column_default FROM information_schema.columns 
    WHERE table_schema = 'auth' AND table_name = 'identities'
    ORDER BY ordinal_position
  `
  console.log('Identity columns:')
  for (const c of identCols) console.log(`  ${c.column_name} (${c.data_type}) generated=${c.is_generated} default=${c.column_default}`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) }).finally(async () => { await prisma.$disconnect() })