import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Check instances table schema
  const cols = await prisma.$queryRaw<{ column_name: string; data_type: string; is_nullable: string }[]>`
    SELECT column_name, data_type, is_nullable FROM information_schema.columns 
    WHERE table_schema = 'auth' AND table_name = 'instances'
    ORDER BY ordinal_position
  `
  console.log('Instances columns:', cols)

  // Check users table schema for required columns
  const userCols = await prisma.$queryRaw<{ column_name: string; data_type: string; is_nullable: string; column_default: string | null }[]>`
    SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns 
    WHERE table_schema = 'auth' AND table_name = 'users'
    ORDER BY ordinal_position
  `
  console.log('Users columns:', userCols)
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